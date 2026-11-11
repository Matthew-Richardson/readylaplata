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
  // Choose a point inside the largest polygon, including concave shapes and holes.
  function interiorPointForFeature(feature){
    const geometry=feature.geometry,polygons=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:[];
    let best=null,bestArea=-1;
    for(const rings of polygons){
      const ring=rings[0];if(!ring?.length)continue;
      let ymin=Infinity,ymax=-Infinity;for(const coordinate of ring){ymin=Math.min(ymin,coordinate[1]);ymax=Math.max(ymax,coordinate[1]);}
      let area=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++)area+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];area=Math.abs(area);
      if(area<=bestArea)continue;
      let candidate=null,score=-1;
      for(const fraction of [.5,.375,.625,.25,.75,.125,.875]){
        const y=ymin+(ymax-ymin)*fraction,crossings=[];
        for(const boundary of rings)for(let i=0,j=boundary.length-1;i<boundary.length;j=i++){
          const a=boundary[j],b=boundary[i];if((a[1]>y)!==(b[1]>y))crossings.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
        }
        crossings.sort((a,b)=>a-b);
        for(let i=0;i+1<crossings.length;i+=2){
          const width=crossings[i+1]-crossings[i],value=width*(1-Math.abs(fraction-.5));
          if(width>0&&value>score){score=value;candidate={lat:y,lng:(crossings[i]+crossings[i+1])/2};}
        }
      }
      if(candidate){best=candidate;bestArea=area;}
    }
    return best;
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
      layer.outFields=['*'];layer.maxScale=0;
      const existing=String(layer.definitionExpression||'').trim();
      layer.definitionExpression=existing?'('+existing+') AND ('+C.zonesWhere+')':C.zonesWhere;
      try{await layer.load();if(!layer.fields?.some(field=>field.name.toUpperCase()==='LIVE')){layer.visible=false;$('mapMessage').textContent='Live evacuation-zone information is temporarily unavailable.';}}
      catch(error){layer.visible=false;console.warn('Live evacuation-zone layer:',error);}
    }
    const roads=all().find(l=>l.type==='vector-tile'&&/^(county )?roads$/i.test(l.title||''));
    const roadInfo=all().find(l=>matches(l,C.roadClosuresUrl)),pois=all().find(l=>matches(l,C.evacPoisUrl));
    // Incident summaries are lightweight markers above the native operational layers.
    const incidentPins=new GraphicsLayer({title:'Active incidents',listMode:'hide',popupEnabled:false});webmap.add(incidentPins);
    // Keep the searched-address marker above incident summaries.
    const address=new GraphicsLayer({title:'Searched address',listMode:'hide',popupEnabled:false});
    webmap.add(address);
    const view=new MapView({container,map:webmap,extent:new Extent({xmin:C.countyBounds[0][1],ymin:C.countyBounds[0][0],xmax:C.countyBounds[1][1],ymax:C.countyBounds[1][0],spatialReference:{wkid:4326}}),constraints:{rotationEnabled:false,snapToZoom:false},popup:{dockEnabled:false}});
    const labelContainer=$('incidentMapLabels'),labelEntries=[];
    const publishedLabels=new Map(zoneLayers.map(layer=>[layer,layer.labelsVisible!==false]));
    function positionIncidentLabels(){
      const overview=!Number.isFinite(view.scale)||view.scale>=(C.incidentLabelScale||75000);
      incidentPins.visible=overview;
      for(const layer of zoneLayers)layer.labelsVisible=overview?false:publishedLabels.get(layer);
      if(!labelContainer)return;
      const occupied=[],placed=[],padding=view.padding||{},top=(padding.top||0)+8,bottom=(view.height||0)-(padding.bottom||0)-8;
      for(const entry of labelEntries){
        const screen=view.toScreen(entry.point);entry.button.hidden=!overview||!screen||screen.x<0||screen.y<0||screen.x>view.width||screen.y>view.height;entry.leader.hidden=true;
        if(entry.button.hidden)continue;
        const width=entry.button.offsetWidth||180,height=entry.button.offsetHeight||50;
        const x=Math.max(width/2+8,Math.min(screen.x,view.width-width/2-86));let y=screen.y;
        for(const offset of [0,-1,1,-2,2,-3,3]){
          const next=screen.y+offset*(height+8),rect={left:x-width/2,right:x+width/2,top:next-height/2,bottom:next+height/2};
          if(rect.top<top||rect.bottom>bottom)continue;
          if(occupied.some(other=>rect.left<other.right+6&&rect.right>other.left-6&&rect.top<other.bottom+6&&rect.bottom>other.top-6))continue;
          y=next;break;
        }
        occupied.push({left:x-width/2,right:x+width/2,top:y-height/2,bottom:y+height/2});
        entry.button.style.left=x+'px';entry.button.style.top=y+'px';
        placed.push({entry,screen,rect:occupied[occupied.length-1]});
      }
      // Draw a straight connector after placement; the shared leader layer stays below every plate.
      for(const {entry,screen,rect} of placed){
        entry.leader.replaceChildren();
        if(screen.x>=rect.left&&screen.x<=rect.right&&screen.y>=rect.top&&screen.y<=rect.bottom)continue;
        const end={x:Math.max(rect.left,Math.min(screen.x,rect.right)),y:Math.max(rect.top,Math.min(screen.y,rect.bottom))};
        const points=[screen,end];
        for(let i=1;i<points.length;i++){
          const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.y-a.y);if(length<1)continue;
          const segment=document.createElement('span');segment.className='incident-area-leader';
          Object.assign(segment.style,{left:a.x+'px',top:a.y+'px',width:length+'px',transform:'rotate('+Math.atan2(b.y-a.y,b.x-a.x)+'rad)'});entry.leader.appendChild(segment);
        }
        entry.leader.hidden=!entry.leader.children.length;
      }
    }
    reactiveUtils.watch(()=>[view.extent,view.scale,view.width,view.height,view.padding],positionIncidentLabels);
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
      if(typeof onIncident!=='function')return;
      const request=++zoneClick,point=event.mapPoint||view.toMap?.({x:event.x,y:event.y});
      const open=name=>{
        if(request!==zoneClick)return;
        view.closePopup();
        if($('mapMessage').dataset.zoneSelection)$('mapMessage').textContent='';
        delete $('mapMessage').dataset.zoneSelection;
        onIncident(name,point?[point.latitude,point.longitude]:undefined);
      };
      try{
        const hit=await view.hitTest(event,{include:[incidentPins,...zoneLayers]});if(request!==zoneClick)return;
        for(const result of hit.results||[]){
          const graphic=result.graphic;if(!graphic)continue;
          if(graphic.layer===incidentPins&&graphic.attributes?.incident){open(graphic.attributes.incident);return;}
          if(!zoneLayers.includes(graphic.layer))continue;
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
    try{await view.when();ready=true;view.ui?.remove?.('zoom');view.ui?.move?.('attribution','manual');}catch(error){view.destroy();for(const id of ['roadsToggle','roadLayerToggle','poiLayerToggle'])$(id).disabled=true;throw error;}
    return {
      raw:view,operationalLayers,
      setOverlayPadding({top,bottom,compact=false}){const vertical=Math.max(top,bottom);view.padding=compact?{top:vertical,bottom:vertical,left:12,right:12}:{top,bottom,left:16,right:84};positionIncidentLabels();},
      setIncidents(incidents){
        incidentPins.removeAll();labelEntries.length=0;labelContainer?.replaceChildren();
        for(const incident of incidents){
          const point=new Point({longitude:incident.point.lng,latitude:incident.point.lat});
          incidentPins.add(new Graphic({geometry:point,attributes:{incident:incident.name},symbol:{type:'simple-marker',style:'circle',size:14,color:'#174f8a',outline:{color:'#fff',width:2.5}}}));
          if(!labelContainer)continue;
          const button=document.createElement('button'),title=document.createElement('strong'),dots=document.createElement('span'),leader=document.createElement('span');
          button.type='button';button.className='incident-area-label';const primary=window.ReadyLaPlataZones.styles[incident.statuses[0]];if(primary)button.style.setProperty('--incident-edge',primary.stroke);title.textContent=incident.name;dots.className='incident-area-dots';dots.setAttribute('aria-hidden','true');leader.className='incident-area-leaders';leader.setAttribute('aria-hidden','true');leader.hidden=true;
          const labels=[];
          for(const status of incident.statuses){
            const style=window.ReadyLaPlataZones.styles[status];if(!style)continue;labels.push(style.label);
            const dot=document.createElement('span');dot.className='incident-area-dot';dot.style.background=style.fill||style.stroke;dot.style.borderColor=style.stroke;dot.title=style.label;if(style.hatch)dot.classList.add('access-hatch');dots.appendChild(dot);
          }
          button.setAttribute('aria-label',incident.name+'. '+labels.join(', ')+'. Open incident information');button.title=incident.name+' — '+labels.join(', ');button.append(title,dots);
          button.addEventListener('click',event=>{event.stopPropagation();onIncident?.(incident.name,[incident.point.lat,incident.point.lng]);});
          for(const type of ['pointerdown','pointerup','dblclick'])button.addEventListener(type,event=>event.stopPropagation());
          labelContainer.append(leader,button);labelEntries.push({point,button,leader});
        }
        positionIncidentLabels();
      },
      async refreshLayers(){
        // Retry failed layers as well as the normal zone/road/POI refresh.
        const retry=[...new Set([...operationalLayers,...layerErrors.keys()])];
        await Promise.allSettled(retry.map(async layer=>{await loadLayer(layer);if(layer.visible!==false&&typeof layer.refresh==='function')layer.refresh();}));
      },
      async fitBounds(bounds,options={}){const extent=extentFor(bounds),request=navigation+1;await navigate(extent.expand(options.county?1.02:1.12));if(request!==navigation)return;let zoom=view.zoom+(options.zoomOffset||0);if(options.maxZoom)zoom=Math.min(zoom,options.maxZoom);if(zoom!==view.zoom)await navigate({zoom});},
      zoomBy(delta){return navigate({zoom:view.zoom+delta});},
      setView(latlng,zoom){return navigate({center:new Point({longitude:latlng[1],latitude:latlng[0]}),zoom});},
      openSupportPopup(latlng,content){view.closePopup();return openSupportWindow(container,content);},
      closePopup(){view.closePopup();closeSupport();},invalidateSize(){/* MapView observes its container, including expanded mode. */},
      markAddress(match){const graphic=new Graphic({geometry:new Point({longitude:match.location.x,latitude:match.location.y}),symbol:{type:'simple-marker',style:'circle',size:12,color:'#174f8a',outline:{color:'#fff',width:2.5}}});address.add(graphic);return {remove(){address.remove(graphic);}};}
    };
  }
  window.ReadyLaPlataMap={create,openSupportWindow,bounds:()=>new Bounds(),boundsForFeature,interiorPointForFeature};
})();
