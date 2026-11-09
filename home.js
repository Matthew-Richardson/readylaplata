(function () {
  'use strict';
  const R = window.ReadyLaPlata, Z = window.ReadyLaPlataZones, C = window.ReadyLaPlataHomeConfig;
  const $ = id => document.getElementById(id), esc = R.escHTML;
  const localTime = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not specified' : date.toLocaleString('en-US', {timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  };
  const DOM = {};
  ['siteBanner','coderedButton','coderedOverlay','coderedClose','callerIdButton','callerIdOverlay','callerIdClose','announcementOverlay','announcementClose','announcementDismiss','announcementAlertBtn'].forEach(id=>DOM[id]=$(id));
  let view, zoneLayer, pinLayer, zoneLabelLayer, zoneFields, incidents = new Map(), mapReady = false;
  let incidentsBusy = false, lastIncidentSuccess = null;
  let countyBounds = C.countyBounds;
  let chosenIncident = new URLSearchParams(location.search).get('incident') || '';
  let firstLoad = true, announcementInitialized = false;
  let operationalLayers = [];
  const welcome = $('welcomeDialog');
  function safeStorage(storage, method, key, value) { try { return storage[method](key,value); } catch (_) { return null; } }
  function initAnnouncement() {
    if (announcementInitialized) return;
    announcementInitialized = true;
    // Existing announcement content and its enable/auto-open settings are retained.
    R.initAnnouncement(DOM);
  }
  function openWelcome() { if (!welcome.open) welcome.showModal(); }
  function closeWelcome() {
    if ($('welcomeRemember').checked) safeStorage(localStorage,'setItem','readylpc-welcome-dismissed-v1','1');
    safeStorage(sessionStorage,'setItem','readylpc-welcome-seen-v1','1');
    welcome.close();
  }
  $('welcomeClose').addEventListener('click',closeWelcome);
  $('welcomeContinue').addEventListener('click',closeWelcome);
  welcome.addEventListener('close',()=>{
    safeStorage(sessionStorage,'setItem','readylpc-welcome-seen-v1','1');
    initAnnouncement();
  });
  $('infoButton').addEventListener('click',openWelcome);
  $('reopenWelcome').addEventListener('click',openWelcome);
  $('welcomeAlerts').addEventListener('click',()=>{closeWelcome();$('coderedButton').click();});
  R.initCoderedOverlay(DOM); R.initCallerIdOverlay(DOM); R.initDrillBanner(DOM);
  if (!safeStorage(localStorage,'getItem','readylpc-welcome-dismissed-v1') && !safeStorage(sessionStorage,'getItem','readylpc-welcome-seen-v1')) openWelcome();
  else initAnnouncement();

  async function json(url) {
    const response = await fetch(url,{headers:{Accept:'application/geo+json, application/json'},signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error('HTTP '+response.status);
    return response.json();
  }
  function statusName(feature) { return String((feature.properties || feature.attributes)[zoneFields.status] || 'Planning'); }
  function popupFor(name, feature) {
    const node=document.createElement('div');
    if (feature) {
      if(Z.key(statusName(feature))==='Access'){const info=document.createElement('p');info.textContent='Road access is affected. Review incident details for access conditions and instructions. This designation is not a shelter-in-place order.';node.appendChild(info);}
      const status=document.createElement('p');
      status.textContent='Status: '+statusName(feature); node.appendChild(status);
      if(zoneFields.zone){const zone=document.createElement('p');zone.textContent='Zone: '+((feature.properties || feature.attributes)[zoneFields.zone]||'Unnamed zone');node.appendChild(zone);}
    }
    const link=document.createElement('a');
    link.className='zone-popup-link';link.href='evac.html?incident='+encodeURIComponent(name);link.textContent='View incident details →';node.appendChild(link);
    return node;
  }
  async function focusIncident(name) {
    const entry=incidents.get(name);
    if(!view || !entry) return;
    chosenIncident=name;
    document.querySelectorAll('.incident-item').forEach(el=>el.classList.toggle('is-selected',el.dataset.incident===name));
    const url=new URL(location.href);url.searchParams.set('incident',name);history.replaceState(null,'',url);
    try {
      if(entry.extent?.isValid()) view.fitBounds(entry.extent,{padding:[30,30],maxZoom:14});
      if(entry.marker) entry.marker.openPopup();
    } catch(err){if(err.name!=='AbortError')console.warn('Incident navigation:',err);}
  }
  const STATUS_PRIORITY = Object.freeze({Go:0,Shelter:1,Set:2,Access:3,Planning:4});
  function statusPriority(status) { return STATUS_PRIORITY[Z.key(status)]; }
  function incidentPriority(entry) {
    return Array.from(entry.statuses).reduce((highest,status)=>Math.min(highest,statusPriority(status)),STATUS_PRIORITY.Planning);
  }
  function compareIncidents([nameA,a],[nameB,b]) {
    return incidentPriority(a)-incidentPriority(b) || nameA.localeCompare(nameB);
  }
  function renderIncidentList() {
    const container=$('incidentList');container.replaceChildren();
    for(const [name,entry] of incidents){
      const card=document.createElement('article');card.className='incident-item';card.dataset.incident=name;
      card.classList.toggle('is-selected',name===chosenIncident);
      const focus=document.createElement('button');focus.type='button';focus.className='incident-focus';focus.textContent=name;focus.setAttribute('aria-label','Show '+name+' on the map');focus.addEventListener('click',()=>focusIncident(name));
      const badges=document.createElement('div');badges.className='incident-badges';
      for(const status of Array.from(entry.statuses).sort((a,b)=>statusPriority(a)-statusPriority(b)||a.localeCompare(b))){
        const style=Z.styles[Z.key(status)],badge=document.createElement('span');badge.className='status-badge';badge.textContent=Z.key(status)==='Access'?style.label:status;if(Z.key(status)==='Access')badge.classList.add('access-hatch');badge.style.background=style.fill;badge.style.borderColor=style.stroke;badge.style.color=style.text;badges.appendChild(badge);
      }
      const link=document.createElement('a');link.href='evac.html?incident='+encodeURIComponent(name);link.textContent='Incident details →';
      card.append(focus,badges,link);container.appendChild(card);
    }
    $('incidentCount').textContent=incidents.size;
  }
  // Find an interior label position, including concave zones and holes.
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
  async function refreshIncidents() {
    if(!mapReady || incidentsBusy) return;
    incidentsBusy=true;
    try {
      // Query all IDs first to avoid silently omitting zones at the service limit.
      const idData=await json(C.zonesUrl+'/query?'+new URLSearchParams({where:'1=1',returnIdsOnly:'true',f:'json'}));
      if(idData.error || !Array.isArray(idData.objectIds))throw new Error('County zone query failed');
      const ids=idData.objectIds,features=[];
      for(let offset=0;offset<ids.length;offset+=200){
        const batch=ids.slice(offset,offset+200);
        const fs=await json(C.zonesUrl+'/query?'+new URLSearchParams({objectIds:batch.join(','),outFields:'*',returnGeometry:'true',outSR:'4326',f:'geojson'}));
        if(fs.error || !Array.isArray(fs.features) || fs.exceededTransferLimit || fs.features.length!==batch.length)throw new Error('Incomplete incident response');
        features.push(...fs.features);
      }
      const next=new Map();
      features.forEach(feature=>{
        const name=String(feature.properties[zoneFields.incident]||'').trim();if(!name)return;
        let entry=next.get(name);
        if(!entry){entry={statuses:new Set(),extent:L.latLngBounds(),point:null,marker:null};next.set(name,entry);}
        entry.statuses.add(statusName(feature));
        const bounds=L.geoJSON(feature).getBounds();
        if(bounds.isValid())entry.extent.extend(bounds);
      });
      incidents=new Map(Array.from(next.entries()).sort(compareIncidents));
      const drawingOrder={Planning:0,Access:1,Set:2,Shelter:3,Go:4};
      features.sort((a,b)=>drawingOrder[Z.key(statusName(a))]-drawingOrder[Z.key(statusName(b))]);
      zoneLayer.clearLayers();zoneLayer.addData({type:'FeatureCollection',features});
      zoneLabelLayer.clearLayers();
      features.forEach(feature=>{
        const name=zoneFields.zone && feature.properties[zoneFields.zone];
        const point=zoneLabelPoint(feature);
        if(!name || !point)return;
        L.marker(point,{pane:'zoneLabels',interactive:false,keyboard:false,icon:L.divIcon({className:'zone-map-label',html:'<span>'+esc(name)+'</span>',iconSize:[0,0]})}).addTo(zoneLabelLayer);
      });
      pinLayer.clearLayers();
      incidents.forEach((entry,name)=>{
        if(!entry.extent.isValid())return;
        entry.point=entry.extent.getCenter();
        entry.marker=L.marker(entry.point,{pane:'incidentPins',zIndexOffset:1000,icon:L.divIcon({className:'incident-map-pin',html:'<span class="pin-diamond"></span><span class="pin-label">'+esc(name)+'</span>',iconSize:[20,20],iconAnchor:[10,10]}),title:name,keyboard:true});
        entry.marker.bindPopup(()=>{const content=document.createElement('div'),title=document.createElement('strong');title.textContent=name;content.append(title,popupFor(name));return content;});
        entry.marker.on('click',()=>focusIncident(name));entry.marker.addTo(pinLayer);
      });
      renderIncidentList();lastIncidentSuccess=Date.now();
      $('incidentState').dataset.error='false';$('incidentState').textContent=incidents.size?'Select an incident to zoom to its location.':'No incidents are currently shown in the county zone layer.';
      $('lastLoaded').textContent='Source: La Plata County OEM · Updated '+localTime(lastIncidentSuccess);
      if(firstLoad && chosenIncident)await focusIncident(chosenIncident);
      firstLoad=false;
    } catch(err){
      console.error('Incidents:',err);$('incidentState').dataset.error='true';
      $('incidentState').textContent=lastIncidentSuccess?'Unable to refresh. Showing incident data from '+localTime(lastIncidentSuccess)+'.':'County incidents could not be loaded. Try Refresh information or the lightweight map.';
    } finally {incidentsBusy=false;}
  }
  async function initMap() {
    if(!window.L || !L.esri){mapFailure('The interactive map could not load.');return;}
    try {
      view=L.map('viewDiv',{scrollWheelZoom:false,zoomSnap:0.25}).fitBounds(countyBounds,{padding:[20,20]});
      view.createPane('zoneLabels');view.getPane('zoneLabels').style.zIndex=480;view.getPane('zoneLabels').style.pointerEvents='none';
      view.createPane('incidentPins');view.getPane('incidentPins').style.zIndex=675;
      zoneLabelLayer=L.layerGroup().addTo(view);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles © Esri',maxZoom:19}).addTo(view);
      L.esri.featureLayer({url:C.boundaryUrl,style:()=>({color:'#0b4da2',weight:2,opacity:0.65,fillOpacity:0}),interactive:false}).addTo(view);
      pinLayer=L.layerGroup().addTo(view);
      const [metadata,extentData]=await Promise.all([
        json(C.zonesUrl+'?f=json'),
        json(C.boundaryUrl+'/query?'+new URLSearchParams({where:'1=1',returnExtentOnly:'true',outSR:'4326',f:'json'})).catch(()=>null)
      ]);
      const extent=extentData?.extent;
      if(extent && [extent.xmin,extent.ymin,extent.xmax,extent.ymax].every(Number.isFinite))
        countyBounds=[[extent.ymin,extent.xmin],[extent.ymax,extent.xmax]];
      view.fitBounds(countyBounds,{padding:[20,20]});
      if(metadata.error || !Array.isArray(metadata.fields))throw new Error('County zone metadata unavailable');
      const field=name=>metadata.fields.find(f=>f.name.toLowerCase()===name)?.name;
      zoneFields={status:field('status'),incident:field('incident'),zone:field('zonename')||field('zone_name')};
      if(!zoneFields.status || !zoneFields.incident)throw new Error('The zone layer is missing its status or incident field.');
      zoneLayer=L.geoJSON(null,{
        style:feature=>{const style=Z.styles[Z.key(statusName(feature))];return {fillColor:style.fill,color:style.stroke,weight:2,fillOpacity:0.45};},
        onEachFeature:(feature,layer)=>{ layer.on('add',()=>Z.applyHatch(layer,statusName(feature))); layer.bindPopup(()=>{const name=String(feature.properties[zoneFields.incident]||'Incident');const content=document.createElement('div'),title=document.createElement('strong');title.textContent=name;content.append(title,popupFor(name,feature));return content;}); }
      }).addTo(view);
      initOperationalLayers();
      mapReady=true;$('mapLoading').hidden=true;
      await refreshIncidents();
    }catch(err){console.error('Map initialization:',err);mapFailure('The interactive map could not load county information.');}
  }
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
  function mapFailure(message){
    const loading=$('mapLoading');loading.hidden=false;loading.replaceChildren();
    const p=document.createElement('p');p.textContent=message;
    const link=document.createElement('a');link.href='evac-lite.html';link.textContent='Open the lightweight map →';loading.append(p,link);
    $('incidentState').dataset.error='true';$('incidentState').textContent='Map data unavailable. Use the lightweight map or refresh this page.';
  }
  $('mapResetBtn').addEventListener('click',()=>{if(view){view.closePopup();view.fitBounds(countyBounds,{padding:[20,20]});}});
  $('myLocationBtn').addEventListener('click',()=>{
    if(!view)return;
    if(!navigator.geolocation){$('mapMessage').textContent='Location is not supported by this browser.';return;}
    const button=$('myLocationBtn');button.disabled=true;
    navigator.geolocation.getCurrentPosition(async position=>{
      try{view.setView([position.coords.latitude,position.coords.longitude],13);$('mapMessage').textContent='Your reported location is approximate. Confirm your address and zone.';}catch(_){}finally{button.disabled=false;}
    },()=>{button.disabled=false;$('mapMessage').textContent='Location could not be obtained. You can search for your address on the map.';},{timeout:10000});
  });
  function expandMap(expanded){
    $('mapFrame').classList.toggle('is-expanded',expanded);$('mapFullscreenBtn').setAttribute('aria-pressed',String(expanded));$('mapFullscreenBtn').textContent=expanded?'Close expanded map':'Expand map';document.body.style.overflow=expanded?'hidden':'';if(view)setTimeout(()=>view.invalidateSize(),0);
  }
  $('mapFullscreenBtn').addEventListener('click',()=>expandMap($('mapFullscreenBtn').getAttribute('aria-pressed')!=='true'));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')expandMap(false);});

  $('addressForm').addEventListener('submit',async event=>{
    event.preventDefault();if(!view)return;
    const text=$('addressSearch').value.trim();if(!text)return;
    const button=$('addressForm').querySelector('button');button.disabled=true;
    try {
      const data=await json('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?'+new URLSearchParams({SingleLine:text,f:'json',outSR:'4326',maxLocations:'1',searchExtent:'-108.379,36.993,-107.482,37.567'}));
      const match=data.candidates?.[0];
      if(!match){$('mapMessage').textContent='No address match was found in La Plata County. Try the full street address and city.';return;}
      view.setView([match.location.y,match.location.x],15);
      const textNode=document.createElement('p');textNode.textContent=match.address;
      L.popup().setLatLng([match.location.y,match.location.x]).setContent(textNode).openOn(view);
      $('mapMessage').textContent='Address location is approximate. Confirm the mapped zone and incident instructions.';
    }catch(_){$('mapMessage').textContent='Address search is unavailable. You can browse the map or try again.';}
    finally {button.disabled=false;}
  });

  async function refreshAll(){
    $('refreshAll').disabled=true;
    try{operationalLayers.forEach(layer=>layer.refresh());await refreshIncidents();}finally{$('refreshAll').disabled=false;}
  }
  $('refreshAll').addEventListener('click',refreshAll);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAll();});
  setInterval(()=>{if(!document.hidden)refreshAll();},C.refreshMs);
  initMap();
})();
