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
  let view, zoneFields, incidents = new Map(), mapReady = false;
  let incidentsBusy = false, lastIncidentSuccess = null;
  let countyBounds = C.countyBounds;
  const linkedIncident = new URLSearchParams(location.search).get('incident') || '';
  let chosenIncident = '';
  // A shared incident link opens its resources once; reloads start with the county.
  if(linkedIncident){const url=new URL(location.href);url.searchParams.delete('incident');history.replaceState(null,'',url);}
  let firstLoad = true, announcementInitialized = false;
  let operationalLayers = [], currentZoneFeatures = [], currentAddressMatch=null, addressRequestId=0, addressMarker=null;
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
    if ($('welcomeRemember').checked) safeStorage(localStorage,'setItem','readylpc-zone-info-dismissed-v2','1');
    safeStorage(sessionStorage,'setItem','readylpc-zone-info-seen-v2','1');
    welcome.close();
  }
  $('welcomeClose').addEventListener('click',closeWelcome);
  $('welcomeContinue').addEventListener('click',closeWelcome);
  welcome.addEventListener('close',()=>{
    safeStorage(sessionStorage,'setItem','readylpc-zone-info-seen-v2','1');
    initAnnouncement();
  });
  $('infoButton').addEventListener('click',()=>{resetOverview();openWelcome();});
  $('welcomeAlerts').addEventListener('click',()=>{closeWelcome();$('coderedButton').click();});
  R.initCoderedOverlay(DOM); R.initCallerIdOverlay(DOM); R.initDrillBanner(DOM);
  if (!safeStorage(localStorage,'getItem','readylpc-zone-info-dismissed-v2') && !safeStorage(sessionStorage,'getItem','readylpc-zone-info-seen-v2')) openWelcome();
  else initAnnouncement();

  async function json(url) {
    const response = await fetch(url,{headers:{Accept:'application/geo+json, application/json'},signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error('HTTP '+response.status);
    return response.json();
  }
  function incidentDetailsButton(name,label){
    const button=document.createElement('button');button.type='button';button.className='home-btn incident-details-button';button.textContent=label;
    button.addEventListener('click',()=>openIncidentDetails(name));return button;
  }
  function openIncidentDetails(name,latlng){
    if(!view)return;
    if(welcome.open)closeWelcome();
    const addressMatches=currentAddressMatch&&addressZones(currentAddressMatch).some(f=>String(f.properties[zoneFields.incident]||'').trim()===name);
    const anchor=latlng||(addressMatches?[currentAddressMatch.location.y,currentAddressMatch.location.x]:incidents.get(name)?.point);
    window.ReadyLaPlataDetails.open({name,view,latlng:anchor});
  }
  function addressZones(match){return currentZoneFeatures.filter(feature=>['Go','Set','Access','Shelter'].includes(Z.key(statusName(feature)))&&zoneContainsAddress(feature.geometry,match.location.x,match.location.y));}
  function zoomToAddress(match){
    if(!view)return;
    view.closePopup();view.invalidateSize({pan:false});view.setView([match.location.y,match.location.x],15);
    if(addressMarker)addressMarker.remove();addressMarker=view.markAddress(match);
  }
  function statusName(feature) { return String((feature.properties || feature.attributes)[zoneFields.status] || 'Planning'); }
  function popupFor(name, feature) {
    const node=document.createElement('div');
    if (feature) {
      const status=document.createElement('p');
      status.textContent='Status: '+statusName(feature); node.appendChild(status);
      if(zoneFields.zone){const zone=document.createElement('p');zone.textContent='Zone: '+((feature.properties || feature.attributes)[zoneFields.zone]||'Unnamed zone');node.appendChild(zone);}
    }
    const link=incidentDetailsButton(name,'View incident details →');
    link.className='home-btn zone-popup-link';node.appendChild(link);
    return node;
  }
  async function focusIncident(name) {
    const entry=incidents.get(name);
    if(!view || !entry) return;
    chosenIncident=name;
    document.querySelectorAll('.incident-item').forEach(el=>{const selected=el.dataset.incident===name;el.classList.toggle('is-selected',selected);el.querySelector('.incident-mobile-tab')?.setAttribute('aria-pressed',String(selected));});
    try {
      window.ReadyLaPlataDetails.close();view.closePopup();
      if(entry.extent?.isValid()) view.fitBounds(entry.extent,{padding:[30,30],maxZoom:14});
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
      for(const status of Object.keys(STATUS_PRIORITY)){
        const count=entry.counts[status];if(!count)continue;
        const style=Z.styles[status],badge=document.createElement('span');badge.className='status-badge';
        badge.textContent=style.label;badge.setAttribute('aria-label',style.label+' zones present');
        if(status==='Access')badge.classList.add('access-hatch');badge.style.background=style.fill;badge.style.borderColor=style.stroke;badge.style.color=style.text;badges.appendChild(badge);
      }
      const link=incidentDetailsButton(name,'Details →');
      const tab=document.createElement('button');tab.type='button';tab.className='incident-mobile-tab';tab.setAttribute('aria-pressed',String(name===chosenIncident));
      const tabName=document.createElement('span');tabName.className='incident-tab-name';tabName.textContent=name;
      const dots=document.createElement('span');dots.className='incident-tab-dots';dots.setAttribute('aria-hidden','true');
      const labels=[];for(const badge of badges.children){const dot=badge.cloneNode(true);dot.title=badge.textContent;labels.push(badge.textContent);dot.textContent='';dots.append(dot);}
      tab.setAttribute('aria-label','Zoom to '+name+'. '+labels.join(', '));tab.title=name+' · '+labels.join(', ');tab.append(tabName,dots);tab.addEventListener('click',()=>focusIncident(name));
      const mobileActions=document.createElement('div');mobileActions.className='incident-mobile-actions';
      const info=incidentDetailsButton(name,'ⓘ');info.className='incident-mobile-info';info.setAttribute('aria-label','Incident information for '+name);info.title='Incident information';
      mobileActions.append(tab,info);
      card.append(focus,badges,link,mobileActions);container.appendChild(card);
    }
    $('incidentCount').textContent=incidents.size;
    requestAnimationFrame(updateIncidentArrows);
  }
  function updateIncidentArrows(){
    const list=$('incidentList'),max=list.scrollWidth-list.clientWidth;
    $('incidentPrev').disabled=list.scrollLeft<=2;
    $('incidentNext').disabled=list.scrollLeft>=max-2;
  }
  for(const [id,direction] of [['incidentPrev',-1],['incidentNext',1]]){
    $(id).addEventListener('click',()=>{
      const list=$('incidentList');list.scrollBy({left:direction*Math.max(200,list.clientWidth*0.8),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    });
  }
  $('incidentList').addEventListener('scroll',updateIncidentArrows,{passive:true});
  new ResizeObserver(updateIncidentArrows).observe($('incidentList'));
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
        if(!entry){entry={statuses:new Set(),counts:{Go:0,Shelter:0,Set:0,Access:0,Planning:0},extent:window.ReadyLaPlataMap.bounds(),point:null,marker:null};next.set(name,entry);}
        entry.statuses.add(statusName(feature));entry.counts[Z.key(statusName(feature))]++;
        const bounds=window.ReadyLaPlataMap.boundsForFeature(feature);
        if(bounds.isValid())entry.extent.extend(bounds);
      });
      currentZoneFeatures=features;
      incidents=new Map(Array.from(next.entries()).sort(compareIncidents));
      view?.renderZones(features);view?.renderIncidents(incidents);
      renderIncidentList();lastIncidentSuccess=Date.now();
      $('incidentState').dataset.error='false';$('incidentState').hidden=incidents.size>0;$('incidentState').textContent=incidents.size?'':'No incidents are currently shown in the county zone layer.';
      $('lastLoaded').textContent='Updated '+localTime(lastIncidentSuccess);
      if(currentAddressMatch)renderAddressResult();
      if(firstLoad && view)requestAnimationFrame(()=>{view.invalidateSize({pan:false});view.fitBounds(countyBounds,{padding:[20,20]});if(linkedIncident&&incidents.has(linkedIncident))openIncidentDetails(linkedIncident);});
      firstLoad=false;
    } catch(err){
      console.error('Incidents:',err);$('incidentState').hidden=false;$('incidentState').dataset.error='true';
      $('incidentState').textContent=lastIncidentSuccess?'Unable to refresh. Showing incident data from '+localTime(lastIncidentSuccess)+'.':'County incidents could not be loaded. Try Refresh information or the lightweight map.';
    } finally {incidentsBusy=false;}
  }
  function mapFailure(message){
    const node=$('mapLoading');node.replaceChildren();
    const text=document.createElement('p');text.textContent=message;
    const link=document.createElement('a');link.href='evac-lite.html';link.textContent='Open lightweight map →';node.append(text,link);node.hidden=false;
  }
  async function initMap(){
    try{
      const [metadata,extentData]=await Promise.all([
        json(C.zonesUrl+'?f=json'),
        json(C.boundaryUrl+'/query?'+new URLSearchParams({where:'1=1',returnExtentOnly:'true',outSR:'4326',f:'json'})).catch(()=>null)
      ]);
      if(metadata.error||!Array.isArray(metadata.fields))throw new Error('County zone metadata unavailable');
      const field=name=>metadata.fields.find(f=>f.name.toLowerCase()===name)?.name;
      zoneFields={status:field('status'),incident:field('incident'),zone:field('zonename')||field('zone_name')};
      if(!zoneFields.status||!zoneFields.incident)throw new Error('Zone status/incident fields unavailable');
      const extent=extentData?.extent;
      if(extent&&[extent.xmin,extent.ymin,extent.xmax,extent.ymax].every(Number.isFinite))countyBounds=[[extent.ymin,extent.xmin],[extent.ymax,extent.xmax]];
      view=await window.ReadyLaPlataMap.create({container:'viewDiv',config:C,fields:zoneFields,popupFor,onIncident:openIncidentDetails});
      operationalLayers=view.operationalLayers;
      await view.fitBounds(countyBounds);
      mapReady=true;$('mapLoading').hidden=true;
      await refreshIncidents();
    }catch(error){console.error('Map initialization:',error);mapFailure('The map could not load. Try Refresh or use the lightweight map.');if(zoneFields){mapReady=true;await refreshIncidents();}}
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
  function syncMapInteraction(){ /* The viewport map stays interactive. */ }
  $('mapOptionsToggle').addEventListener('click',()=>{
    const open=$('mapOptionsToggle').getAttribute('aria-expanded')!=='true';
    $('mapOptionsToggle').setAttribute('aria-expanded',String(open));
    $('mapOptionsToggle').closest('.overview-card').classList.toggle('is-options-open',open);
  });
  function expandMap(expanded){
    $('mapFrame').classList.toggle('is-expanded',expanded);$('mapFullscreenBtn').setAttribute('aria-pressed',String(expanded));$('mapFullscreenBtn').textContent=expanded?'Close expanded map':'Expand map';$('mapActivateBtn').setAttribute('aria-label',expanded?'Close expanded map':'Expand map');$('mapActivateBtn').textContent=expanded?'×':'⛶';if(view){syncMapInteraction();setTimeout(()=>view.invalidateSize(),0);}
  }
  $('mapActivateBtn').addEventListener('click',()=>expandMap(!$('mapFrame').classList.contains('is-expanded')));
  $('mapFullscreenBtn').addEventListener('click',()=>expandMap($('mapFullscreenBtn').getAttribute('aria-pressed')!=='true'));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')expandMap(false);});

  // GeoJSON polygons include holes; a point on a boundary is included for review.
  function zoneContainsAddress(geometry,x,y){
    const inRing=ring=>{
      let inside=false;
      for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const [ax,ay]=ring[j],[bx,by]=ring[i];
        const cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax);
        if(Math.abs(cross)<1e-12 && x>=Math.min(ax,bx)-1e-12 && x<=Math.max(ax,bx)+1e-12 && y>=Math.min(ay,by)-1e-12 && y<=Math.max(ay,by)+1e-12)return 2;
        if((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
      }
      return inside?1:0;
    };
    const polygons=geometry?.type==='MultiPolygon'?geometry.coordinates:geometry?.type==='Polygon'?[geometry.coordinates]:[];
    return polygons.some(rings=>{
      const outer=inRing(rings[0]||[]);if(!outer)return false;if(outer===2)return true;
      for(const hole of rings.slice(1)){const hit=inRing(hole);if(hit===2)return true;if(hit===1)return false;}
      return true;
    });
  }
  function resetOverview(){
    window.ReadyLaPlataDetails.close();
    addressRequestId++;currentAddressMatch=null;chosenIncident='';if(addressMarker){addressMarker.remove();addressMarker=null;}
    $('addressSearch').value='';$('addressSearch').blur();$('addressForm').querySelector('button').disabled=false;
    $('addressIncidentResult').replaceChildren();$('addressIncidentResult').hidden=true;$('mapMessage').textContent='';

    $('incidentList').scrollLeft=0;document.querySelectorAll('.incident-item').forEach(el=>{el.classList.remove('is-selected');el.querySelector('.incident-mobile-tab')?.setAttribute('aria-pressed','false');});
    $('mapOptionsToggle').setAttribute('aria-expanded','false');$('mapOptionsToggle').closest('.overview-card').classList.remove('is-options-open');
    for(const id of ['roadsToggle','roadLayerToggle','poiLayerToggle']){if(!$(id).checked){$(id).checked=true;$(id).dispatchEvent(new Event('change'));}}
    const url=new URL(location.href);url.searchParams.delete('incident');history.replaceState(null,'',url);
    expandMap(false);
    if(view){view.closePopup();requestAnimationFrame(()=>{view.invalidateSize({pan:false});view.fitBounds(countyBounds,{padding:[20,20]});});}
  }
  function shortAddressLabel(match){
    const value=String(match.attributes?.ShortLabel||match.address||'Address').split(',')[0].trim();
    return value.replace(/\bCounty\s+(?:Road|Rd\.?)\s*/gi,'CR ').replace(/\s+/g,' ').trim();
  }
  function addressIncidentContent(match){
    const content=document.createElement('div');
    const matches=addressZones(match);
    matches.sort((a,b)=>statusPriority(statusName(a))-statusPriority(statusName(b)));
    const highest=matches.length?Z.key(statusName(matches[0])):null;
    content.className='address-status-report';
    const banner=document.createElement('div');banner.className='address-report-banner';
    if(highest){const style=Z.styles[highest];content.style.setProperty('--report-color',style.fill);content.style.setProperty('--report-edge',style.stroke);banner.classList.add('has-zone');}
    const label=document.createElement('span');label.className='address-report-label';label.textContent='Address status';
    const headline=document.createElement('h2');headline.className='address-report-headline';
    const action=!lastIncidentSuccess?'Checking zones…':highest?{Go:'Evacuate Now',Shelter:'Shelter-In-Place',Set:'Prepare to Leave',Access:'Road Access Impacted'}[highest]:'No Listed Zone';
    headline.textContent=shortAddressLabel(match)+' — '+action;
    banner.append(label,headline);content.appendChild(banner);
    if(lastIncidentSuccess && !matches.length){const message=document.createElement('p');message.className='address-report-empty';message.textContent='No Go, Set, Access or Shelter-In-Place zone found.';content.appendChild(message);}
    const groups=document.createElement('div');groups.className='address-incident-groups';
    const moreLinks=[];
    for(const name of [...incidents.keys(),'']){
      const zones=matches.filter(feature=>String(feature.properties[zoneFields.incident]||'').trim()===name);if(!zones.length)continue;
      zones.sort((a,b)=>statusPriority(statusName(a))-statusPriority(statusName(b)));
      const group=document.createElement('section');group.className='address-incident-group';
      if(name)group.setAttribute('aria-label',name);
      const list=document.createElement('ul');list.className='address-zone-list';
      for(const feature of zones){
        const status=Z.key(statusName(feature)),style=Z.styles[status];
        const item=document.createElement('li'),badge=document.createElement('strong');item.className='address-zone-chip';badge.textContent=style.label;item.style.background=style.fill;item.style.borderColor=style.stroke;item.style.color=style.text;if(status==='Access')item.classList.add('access-hatch');
        const zone=document.createElement('span');zone.textContent=String((zoneFields.zone && feature.properties[zoneFields.zone])||'Unnamed zone');item.append(badge,zone);list.appendChild(item);
      }
      group.appendChild(list);if(name){const link=incidentDetailsButton(name,'More info');link.setAttribute('aria-label','More info about '+name);moreLinks.push(link);}groups.appendChild(group);
    }
    content.appendChild(groups);
    const actions=document.createElement('div');actions.className='address-report-actions';
    const zoom=document.createElement('button');zoom.type='button';zoom.className='home-btn primary';zoom.textContent='Zoom to';zoom.disabled=!view;zoom.addEventListener('click',()=>{
      window.ReadyLaPlataDetails.close();zoomToAddress(match);
    });
    const reset=document.createElement('button');reset.type='button';reset.className='home-btn';reset.textContent='Reset';reset.addEventListener('click',resetOverview);for(const link of moreLinks)actions.appendChild(link);actions.append(zoom,reset);content.appendChild(actions);
    content.title=match.address+' · Address location is approximate. Confirm incident instructions.';
    return content;
  }
  function renderAddressResult(){
    if(!currentAddressMatch)return;
    $('addressIncidentResult').replaceChildren(addressIncidentContent(currentAddressMatch));$('addressIncidentResult').hidden=false;
  }
  $('addressForm').addEventListener('submit',async event=>{
    event.preventDefault();if(!zoneFields)return;
    const text=$('addressSearch').value.trim();if(!text)return;
    $('addressSearch').blur();
    const requestId=++addressRequestId;
    const button=$('addressForm').querySelector('button');button.disabled=true;
    try {
      const data=await json('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?'+new URLSearchParams({SingleLine:text,f:'json',outSR:'4326',maxLocations:'1',searchExtent:[countyBounds[0][1],countyBounds[0][0],countyBounds[1][1],countyBounds[1][0]].join(',')}));
      if(requestId!==addressRequestId)return;
      const match=data.candidates?.[0];
      if(!match){$('mapMessage').textContent='No address match was found in La Plata County. Try the full street address and city.';return;}
      view?.closePopup();if(addressMarker){addressMarker.remove();addressMarker=null;}currentAddressMatch=match;renderAddressResult();zoomToAddress(match);$('mapMessage').textContent='';
    }catch(_){if(requestId===addressRequestId)$('mapMessage').textContent='Address search is unavailable. You can browse the map or try again.';}
    finally {if(requestId===addressRequestId)button.disabled=false;}
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
