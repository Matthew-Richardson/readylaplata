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
  let view, zoneLayer, pinLayer, zoneFields, incidents = new Map(), mapReady = false;
  let incidentsBusy = false, nwsBusy = false, lastIncidentSuccess = null, lastNwsSuccess = null;
  let chosenIncident = new URLSearchParams(location.search).get('incident') || '';
  let firstLoad = true, announcementInitialized = false;
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
  function renderIncidentList() {
    const container=$('incidentList');container.replaceChildren();
    for(const [name,entry] of incidents){
      const card=document.createElement('article');card.className='incident-item';card.dataset.incident=name;
      card.classList.toggle('is-selected',name===chosenIncident);
      const focus=document.createElement('button');focus.type='button';focus.className='incident-focus';focus.textContent=name;focus.setAttribute('aria-label','Show '+name+' on the map');focus.addEventListener('click',()=>focusIncident(name));
      const badges=document.createElement('div');badges.className='incident-badges';
      for(const status of Array.from(entry.statuses).sort()){
        const style=Z.styles[Z.key(status)],badge=document.createElement('span');badge.className='status-badge';badge.textContent=status;badge.style.background=style.fill;badge.style.borderColor=style.stroke;badge.style.color=style.text;badges.appendChild(badge);
      }
      const link=document.createElement('a');link.href='evac.html?incident='+encodeURIComponent(name);link.textContent='Incident details →';
      card.append(focus,badges,link);container.appendChild(card);
    }
    $('incidentCount').textContent=incidents.size;
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
      incidents=new Map(Array.from(next.entries()).sort(([a],[b])=>a.localeCompare(b)));
      const drawingOrder={Planning:0,Set:1,Shelter:2,Go:3};
      features.sort((a,b)=>drawingOrder[Z.key(statusName(a))]-drawingOrder[Z.key(statusName(b))]);
      zoneLayer.clearLayers();zoneLayer.addData({type:'FeatureCollection',features});
      pinLayer.clearLayers();
      incidents.forEach((entry,name)=>{
        if(!entry.extent.isValid())return;
        entry.point=entry.extent.getCenter();
        entry.marker=L.marker(entry.point,{icon:L.divIcon({className:'incident-map-pin',html:'<span class="pin-diamond"></span><span class="pin-label">'+esc(name)+'</span>',iconSize:[20,20],iconAnchor:[10,10]}),title:name,keyboard:true});
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
      view=L.map('viewDiv',{scrollWheelZoom:false}).fitBounds([[36.993,-108.379],[37.567,-107.482]]);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles © Esri',maxZoom:19}).addTo(view);
      L.esri.featureLayer({url:C.boundaryUrl,style:()=>({color:'#0b4da2',weight:2,opacity:0.65,fillOpacity:0}),interactive:false}).addTo(view);
      pinLayer=L.layerGroup().addTo(view);
      const metadata=await json(C.zonesUrl+'?f=json');
      if(metadata.error || !Array.isArray(metadata.fields))throw new Error('County zone metadata unavailable');
      const field=name=>metadata.fields.find(f=>f.name.toLowerCase()===name)?.name;
      zoneFields={status:field('status'),incident:field('incident'),zone:field('zonename')||field('zone_name')};
      if(!zoneFields.status || !zoneFields.incident)throw new Error('The zone layer is missing its status or incident field.');
      zoneLayer=L.geoJSON(null,{
        style:feature=>{const style=Z.styles[Z.key(statusName(feature))];return {fillColor:style.fill,color:style.stroke,weight:2,fillOpacity:0.45};},
        onEachFeature:(feature,layer)=>layer.bindPopup(()=>{const name=String(feature.properties[zoneFields.incident]||'Incident');const content=document.createElement('div'),title=document.createElement('strong');title.textContent=name;content.append(title,popupFor(name,feature));return content;})
      }).addTo(view);
      if(C.roadClosuresUrl){
        const roads=L.esri.featureLayer({url:C.roadClosuresUrl,style:()=>({color:'#b72832',weight:4,fillOpacity:0.18})}).addTo(view);
        $('roadLayerControl').hidden=false;$('roadLayerToggle').addEventListener('change',()=>{$('roadLayerToggle').checked?roads.addTo(view):view.removeLayer(roads);});
        roads.on('load',()=>$('mapMessage').textContent='');
        roads.on('requesterror',()=>$('mapMessage').textContent='Road closure information could not be loaded. Check official road reports.');
      }
      mapReady=true;$('mapLoading').hidden=true;
      await refreshIncidents();
    }catch(err){console.error('Map initialization:',err);mapFailure('The interactive map could not load county information.');}
  }
  function mapFailure(message){
    const loading=$('mapLoading');loading.hidden=false;loading.replaceChildren();
    const p=document.createElement('p');p.textContent=message;
    const link=document.createElement('a');link.href='evac-lite.html';link.textContent='Open the lightweight map →';loading.append(p,link);
    $('incidentState').dataset.error='true';$('incidentState').textContent='Map data unavailable. Use the lightweight map or refresh this page.';
  }
  $('mapResetBtn').addEventListener('click',()=>{if(view){view.closePopup();view.fitBounds([[36.993,-108.379],[37.567,-107.482]]);}});
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

  function activeAlerts(features, now=Date.now()) {
    const unique=new Map();
    for(const feature of features || []){
      const p=feature.properties||{};
      if(p.status && p.status!=='Actual')continue;
      if(p.messageType==='Cancel')continue;
      const end=Date.parse(p.ends||p.expires||'');
      if(Number.isFinite(end)&&end<=now)continue;
      unique.set(p.id||feature.id||p.event+'|'+p.sent,feature);
    }
    const rank=p=>/warning/i.test(p.event||'')?0:/watch/i.test(p.event||'')?1:2;
    return Array.from(unique.values()).sort((a,b)=>rank(a.properties)-rank(b.properties)||Date.parse(b.properties.sent)-Date.parse(a.properties.sent));
  }
  function renderNws(features){
    const container=$('nwsAlerts');container.replaceChildren();
    for(const feature of features){
      const p=feature.properties,event=String(p.event||'Weather alert');
      const detail=document.createElement('details');detail.className='nws-alert '+(/warning/i.test(event)?'warning':/watch/i.test(event)?'watch':'advisory');
      const summary=document.createElement('summary'),title=document.createElement('strong'),meta=document.createElement('span');title.textContent=event;meta.className='nws-meta';meta.textContent='Issued '+localTime(p.sent)+' · Ends '+localTime(p.ends||p.expires);summary.append(title,meta);
      const body=document.createElement('div');body.className='nws-body';
      const append=(heading,value)=>{if(!value)return;const h=document.createElement('h4'),text=document.createElement('p');h.textContent=heading;text.textContent=value;body.append(h,text);};
      append('Affected area',p.areaDesc);append('NWS bulletin',p.description);append('Instructions',p.instruction);append('Issued by',p.senderName);
      detail.append(summary,body);container.appendChild(detail);
    }
  }
  async function refreshNws(){
    if(nwsBusy)return;nwsBusy=true;
    try{
      const data=await json(C.nwsAlertsUrl);
      if(!Array.isArray(data.features))throw new Error('Unexpected NWS response');
      const alerts=activeAlerts(data.features);renderNws(alerts);lastNwsSuccess=Date.now();
      $('nwsState').dataset.error='false';$('nwsState').textContent=alerts.length?alerts.length+' active NWS alert'+(alerts.length===1?'':'s')+'. Open an alert for the full bulletin and instructions.':'No active NWS warnings, watches or advisories are currently returned for La Plata County.';
      $('nwsUpdated').textContent='Source: National Weather Service · Checked '+localTime(lastNwsSuccess)+' · All times Mountain Time';
    }catch(err){
      console.warn('NWS alerts:',err);$('nwsState').dataset.error='true';$('nwsState').textContent=lastNwsSuccess?'NWS refresh failed. Previously loaded bulletins may be out of date; check NWS Grand Junction. Last successful check: '+localTime(lastNwsSuccess)+'.':'NWS alerts are temporarily unavailable. Check NWS Grand Junction for current warnings.';
    }finally{nwsBusy=false;}
  }
  async function loadPastIncidents(){
    try{
      const rows=await json('pastincident.json');if(!Array.isArray(rows))throw new Error('Unexpected history response');
      rows.sort((a,b)=>new Date(b.liftedDate||b.startDate||0)-new Date(a.liftedDate||a.startDate||0));
      $('pastIncidentsTable').innerHTML=rows.length?'<table class="history-table"><thead><tr><th>Incident</th><th>Start date</th><th>Evacuations lifted</th></tr></thead><tbody>'+rows.map(row=>'<tr><td>'+esc(row.name||'—')+'</td><td>'+esc(row.startDate||'—')+'</td><td>'+esc(row.liftedDate||'—')+'</td></tr>').join('')+'</tbody></table>':'No past incidents recorded.';
    }catch(_){$('pastIncidentsTable').textContent='Past incidents are temporarily unavailable.';}
  }
  async function refreshAll(){
    $('refreshAll').disabled=true;
    try{await Promise.allSettled([refreshIncidents(),refreshNws()]);}finally{$('refreshAll').disabled=false;}
  }
  $('refreshAll').addEventListener('click',refreshAll);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAll();});
  setInterval(()=>{if(!document.hidden)refreshAll();},C.refreshMs);
  initMap();refreshNws();loadPastIncidents();
})();
