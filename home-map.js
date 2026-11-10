/* ArcGIS Online WebMap adapter for the public overview and incident controls. */
(function(){
  'use strict';
  class Bounds{
    constructor(){this.xmin=Infinity;this.ymin=Infinity;this.xmax=-Infinity;this.ymax=-Infinity;}
    extend(other){if(other?.isValid()){this.xmin=Math.min(this.xmin,other.xmin);this.ymin=Math.min(this.ymin,other.ymin);this.xmax=Math.max(this.xmax,other.xmax);this.ymax=Math.max(this.ymax,other.ymax);}return this;}
    isValid(){return [this.xmin,this.ymin,this.xmax,this.ymax].every(Number.isFinite);}
    getCenter(){return {lat:(this.ymin+this.ymax)/2,lng:(this.xmin+this.xmax)/2};}
  }
  function boundsForFeature(feature){
    const b=new Bounds();
    function visit(c){if(!Array.isArray(c))return;if(typeof c[0]==='number'&&typeof c[1]==='number'){b.xmin=Math.min(b.xmin,c[0]);b.xmax=Math.max(b.xmax,c[0]);b.ymin=Math.min(b.ymin,c[1]);b.ymax=Math.max(b.ymax,c[1]);}else c.forEach(visit);}
    visit(feature.geometry?.coordinates);return b;
  }
  let activeSupport=null;
  function openSupportWindow(container,content){
    activeSupport?.remove();
        const panel=document.createElement('section'),close=document.createElement('button'),previousFocus=document.activeElement;
        panel.className='incident-support-window';panel.setAttribute('role','region');panel.setAttribute('aria-label',content.getAttribute('aria-label')||'Incident support resources');
        close.type='button';close.className='incident-support-close';close.textContent='×';close.setAttribute('aria-label','Close incident support resources');
        const remove=()=>{const hadFocus=panel.contains(document.activeElement);panel.remove();if(activeSupport===handle)activeSupport=null;if(hadFocus&&previousFocus?.isConnected)previousFocus.focus({preventScroll:true});};
        const handle={isOpen:()=>panel.isConnected,remove,update(){}};
        close.addEventListener('click',remove);panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();remove();}});
        for(const type of ['pointerdown','pointerup','click','dblclick','wheel','touchstart'])panel.addEventListener(type,event=>event.stopPropagation());
        panel.append(close,content);document.getElementById(container).append(panel);activeSupport=handle;close.focus({preventScroll:true});return handle;
  }
  async function create({container,config:C,onIncident}){
    if(typeof window.require!=='function')throw new Error('ArcGIS Maps SDK could not load');
    const [WebMap,MapView,GraphicsLayer,Graphic,Point,Extent,reactiveUtils]=await new Promise((resolve,reject)=>window.require([
      'esri/WebMap','esri/views/MapView','esri/layers/GraphicsLayer','esri/Graphic','esri/geometry/Point','esri/geometry/Extent','esri/core/reactiveUtils'
    ],(...modules)=>resolve(modules),reject));
    const $=id=>document.getElementById(id);
    // Keep layer failures separate from address-search messages and clear them on recovery.
    const layerErrors=new Map(),layerWarning=$('mapLayerMessage')||$('mapMessage');
    function showLayerErrors(){
      const names=[...layerErrors.keys()].filter(layer=>layer.visible!==false).map(layer=>layer.title||layer.id||'Unnamed layer');
      layerWarning.textContent=names.length?'Map layer unavailable: '+[...new Set(names)].join(', ')+'. Use Refresh to retry.':'';
    }
    function reportLayerError(layer,error,phase='load'){
      if(error?.name==='AbortError')return;
      if(!layer)return;
      const errors=layerErrors.get(layer)||new Set();errors.add(phase);layerErrors.set(layer,errors);
      console.warn('AGOL layer failed:',{title:layer.title,id:layer.id,url:layer.url,phase,error});showLayerErrors();
    }
    function clearLayerError(layer,phase){
      const errors=layerErrors.get(layer);if(!errors)return;
      errors.delete(phase);if(!errors.size)layerErrors.delete(layer);showLayerErrors();
    }
    async function loadLayer(layer){
      try{await layer.load();clearLayerError(layer,'load');}
      catch(error){reportLayerError(layer,error);}
    }
    const webmap=new WebMap({portalItem:{id:C.webmapId}});
    await webmap.load();
    const all=()=>webmap.allLayers.toArray();
    const cleanUrl=url=>String(url||'').split('?')[0].replace(/\/+$/,'').toLowerCase();
    const matches=(layer,url)=>{
      const base=cleanUrl(layer.url),target=cleanUrl(url);
      // FeatureLayer normalizes /FeatureServer/0 into url=/FeatureServer, layerId=0.
      return base===target||(Number.isInteger(layer.layerId)&&base+'/'+layer.layerId===target);
    };
    // Bind existing web map layers only. Rendering, labels and popups remain authored in AGOL.
    const zoneLayers=all().filter(l=>matches(l,C.zonesUrl));
    if(!zoneLayers.length){console.error('Configured evacuation-zone layer not found in web map:',C.zonesUrl);$('mapMessage').textContent='The evacuation-zone layer could not be identified in this map.';}

    for(const layer of zoneLayers){
      layer.outFields=['*'];
      const existing=String(layer.definitionExpression||'').trim();
      layer.definitionExpression=existing?'('+existing+') AND ('+C.zonesWhere+')':C.zonesWhere;
      try{await layer.load();if(!layer.fields?.some(field=>field.name.toUpperCase()==='LIVE')){layer.visible=false;$('mapMessage').textContent='Live evacuation-zone information is temporarily unavailable.';}}
      catch(error){layer.visible=false;console.warn('Live evacuation-zone layer:',error);}
    }
    const roads=all().find(l=>l.type==='vector-tile'&&/^(county )?roads$/i.test(l.title||''));
    const roadInfo=all().find(l=>matches(l,C.roadClosuresUrl)),pois=all().find(l=>matches(l,C.evacPoisUrl));
    // The only app graphic is a temporary marker for a searched address.
    const address=new GraphicsLayer({title:'Searched address',listMode:'hide',popupEnabled:false});
    webmap.add(address);
    const view=new MapView({container,map:webmap,extent:new Extent({xmin:C.countyBounds[0][1],ymin:C.countyBounds[0][0],xmax:C.countyBounds[1][1],ymax:C.countyBounds[1][0],spatialReference:{wkid:4326}}),constraints:{rotationEnabled:false},popup:{dockEnabled:false}});
    let ready=false,navigation=0;
    const operationalLayers=[...zoneLayers,roadInfo,pois].filter(layer=>layer&&typeof layer.refresh==='function');
    function closeSupport(){activeSupport?.remove();}
    function navigate(target){
      if(!ready)return Promise.resolve();const id=++navigation;
      return view.goTo(target,{animate:false}).catch(error=>{if(id===navigation&&error.name!=='AbortError')console.warn('Map navigation:',error);});
    }
    function extentFor(bounds){return new Extent({xmin:Array.isArray(bounds)?bounds[0][1]:bounds.xmin,ymin:Array.isArray(bounds)?bounds[0][0]:bounds.ymin,xmax:Array.isArray(bounds)?bounds[1][1]:bounds.xmax,ymax:Array.isArray(bounds)?bounds[1][0]:bounds.ymax,spatialReference:{wkid:4326}});}
    for(const [id,layer] of [['roadsToggle',roads],['roadLayerToggle',roadInfo],['poiLayerToggle',pois]]){
      const control=$(id);if(!layer){control.checked=false;control.disabled=true;continue;}control.checked=layer.visible!==false;
      control.addEventListener('change',()=>{layer.visible=control.checked;if(control.checked){let parent=layer.parent;while(parent&&parent.type==='group'){parent.visible=true;parent=parent.parent;}}});
      reactiveUtils.watch(()=>layer.visible,visible=>{control.checked=visible;showLayerErrors();});
      loadLayer(layer);
    }
    // Resolve both rendered hits and polygon interiors against the live zone service.
    let zoneClick=0;
    const fieldName=(layer,key)=>layer.fields?.find(f=>f.name.toLowerCase()===key)?.name;
    function liveIncident(layer,attributes){
      if(attributes?.[fieldName(layer,'live')]!==1)return '';
      return String(attributes[fieldName(layer,'incident')]||'').trim();
    }
    view.on('click',async event=>{
      if(typeof onIncident!=='function'||!zoneLayers.length)return;
      const request=++zoneClick,point=event.mapPoint||view.toMap?.({x:event.x,y:event.y});
      const open=name=>{
        if(request!==zoneClick)return;
        view.closePopup();
        if($('mapMessage').dataset.zoneSelection)$('mapMessage').textContent='';
        delete $('mapMessage').dataset.zoneSelection;
        onIncident(name,point?[point.latitude,point.longitude]:undefined);
      };
      try{
        const hit=await view.hitTest(event,{include:zoneLayers});if(request!==zoneClick)return;
        for(const result of hit.results||[]){
          const graphic=result.graphic;if(!graphic||!zoneLayers.includes(graphic.layer))continue;
          const name=liveIncident(graphic.layer,graphic.attributes);if(name){open(name);return;}
        }
      }catch(error){if(error.name!=='AbortError')console.warn('Zone hit test; trying spatial query:',error);}
      if(!point||request!==zoneClick)return;
      // Hit graphics can omit attributes or miss unfilled/hatched interiors.
      // A point-in-polygon service query also honors the layer's definition filters.
      const candidates=zoneLayers.filter(layer=>{
        let parent=layer;while(parent){if(parent.visible===false)return false;parent=parent.parent;}
        return fieldName(layer,'live')&&fieldName(layer,'incident');
      });
      const results=await Promise.allSettled(candidates.map(async layer=>{
        const query=layer.createQuery();
        query.where='('+String(query.where||'1=1')+') AND ('+C.zonesWhere+')';
        query.geometry=point;query.spatialRelationship='intersects';query.returnGeometry=false;
        query.outFields=[fieldName(layer,'live'),fieldName(layer,'incident')];
        const data=await layer.queryFeatures(query);return {layer,features:data.features||[]};
      }));
      if(request!==zoneClick)return;
      let unassigned=false,failed=false;
      for(const result of results){
        if(result.status==='rejected'){failed=true;console.warn('Zone spatial query:',result.reason);continue;}
        const {layer,features}=result.value;
        for(const feature of features){
          const name=liveIncident(layer,feature.attributes);if(name){open(name);return;}
          if(feature.attributes?.[fieldName(layer,'live')]===1)unassigned=true;
        }
      }
      if(unassigned||failed){
        $('mapMessage').textContent=unassigned?'This active zone has no incident assigned in the public zone layer.':'Zone information could not be loaded. Use Refresh to try again.';
        $('mapMessage').dataset.zoneSelection='true';
      }
    });
    view.on('layerview-create-error',event=>reportLayerError(event.layer,event.error,'view'));
    view.on('layerview-create',event=>clearLayerError(event.layer,'view'));
    try{await view.when();ready=true;}catch(error){view.destroy();for(const id of ['roadsToggle','roadLayerToggle','poiLayerToggle'])$(id).disabled=true;throw error;}
    return {
      raw:view,operationalLayers,
      async refreshLayers(){
        // Retry failed layers as well as the normal zone/road/POI refresh.
        const retry=[...new Set([...operationalLayers,...layerErrors.keys()])];
        await Promise.allSettled(retry.map(async layer=>{await loadLayer(layer);if(layer.visible!==false&&typeof layer.refresh==='function')layer.refresh();}));
      },
      async fitBounds(bounds,options={}){const extent=extentFor(bounds),request=navigation+1;await navigate(extent.expand(1.12));if(request===navigation&&options.maxZoom&&view.zoom>options.maxZoom)await navigate({zoom:options.maxZoom});},
      setView(latlng,zoom){return navigate({center:new Point({longitude:latlng[1],latitude:latlng[0]}),zoom});},
      openSupportPopup(latlng,content){view.closePopup();return openSupportWindow(container,content);},
      closePopup(){view.closePopup();closeSupport();},invalidateSize(){/* MapView observes its container, including expanded mode. */},
      markAddress(match){const graphic=new Graphic({geometry:new Point({longitude:match.location.x,latitude:match.location.y}),symbol:{type:'simple-marker',style:'circle',size:12,color:'#174f8a',outline:{color:'#fff',width:2.5}}});address.add(graphic);return {remove(){address.remove(graphic);}};}
    };
  }
  window.ReadyLaPlataMap={create,openSupportWindow,bounds:()=>new Bounds(),boundsForFeature};
})();
