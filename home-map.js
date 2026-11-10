/* Leaflet overview map with incident information displayed on Home. */
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
  function zoneLabelPoint(feature) {
    const geometry=feature.geometry;
    const polygons=geometry?.type==='MultiPolygon'?geometry.coordinates:geometry?.type==='Polygon'?[geometry.coordinates]:[];
    if(!polygons.length)return null;
    const area=ring=>Math.abs(ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1];},0));
    const rings=polygons.slice().sort((a,b)=>area(b[0])-area(a[0]))[0];
    const outer=rings[0];if(!outer?.length)return null;
    const xs=outer.map(p=>p[0]),ys=outer.map(p=>p[1]);
    const insideRing=(x,y,ring)=>{
      let hit=false;
      for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const a=ring[i],b=ring[j];
        if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;
      }
      return hit;
    };
    const inside=(x,y)=>insideRing(x,y,outer)&&!rings.slice(1).some(ring=>insideRing(x,y,ring));
    const x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2;
    if(inside(x,y))return [y,x];
    const orderedYs=Array.from(new Set(ys)).sort((a,b)=>a-b);
    const mids=orderedYs.slice(1).map((value,i)=>(value+orderedYs[i])/2);
    const candidateYs=[y,...(mids.length<=12?mids:Array.from({length:12},(_,i)=>mids[Math.floor(i*(mids.length-1)/11)]))];
    let best=null;
    for(const cy of candidateYs){
      const cuts=[];
      rings.forEach(ring=>ring.forEach((a,i)=>{const b=ring[(i+1)%ring.length];if((a[1]>cy)!==(b[1]>cy))cuts.push(a[0]+(cy-a[1])*(b[0]-a[0])/(b[1]-a[1]));}));
      cuts.sort((a,b)=>a-b);
      for(let i=0;i+1<cuts.length;i++){
        const cx=(cuts[i]+cuts[i+1])/2,width=cuts[i+1]-cuts[i];
        if(inside(cx,cy)&&(!best||width>best.width))best={point:[cy,cx],width};
      }
    }
    return best?.point || [outer[0][1],outer[0][0]];
  }

  async function create({container,config,fields,popupFor,onIncident}){
    if(!window.L||!L.esri)throw new Error('Leaflet could not load');
    const C=config,Z=window.ReadyLaPlataZones,$=id=>document.getElementById(id),esc=window.ReadyLaPlata.escHTML;
    let operationalLayers=[];
    const view=L.map(container,{scrollWheelZoom:true,zoomSnap:0.25});
    L.tileLayer(C.basemapTilesUrl,{attribution:'Terrain: Esri, USGS, NOAA',maxNativeZoom:13,maxZoom:19}).addTo(view);
    L.esri.featureLayer({url:C.boundaryUrl,style:()=>({color:'#0b4da2',weight:2,opacity:0.65,fillOpacity:0}),interactive:false}).addTo(view);
    view.createPane('zoneLabels');view.getPane('zoneLabels').style.zIndex=480;view.getPane('zoneLabels').style.pointerEvents='none';
    view.createPane('incidentPins');view.getPane('incidentPins').style.zIndex=675;
    const labels=L.layerGroup().addTo(view),pins=L.layerGroup().addTo(view);
    const zones=L.geoJSON(null,{style:feature=>{const style=Z.styles[Z.key(feature.properties[fields.status])];return {fillColor:style.fill,color:style.stroke,weight:2,fillOpacity:0.45};},onEachFeature:(feature,layer)=>{
      layer.on('add',()=>Z.applyHatch(layer,feature.properties[fields.status]));
      layer.bindPopup(()=>{const name=String(feature.properties[fields.incident]||'Incident'),content=document.createElement('div'),title=document.createElement('strong');title.textContent=name;content.append(title,popupFor(name,feature));return content;});
    }}).addTo(view);
  function operationalPopup(properties,kind){
    const node=document.createElement('div');node.className='operational-popup';
    const heading=document.createElement('strong');heading.textContent=properties.label || kind;node.appendChild(heading);
    const value=kind==='Road information'?properties.roadstatus:properties.pointtype;
    if(value){const line=document.createElement('p');line.textContent=String(value);node.appendChild(line);}
    return node;
  }
  function roadStyle(properties){
    const status=String(properties.roadstatus||'').toLowerCase();
    if(/clos|impass|wash/.test(status))return {color:'#c02e3a',weight:5,opacity:0.95,dashArray:'9 5'};
    if(/limit|restrict|caution|one lane/.test(status))return {color:'#bd7d0d',weight:5,opacity:0.95,dashArray:'6 4'};
    if(/open/.test(status))return {color:'#267553',weight:4,opacity:0.9};
    return {color:'#8051a7',weight:4,opacity:0.9};
  }
  function poiIcon(properties){
    const value=String(properties.pointtype||'Information').toLowerCase();
    const type=/clos|block/.test(value)?'closure':/warn|hazard|danger/.test(value)?'warning':/shelter|reception/.test(value)?'shelter':'info';
    const mark={closure:'×',warning:'!',shelter:'S',info:'i'}[type];
    return L.divIcon({className:'evac-poi-icon '+type,html:'<span>'+mark+'</span>',iconSize:[28,28],iconAnchor:[14,14]});
  }
  function initOperationalLayers(){
    const failures=new Set();
    const updateFailures=()=>$('mapMessage').textContent=failures.size?'Some map information is unavailable: '+Array.from(failures).join(', ')+'.':'';
    const attach=(layer,name,toggle)=>{
      $(toggle).addEventListener('change',()=>$(toggle).checked?layer.addTo(view):view.removeLayer(layer));
      layer.on('requesterror tileerror',()=>{failures.add(name);updateFailures();});
      layer.on('load',()=>{failures.delete(name);updateFailures();});
      return layer;
    };
    if(C.roadsTilesUrl && L.vectorGrid){
      view.createPane('countyRoads');view.getPane('countyRoads').style.zIndex=420;view.getPane('countyRoads').style.pointerEvents='none';
      // Esri tiles also contain label records with unknown geometry type (0).
      // VectorGrid renders only MVT Point/LineString/Polygon records (1–3).
      const RoadVectorGrid=L.VectorGrid.Protobuf.extend({
        _getVectorTilePromise:function(coords){
          return L.VectorGrid.Protobuf.prototype._getVectorTilePromise.call(this,coords).then(tile=>{
            Object.values(tile.layers || {}).forEach(layer=>{
              if(Array.isArray(layer.features))layer.features=layer.features.filter(feature=>[1,2,3].includes(feature.type));
            });
            return tile;
          }).catch(error=>{this.fire('tileerror',{error});return {layers:{}};});
        }
      });
      const roads=new RoadVectorGrid(C.roadsTilesUrl,{
        pane:'countyRoads',rendererFactory:L.canvas.tile,interactive:false,minZoom:9,maxNativeZoom:21,
        vectorTileLayerStyles:{
          Roads:(props,zoom)=>({color:Number(props._symbol)<2?'#52677e':'#81909e',weight:Number(props._symbol)<2?2.2:(zoom>=13?1.5:0.8),opacity:0.9,fill:false}),
          'County Boundary':[],'Roads/label':[]
        },attribution:'Roads: La Plata County'
      }).addTo(view);
      attach(roads,'County roads','roadsToggle');
    }else { $('roadsToggle').disabled=true;failures.add('County roads');updateFailures(); }
    view.createPane('roadImpacts');view.getPane('roadImpacts').style.zIndex=430;
    const roadInfo=L.esri.featureLayer({url:C.roadClosuresUrl,where:"roadstatus IS NULL OR LOWER(roadstatus) <> 'inactive'",pane:'roadImpacts',style:feature=>roadStyle(feature.properties),onEachFeature:(feature,layer)=>{
      if(feature.properties.label){const name=document.createElement('span');name.textContent=feature.properties.label;layer.bindTooltip(name,{direction:'top'});}
    }}).addTo(view);
    roadInfo.bindPopup(layer=>operationalPopup(layer.feature.properties,'Road information'));
    attach(roadInfo,'Road information','roadLayerToggle');
    const pois=L.esri.featureLayer({url:C.evacPoisUrl,where:"pointtype IS NULL OR LOWER(pointtype) <> 'inactive'",pointToLayer:(feature,latlng)=>L.marker(latlng,{icon:poiIcon(feature.properties),title:String(feature.properties.label || feature.properties.pointtype || 'Evacuation information')}),onEachFeature:(feature,layer)=>{
      if(feature.properties.label){const name=document.createElement('span');name.textContent=feature.properties.label;layer.bindTooltip(name,{direction:'top'});}
    }}).addTo(view);
    pois.bindPopup(layer=>operationalPopup(layer.feature.properties,'Evacuation information'));
    attach(pois,'EvacPOIs','poiLayerToggle');
    operationalLayers=[roadInfo,pois];
  }

    initOperationalLayers();
    new ResizeObserver(()=>view.invalidateSize({pan:false})).observe(document.getElementById(container));
    return {
      raw:view,operationalLayers,
      fitBounds(bounds,options={}){const b=Array.isArray(bounds)?bounds:[[bounds.ymin,bounds.xmin],[bounds.ymax,bounds.xmax]];return view.fitBounds(b,{padding:[20,20],maxZoom:options.maxZoom});},
      setView(latlng,zoom){return view.setView(latlng,zoom);},
      closePopup(){view.closePopup();},invalidateSize(){view.invalidateSize({pan:false});},
      renderZones(features){zones.clearLayers();zones.addData({type:'FeatureCollection',features});labels.clearLayers();for(const feature of features){const name=feature.properties[fields.zone],p=zoneLabelPoint(feature);if(name&&p)L.marker(p,{pane:'zoneLabels',interactive:false,keyboard:false,icon:L.divIcon({className:'zone-map-label',html:'<span>'+esc(name)+'</span>',iconSize:[0,0]})}).addTo(labels);}},
      renderIncidents(incidents){pins.clearLayers();for(const [name,entry] of incidents){if(!entry.extent.isValid())continue;entry.point=entry.extent.getCenter();entry.marker=L.marker(entry.point,{pane:'incidentPins',zIndexOffset:1000,icon:L.divIcon({className:'incident-map-pin',html:'<span class="pin-diamond"></span><span class="pin-label">'+esc(name)+'</span>',iconSize:[20,20],iconAnchor:[10,10]}),title:name,keyboard:true}).bindPopup(()=>{const content=document.createElement('div'),title=document.createElement('strong');title.textContent=name;content.append(title,popupFor(name));return content;}).on('click',()=>onIncident(name)).addTo(pins);}},
      markAddress(match){return L.circleMarker([match.location.y,match.location.x],{pane:'incidentPins',radius:7,color:'#fff',weight:3,fillColor:'#174f8a',fillOpacity:1}).bindTooltip(match.address,{direction:'top'}).addTo(view);}
    };
  }
  window.ReadyLaPlataMap={create,bounds:()=>new Bounds(),boundsForFeature};
})();
