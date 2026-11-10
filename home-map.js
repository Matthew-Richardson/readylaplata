/* ArcGIS overview map, sharing the incident-page WebMap. */
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
  function sdk(){return new Promise((resolve,reject)=>{
    if(typeof window.require!=='function'){reject(new Error('ArcGIS SDK unavailable'));return;}
    window.require(['esri/WebMap','esri/views/MapView','esri/layers/FeatureLayer','esri/layers/VectorTileLayer','esri/layers/GraphicsLayer','esri/Graphic','esri/geometry/Extent','esri/Basemap','esri/layers/TileLayer'],(...modules)=>resolve(modules),reject);
  });}
  async function create({container,config,fields,popupFor,onIncident}){
    const [WebMap,MapView,FeatureLayer,VectorTileLayer,GraphicsLayer,Graphic,Extent,Basemap,TileLayer]=await sdk();
    const map=new WebMap({portalItem:{id:config.webmapId}});await map.load();
    map.basemap=new Basemap({baseLayers:[new TileLayer({url:config.basemapTilesUrl.split('/tile/')[0],title:'Unlabeled terrain'})],title:'Terrain'});
    const normalize=url=>String(url||'').toLowerCase().replace(/\/$/,'');
    const find=url=>map.allLayers.find(layer=>normalize(layer.url)===normalize(url));
    let zoneLayer=find(config.zonesUrl);
    if(!zoneLayer){zoneLayer=new FeatureLayer({url:config.zonesUrl});map.add(zoneLayer);}
    await zoneLayer.load();zoneLayer.outFields=['*'];zoneLayer.visible=true;zoneLayer.opacity=0.65;
    zoneLayer.renderer=window.ReadyLaPlataZones.renderer(fields.status);
    zoneLayer.labelsVisible=!!fields.zone;
    if(fields.zone)zoneLayer.labelingInfo=[{labelExpressionInfo:{expression:'$feature["'+fields.zone+'"]'},labelPlacement:'always-horizontal',deconflictionStrategy:'none',symbol:{type:'text',color:'#1d2f43',haloColor:'#fff',haloSize:1.5,font:{family:'Arial',size:10,weight:'bold'}}}];
    zoneLayer.popupEnabled=true;zoneLayer.popupTemplate={title:'{'+fields.incident+'}',outFields:['*'],content:event=>{
      const properties=event.graphic.attributes;return popupFor(String(properties[fields.incident]||'Incident'),{properties});
    }};
    // Use the WebMap's native road styles and labels; add missing sources only once.
    let roads=find(config.roadsTilesUrl.split('/tile/')[0]);
    if(!roads){roads=new VectorTileLayer({url:config.roadsTilesUrl.split('/tile/')[0],title:'County roads'});map.add(roads,0);}
    let roadInfo=find(config.roadClosuresUrl);if(!roadInfo){roadInfo=new FeatureLayer({url:config.roadClosuresUrl,title:'Road information'});map.add(roadInfo);}
    let pois=find(config.evacPoisUrl);if(!pois){pois=new FeatureLayer({url:config.evacPoisUrl,title:'Information'});map.add(pois);}
    const failures=new Set();let mapFailed=false;
    function report(){if(mapFailed)return;const node=document.getElementById('mapMessage');if(failures.size)node.textContent='Some layers are unavailable: '+Array.from(failures).join(', ')+'.';}
    function attach(layer,toggle,title){
      let parent=layer.parent;while(parent&&parent.type==='group'){parent.visible=true;parent=parent.parent;}
      layer.visible=document.getElementById(toggle).checked;
      document.getElementById(toggle).addEventListener('change',()=>layer.visible=document.getElementById(toggle).checked);
      layer.load().catch(error=>{if(mapFailed)return;console.warn(title,error);failures.add(title);report();});
    }
    attach(roads,'roadsToggle','County roads');attach(roadInfo,'roadLayerToggle','Road information');attach(pois,'poiLayerToggle','Information');
    for(const [layer,name] of [[roadInfo,'roadstatus'],[pois,'pointtype']]){
      layer.load().then(()=>{const field=layer.fields.find(f=>f.name.toLowerCase()===name);if(field)layer.definitionExpression=field.name+" IS NULL OR LOWER("+field.name+") <> 'inactive'";}).catch(()=>{});
    }
    const pins=new GraphicsLayer({title:'Incidents',listMode:'hide'}),addressGraphics=new GraphicsLayer({title:'Searched address',listMode:'hide'});
    map.addMany([pins,addressGraphics]);
    const raw=new MapView({container,map,constraints:{rotationEnabled:false},popup:{dockEnabled:false,defaultPopupTemplateEnabled:true},navigation:{mouseWheelZoomEnabled:true,browserTouchPanEnabled:false}});
    try{await raw.when();}catch(error){mapFailed=true;raw.destroy();throw error;}
    raw.ui.move('zoom','top-left');
    const point=p=>({type:'point',longitude:p.lng,latitude:p.lat,spatialReference:{wkid:4326}});
    function go(target){return raw.goTo(target,{animate:false}).catch(error=>{if(error.name!=='AbortError')console.warn('Map navigation',error);});}
    const api={
      raw,operationalLayers:[zoneLayer,roadInfo,pois],
      fitBounds(bounds,options={}){
        const b=Array.isArray(bounds)?{xmin:bounds[0][1],ymin:bounds[0][0],xmax:bounds[1][1],ymax:bounds[1][0]}:bounds;
        if(![b.xmin,b.ymin,b.xmax,b.ymax].every(Number.isFinite))return;
        return go(new Extent({xmin:b.xmin,ymin:b.ymin,xmax:b.xmax,ymax:b.ymax,spatialReference:{wkid:4326}}).expand(1.12));
      },
      setView(latlng,zoom){return go({center:[latlng[1],latlng[0]],zoom});},
      closePopup(){raw.closePopup();},invalidateSize(){/* MapView observes container changes. */},
      refreshZones(){zoneLayer.refresh();},
      renderIncidents(incidents){
        pins.removeAll();
        for(const [name,entry] of incidents){
          if(!entry.extent.isValid())continue;
          entry.point=entry.extent.getCenter();const geometry=point(entry.point);
          const popupTemplate={title:name,content:()=>popupFor(name)};
          const pin=new Graphic({geometry,attributes:{overviewIncident:name},symbol:{type:'simple-marker',style:'diamond',color:'#0b4da2',size:13,outline:{color:'#fff',width:1.5}},popupTemplate});
          const text=new Graphic({geometry,attributes:{overviewIncident:name},symbol:{type:'text',text:name,color:'#153657',haloColor:'#fff',haloSize:2,font:{family:'Arial',size:10,weight:'bold'},horizontalAlignment:'left',verticalAlignment:'middle',xoffset:13,yoffset:0},popupTemplate});
          pins.addMany([pin,text]);entry.marker={openPopup:()=>raw.openPopup({features:[pin],location:geometry})};
        }
      },
      markAddress(match){
        addressGraphics.removeAll();const graphic=new Graphic({geometry:{type:'point',longitude:match.location.x,latitude:match.location.y,spatialReference:{wkid:4326}},symbol:{type:'simple-marker',style:'circle',color:'#174f8a',size:12,outline:{color:'#fff',width:2}},popupTemplate:{title:match.address,content:'Searched address (approximate location).'}});addressGraphics.add(graphic);
        return {remove(){addressGraphics.remove(graphic);}};
      }
    };
    raw.on('click',async event=>{const result=await raw.hitTest(event,{include:pins});const graphic=result.results.find(r=>r.type==='graphic')?.graphic;if(graphic?.attributes?.overviewIncident)onIncident(graphic.attributes.overviewIncident);});
    return api;
  }
  window.ReadyLaPlataMap={create,bounds:()=>new Bounds(),boundsForFeature};
})();
