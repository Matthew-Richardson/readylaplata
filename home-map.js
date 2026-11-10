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
  async function create({container,config:C,fields,popupFor,onIncident}){
    if(typeof window.require!=='function')throw new Error('ArcGIS Maps SDK could not load');
    const [WebMap,MapView,FeatureLayer,GraphicsLayer,Graphic,Point,Extent,VectorTileLayer,reactiveUtils]=await new Promise((resolve,reject)=>window.require([
      'esri/WebMap','esri/views/MapView','esri/layers/FeatureLayer','esri/layers/GraphicsLayer','esri/Graphic','esri/geometry/Point','esri/geometry/Extent','esri/layers/VectorTileLayer','esri/core/reactiveUtils'
    ],(...modules)=>resolve(modules),reject));
    const Z=window.ReadyLaPlataZones,$=id=>document.getElementById(id);
    const webmap=new WebMap({portalItem:{id:C.webmapId}});
    await webmap.load();
    const all=()=>webmap.allLayers.toArray();
    const matches=(layer,url)=>String(layer.url||'').replace(/\/$/,'').toLowerCase()===url.replace(/\/$/,'').toLowerCase();
    const ensureFeature=(url,title)=>{let layer=all().find(l=>matches(l,url));if(!layer){layer=new FeatureLayer({url,title,outFields:['*']});webmap.add(layer);}return layer;};
    const zones=ensureFeature(C.zonesUrl,'Evacuation zones');
    zones.outFields=['*'];zones.renderer=Z.renderer(fields.status);zones.labelsVisible=true;
    zones.labelingInfo=[{labelExpressionInfo:{expression:'Text($feature['+JSON.stringify(fields.zone||'zonename')+'])'},labelPlacement:'always-horizontal',minScale:0,maxScale:0,symbol:{type:'text',color:'#1d2f43',haloColor:'#ffffff',haloSize:1.5,font:{family:'Arial',size:10,weight:'bold'}}}];
    zones.popupTemplate={title:'{'+fields.incident+'}',outFields:['*'],content:event=>popupFor(String(event.graphic.attributes[fields.incident]||'Incident'),{attributes:event.graphic.attributes})};
    let roads=all().find(l=>l.type==='vector-tile'&&/^(county )?roads$/i.test(l.title||''));
    if(!roads){roads=new VectorTileLayer({url:C.roadsServiceUrl,title:'County roads'});webmap.add(roads);}
    const roadInfo=ensureFeature(C.roadClosuresUrl,'Road information'),pois=ensureFeature(C.evacPoisUrl,'Evacuation information');
    const pins=new GraphicsLayer({title:'Incident locations',listMode:'hide',popupEnabled:false});
    const address=new GraphicsLayer({title:'Searched address',listMode:'hide',popupEnabled:false});
    webmap.addMany([pins,address]);
    const view=new MapView({container,map:webmap,extent:new Extent({xmin:C.countyBounds[0][1],ymin:C.countyBounds[0][0],xmax:C.countyBounds[1][1],ymax:C.countyBounds[1][0],spatialReference:{wkid:4326}}),constraints:{rotationEnabled:false},popup:{autoOpenEnabled:false,dockEnabled:false}});
    let ready=false,navigation=0;
    const operationalLayers=[zones,roadInfo,pois];
    function closeSupport(){activeSupport?.remove();}
    function navigate(target){
      if(!ready)return Promise.resolve();const id=++navigation;
      return view.goTo(target,{animate:false}).catch(error=>{if(id===navigation&&error.name!=='AbortError')console.warn('Map navigation:',error);});
    }
    function extentFor(bounds){return new Extent({xmin:Array.isArray(bounds)?bounds[0][1]:bounds.xmin,ymin:Array.isArray(bounds)?bounds[0][0]:bounds.ymin,xmax:Array.isArray(bounds)?bounds[1][1]:bounds.xmax,ymax:Array.isArray(bounds)?bounds[1][0]:bounds.ymax,spatialReference:{wkid:4326}});}
    const reportLayerError=()=>{$('mapMessage').textContent='Some AGOL map layers could not load. Use Refresh to try again.';};
    for(const [id,layer] of [['roadsToggle',roads],['roadLayerToggle',roadInfo],['poiLayerToggle',pois]]){
      const control=$(id);control.checked=layer.visible!==false;
      control.addEventListener('change',()=>{layer.visible=control.checked;if(control.checked){let parent=layer.parent;while(parent&&parent.type==='group'){parent.visible=true;parent=parent.parent;}}});
      reactiveUtils.watch(()=>layer.visible,visible=>control.checked=visible);
      layer.load().catch(reportLayerError);
    }
    view.on('layerview-create-error',reportLayerError);
    view.on('click',async event=>{
      try{const result=await view.hitTest(event);const hit=result.results.find(r=>r.type==='graphic'&&r.graphic.layer===pins);if(hit){view.closePopup();onIncident(hit.graphic.attributes.incident,hit.graphic.geometry);return;}const feature=result.results.find(r=>r.type==='graphic'&&r.graphic.layer?.popupEnabled!==false&&(r.graphic.popupTemplate||r.graphic.layer?.popupTemplate));if(feature){closeSupport();view.openPopup({features:[feature.graphic],location:event.mapPoint});}}catch(error){console.warn('Incident map selection:',error);}
    });
    try{await view.when();ready=true;}catch(error){view.destroy();for(const id of ['roadsToggle','roadLayerToggle','poiLayerToggle'])$(id).disabled=true;throw error;}
    return {
      raw:view,operationalLayers,
      async fitBounds(bounds,options={}){const extent=extentFor(bounds),request=navigation+1;await navigate(extent.expand(1.12));if(request===navigation&&options.maxZoom&&view.zoom>options.maxZoom)await navigate({zoom:options.maxZoom});},
      setView(latlng,zoom){return navigate({center:new Point({longitude:latlng[1],latitude:latlng[0]}),zoom});},
      openSupportPopup(latlng,content){view.closePopup();return openSupportWindow(container,content);},
      closePopup(){view.closePopup();closeSupport();},invalidateSize(){/* MapView observes its container, including expanded mode. */},
      renderZones(){/* Zones and labels come directly from the AGOL FeatureLayer. */},
      renderIncidents(incidents){
        pins.removeAll();
        for(const [name,entry] of incidents){if(!entry.extent.isValid())continue;entry.point=entry.extent.getCenter();
          const geometry=new Point({longitude:entry.point.lng,latitude:entry.point.lat}),attributes={incident:name};
          const marker=new Graphic({geometry,attributes,symbol:{type:'simple-marker',style:'diamond',size:13,color:'#0b4da2',outline:{color:'#fff',width:1.8}}});
          const label=new Graphic({geometry,attributes,symbol:{type:'text',text:name,color:'#153657',haloColor:'#fff',haloSize:2,horizontalAlignment:'left',verticalAlignment:'middle',xoffset:12,font:{family:'Arial',size:10,weight:'bold'}}});
          pins.addMany([marker,label]);entry.marker=marker;
        }
        webmap.reorder(pins,webmap.layers.length-1);webmap.reorder(address,webmap.layers.length-1);
      },
      markAddress(match){const graphic=new Graphic({geometry:new Point({longitude:match.location.x,latitude:match.location.y}),symbol:{type:'simple-marker',style:'circle',size:12,color:'#174f8a',outline:{color:'#fff',width:2.5}}});address.add(graphic);return {remove(){address.remove(graphic);}};}
    };
  }
  window.ReadyLaPlataMap={create,openSupportWindow,bounds:()=>new Bounds(),boundsForFeature};
})();
