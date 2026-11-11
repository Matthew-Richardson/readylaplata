(function () {
  'use strict';
  const R = window.ReadyLaPlata, Z = window.ReadyLaPlataZones, C = window.ReadyLaPlataHomeConfig;
  const $ = id => document.getElementById(id);
  const localTime = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not specified' : date.toLocaleString('en-US', {timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  };
  const DOM = {};
  ['siteBanner','coderedButton','coderedOverlay','coderedClose','callerIdButton','callerIdOverlay','callerIdClose','announcementOverlay','announcementClose','announcementDismiss','announcementAlertBtn'].forEach(id=>DOM[id]=$(id));
  let view, zoneFields, incidents = new Map(), mapReady = false;
  let incidentsBusy = false, lastIncidentSuccess = null, incidentsError = false;
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
  function openWelcome() { setOptionsOpen(false);setIncidentMenuOpen(false);if (!welcome.open) welcome.showModal(); }
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
  function selectIncident(name){
    chosenIncident=name||'';view?.setSelectedIncident?.(chosenIncident);
    $('clearIncidentSelection').disabled=!chosenIncident;
    document.querySelectorAll('.incident-item').forEach(el=>el.classList.toggle('is-selected',el.dataset.incident===chosenIncident));
  }
  function openIncidentDetails(name,latlng){
    setOptionsOpen(false);setIncidentMenuOpen(false);
    const entry=incidents.get(name);if(!view&&!entry)return;selectIncident(name);
    if(welcome.open)closeWelcome();
    const addressMatches=currentAddressMatch&&addressZones(currentAddressMatch).some(f=>String(f.properties[zoneFields.incident]||'').trim()===name);
    const anchor=latlng||(addressMatches?[currentAddressMatch.location.y,currentAddressMatch.location.x]:entry?.point||entry?.extent.getCenter());
    const host=view||{openSupportPopup:(_,content)=>window.ReadyLaPlataMap.openSupportWindow('viewDiv',content)};
    window.ReadyLaPlataDetails.open({name,view:host,latlng:anchor,onZoom:view&&entry?()=>focusIncident(name):null,getActiveZones:()=>({
      available:lastIncidentSuccess!==null,stale:incidentsError,
      zones:currentZoneFeatures.filter(feature=>feature.properties?.[zoneFields.live]===1&&String(feature.properties[zoneFields.incident]||'').trim()===name)
        .map(feature=>({name:String(feature.properties[zoneFields.zone]||'').trim()||'Unnamed zone',status:Z.key(statusName(feature)),description:String(feature.properties[zoneFields.description]||'').trim()}))
    })});
  }
  function addressZones(match){return currentZoneFeatures.filter(feature=>['Go','Set','Access','Shelter'].includes(Z.key(statusName(feature)))&&zoneContainsAddress(feature.geometry,match.location.x,match.location.y));}
  function zoomToAddress(match){
    if(!view)return;
    view.closePopup();view.invalidateSize({pan:false});view.setView([match.location.y,match.location.x],15);
    if(addressMarker)addressMarker.remove();addressMarker=view.markAddress(match);
  }
  function statusName(feature) { return String((feature.properties || feature.attributes)[zoneFields.status] || 'Planning'); }
  async function focusIncident(name) {
    setIncidentMenuOpen(false);
    const entry=incidents.get(name);
    if(!view || !entry) return;
    selectIncident(name);
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
      const heading=document.createElement('h3');heading.className='incident-name';heading.textContent=name;
      const badges=document.createElement('div');badges.className='incident-badges';
      for(const status of Object.keys(STATUS_PRIORITY)){
        const count=entry.counts[status];if(!count)continue;
        const style=Z.styles[status],badge=document.createElement('span');badge.className='status-badge';
        badge.setAttribute('aria-label',style.label+' zones present');
        const symbol=document.createElement('span');symbol.className='incident-status-symbol';symbol.setAttribute('aria-hidden','true');
        if(status==='Access')symbol.classList.add('access-hatch');symbol.style.background=style.fill;symbol.style.borderColor=style.stroke;
        const label=document.createElement('span');label.className='incident-status-label';label.textContent=style.label;
        badge.append(symbol,label);badges.appendChild(badge);
      }
      const actions=document.createElement('div');actions.className='incident-action-buttons';
      const zoom=document.createElement('button');zoom.type='button';zoom.className='home-btn incident-zoom-button';zoom.textContent='Zoom To';zoom.setAttribute('aria-label','Zoom to '+name);zoom.addEventListener('click',()=>focusIncident(name));
      const info=incidentDetailsButton(name,'Info');info.setAttribute('aria-label','Incident information for '+name);
      actions.append(zoom,info);card.append(heading,badges,actions);container.appendChild(card);
    }
    $('incidentCount').textContent=incidents.size;$('incidentMenuCount').textContent=incidents.size;
    $('incidentMenuToggle').setAttribute('aria-label','Active incidents: '+incidents.size);
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
      if(!zoneFields.live)throw new Error('LIVE is not exposed in the public evacuation-zone view.');
      // Query only live IDs, then reapply the filter to each batch in case a zone is deactivated during loading.
      const idData=await json(C.zonesUrl+'/query?'+new URLSearchParams({where:C.zonesWhere,returnIdsOnly:'true',f:'json'}));
      if(idData.error || (idData.objectIds!==null&&!Array.isArray(idData.objectIds)))throw new Error('County zone query failed');
      const ids=idData.objectIds||[],features=[];
      for(let offset=0;offset<ids.length;offset+=200){
        const batch=ids.slice(offset,offset+200);
        const fs=await json(C.zonesUrl+'/query?'+new URLSearchParams({where:C.zonesWhere,objectIds:batch.join(','),outFields:[...new Set(Object.values(zoneFields).filter(Boolean))].join(','),returnGeometry:'true',outSR:'4326',f:'geojson'}));
        if(fs.error || !Array.isArray(fs.features) || fs.exceededTransferLimit || fs.features.length>batch.length)throw new Error('Incomplete incident response');
        features.push(...fs.features.filter(feature=>feature.properties?.[zoneFields.live]===1));
      }
      const next=new Map();
      features.forEach(feature=>{
        const name=String(feature.properties[zoneFields.incident]||'').trim();if(!name)return;
        let entry=next.get(name);
        if(!entry){entry={statuses:new Set(),counts:{Go:0,Shelter:0,Set:0,Access:0,Planning:0},extent:window.ReadyLaPlataMap.bounds(),point:null,labelArea:0,marker:null};next.set(name,entry);}
        entry.statuses.add(statusName(feature));entry.counts[Z.key(statusName(feature))]++;
        const bounds=window.ReadyLaPlataMap.boundsForFeature(feature);
        if(bounds.isValid()){
          entry.extent.extend(bounds);
          const point=window.ReadyLaPlataMap.interiorPointForFeature(feature);
          const area=Number(feature.properties.Shape__Area)||((bounds.xmax-bounds.xmin)*(bounds.ymax-bounds.ymin));
          if(point&&area>entry.labelArea){entry.point=point;entry.labelArea=area;}
        }
      });
      currentZoneFeatures=features;
      incidents=new Map(Array.from(next.entries()).sort(compareIncidents));
      for(const entry of incidents.values())if(!entry.point&&entry.extent.isValid())entry.point=entry.extent.getCenter();
      view?.setIncidents?.([...incidents].filter(([,entry])=>entry.point).map(([name,entry])=>({name,point:entry.point,statuses:Object.keys(STATUS_PRIORITY).filter(status=>entry.counts[status]>0)})));
      if(chosenIncident&&!incidents.has(chosenIncident))selectIncident('');
      renderIncidentList();lastIncidentSuccess=Date.now();incidentsError=false;window.ReadyLaPlataDetails.refreshZones();
      $('incidentState').dataset.error='false';$('incidentState').hidden=incidents.size>0;$('incidentState').textContent=incidents.size?'':'No incidents are currently shown in the county zone layer.';
      $('lastLoaded').textContent='Updated '+localTime(lastIncidentSuccess);
      if(currentAddressMatch)renderAddressResult();
      if(firstLoad && view && linkedIncident && incidents.has(linkedIncident))openIncidentDetails(linkedIncident);
      firstLoad=false;
    } catch(err){
      incidentsError=true;window.ReadyLaPlataDetails.refreshZones();if(currentAddressMatch)renderAddressResult();
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
      zoneFields={status:field('status'),incident:field('incident'),zone:field('zonename')||field('zone_name'),live:field('live'),description:field('description'),area:field('shape__area')};
      if(!zoneFields.status||!zoneFields.incident)throw new Error('Zone status/incident fields unavailable');
      const extent=extentData?.extent;
      if(extent&&[extent.xmin,extent.ymin,extent.xmax,extent.ymax].every(Number.isFinite))countyBounds=[[extent.ymin,extent.xmin],[extent.ymax,extent.xmax]];
      view=await window.ReadyLaPlataMap.create({container:'viewDiv',config:C,onIncident:openIncidentDetails});
      operationalLayers=view.operationalLayers;$('mapZoomIn').disabled=false;$('mapZoomOut').disabled=false;measureMapOverlays();
      await view.fitBounds(countyBounds,{county:true});
      mapReady=true;$('mapLoading').hidden=true;
      await refreshIncidents();
    }catch(error){console.error('Map initialization:',error);mapFailure(/webgl/i.test(String(error.name)+' '+String(error.message))?'This browser cannot display the ArcGIS map. Use the lightweight map.':'The map could not load. Try Refresh or use the lightweight map.');if(zoneFields){mapReady=true;await refreshIncidents();}}
  }
  $('clearIncidentSelection').addEventListener('click',()=>selectIncident(''));
  $('mapResetBtn').addEventListener('click',()=>{selectIncident('');if(view){view.closePopup();view.fitBounds(countyBounds,{padding:[20,20],county:true});}});
  $('myLocationBtn').addEventListener('click',()=>{
    if(!view)return;
    if(!navigator.geolocation){$('mapMessage').textContent='Location is not supported by this browser.';return;}
    const button=$('myLocationBtn');button.disabled=true;
    navigator.geolocation.getCurrentPosition(async position=>{
      try{view.setView([position.coords.latitude,position.coords.longitude],13);$('mapMessage').textContent='Your reported location is approximate. Confirm your address and zone.';}catch(_){}finally{button.disabled=false;}
    },()=>{button.disabled=false;$('mapMessage').textContent='Location could not be obtained. You can search for your address on the map.';},{timeout:10000});
  });
  function setOptionsOpen(open){
    $('mapOptions').hidden=!open;$('mapOptionsToggle').setAttribute('aria-expanded',String(open));
    $('mapOptionsToggle').closest('.overview-card').classList.toggle('is-options-open',open);
    if(open){setIncidentMenuOpen(false);$('mapOptionsClose').focus({preventScroll:true});}
  }
  function setIncidentMenuOpen(open){
    $('incidentPopover').hidden=!open;$('incidentMenuToggle').setAttribute('aria-expanded',String(open));
    if(open){setOptionsOpen(false);$('incidentMenuClose').focus({preventScroll:true});}
  }
  $('mapOptionsToggle').addEventListener('click',()=>setOptionsOpen($('mapOptions').hidden));
  $('mapOptionsClose').addEventListener('click',()=>{setOptionsOpen(false);$('mapOptionsToggle').focus({preventScroll:true});});
  $('incidentMenuToggle').addEventListener('click',()=>setIncidentMenuOpen($('incidentPopover').hidden));
  $('incidentMenuClose').addEventListener('click',()=>{setIncidentMenuOpen(false);$('incidentMenuToggle').focus({preventScroll:true});});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){
    if(!$('mapOptions').hidden){setOptionsOpen(false);$('mapOptionsToggle').focus({preventScroll:true});}
    if(!$('incidentPopover').hidden){setIncidentMenuOpen(false);$('incidentMenuToggle').focus({preventScroll:true});}
  }});
  const guideLegend=document.createElement('section');guideLegend.className='welcome-map-legend';
  guideLegend.appendChild(document.querySelector('#mapOptions .home-legend').cloneNode(true));welcome.querySelector('.welcome-scroll').appendChild(guideLegend);
  // Keep map geometry stable while a mobile keyboard changes the visual viewport.
  let addressViewportLock=null;
  function syncAddressViewport(){
    const viewport=window.visualViewport,input=$('addressSearch'),focused=document.activeElement===input;
    const visualHeight=viewport?.height||window.innerHeight,offsetTop=viewport?.offsetTop||0;
    if(addressViewportLock&&Math.abs(window.innerWidth-addressViewportLock.width)>64){addressViewportLock=null;input.blur();}
    if(addressViewportLock&&!focused&&visualHeight>=addressViewportLock.height-80)addressViewportLock=null;
    const height=addressViewportLock?.height||visualHeight;
    document.body.classList.toggle('is-address-editing',Boolean(addressViewportLock));
    document.body.style.setProperty('--map-height',Math.round(height)+'px');
    // Safari pans the visual viewport independently of the fixed layout viewport.
    // Move the entire map shell with that pan so its header and map remain visible.
    document.body.style.setProperty('--map-viewport-top',Math.round(addressViewportLock?offsetTop:0)+'px');
    document.body.style.setProperty('--search-visible-height',Math.round(visualHeight)+'px');
    document.body.style.setProperty('--search-keyboard-lift',Math.round(addressViewportLock?Math.max(0,height-visualHeight):0)+'px');
    return Boolean(addressViewportLock);
  }
  function beginAddressEditing(){
    if(window.matchMedia('(max-width:760px)').matches&&!addressViewportLock){
      addressViewportLock={height:window.innerHeight,width:window.innerWidth};
    }
    measureMapOverlays();
  }
  function measureMapOverlays(){
    if(syncAddressViewport())return;
    const header=document.querySelector('.home-brand-banner'),dock=document.querySelector('.overview-top');
    const headerBottom=Math.ceil(header.getBoundingClientRect().bottom),dockHeight=Math.ceil(dock.getBoundingClientRect().height);
    document.body.style.setProperty('--map-header-bottom',headerBottom+'px');
    document.body.style.setProperty('--map-dock-height',dockHeight+'px');
    view?.setOverlayPadding?.({top:headerBottom+12,bottom:dockHeight+44,compact:window.matchMedia('(max-width:760px)').matches});
  }
  let overlayMeasureFrame=0;
  function scheduleOverlayMeasure(){
    if(overlayMeasureFrame)return;
    overlayMeasureFrame=requestAnimationFrame(()=>{overlayMeasureFrame=0;measureMapOverlays();});
  }
  const overlayObserver=new ResizeObserver(scheduleOverlayMeasure);overlayObserver.observe(document.querySelector('.home-brand-banner'));overlayObserver.observe(document.querySelector('.overview-top'));
  window.addEventListener('resize',scheduleOverlayMeasure);window.visualViewport?.addEventListener('resize',scheduleOverlayMeasure);window.visualViewport?.addEventListener('scroll',scheduleOverlayMeasure);
  $('addressSearch').addEventListener('focus',beginAddressEditing);$('addressSearch').addEventListener('blur',()=>{measureMapOverlays();requestAnimationFrame(measureMapOverlays);});measureMapOverlays();
  function guardMapPageZoom(frame){
    // WebKit's native gesture zoom can escape the SDK during fast multi-touch.
    // Cancel only the browser default; ArcGIS still receives the same events.
    const cancelNativeZoom=event=>{if(event.cancelable)event.preventDefault();};
    frame.addEventListener('gesturestart',cancelNativeZoom,{passive:false});
    frame.addEventListener('gesturechange',cancelNativeZoom,{passive:false});
    frame.addEventListener('touchmove',event=>{
      if(event.touches.length>1)cancelNativeZoom(event);
    },{passive:false});
  }
  guardMapPageZoom($('mapFrame'));
  $('mapZoomIn').addEventListener('click',()=>view?.zoomBy(1));
  $('mapZoomOut').addEventListener('click',()=>view?.zoomBy(-1));

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
    addressRequestId++;currentAddressMatch=null;selectIncident('');if(addressMarker){addressMarker.remove();addressMarker=null;}
    setSearchExpanded(false);$('addressSearch').value='';$('addressSearch').blur();$('addressForm').querySelector('button').disabled=false;
    $('addressIncidentResult').replaceChildren();$('addressIncidentResult').hidden=true;$('mapMessage').textContent='';

    $('incidentList').scrollLeft=0;
    setOptionsOpen(false);setIncidentMenuOpen(false);
    for(const id of ['roadsToggle','roadLayerToggle','poiLayerToggle','incidentLabelsToggle']){if(!$(id).checked){$(id).checked=true;$(id).dispatchEvent(new Event('change'));}}
    const url=new URL(location.href);url.searchParams.delete('incident');history.replaceState(null,'',url);
    if(view){view.closePopup();requestAnimationFrame(()=>{view.invalidateSize({pan:false});view.fitBounds(countyBounds,{padding:[20,20],county:true});});}
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
    const action=!lastIncidentSuccess?(incidentsError?'Zone status unavailable':'Checking zones…'):highest?{Go:'Evacuate Now',Shelter:'Shelter-In-Place',Set:'Prepare to Leave',Access:'Road Access Impacted'}[highest]:'No Listed Zone';
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
        const item=document.createElement('li'),badge=document.createElement('strong');item.className='address-zone-chip';badge.textContent=style.label;item.style.background=style.fill;item.style.borderColor=style.stroke;item.style.color='#000';item.style.setProperty('--zone-edge',style.stroke);if(status==='Access')item.classList.add('access-hatch');
        const zone=document.createElement('span');zone.textContent=String((zoneFields.zone && feature.properties[zoneFields.zone])||'Unnamed zone');item.append(badge,zone);list.appendChild(item);
      }
      group.appendChild(list);if(name){const link=incidentDetailsButton(name,'More info');link.setAttribute('aria-label','More info about '+name);moreLinks.push(link);}groups.appendChild(group);
    }
    content.appendChild(groups);
    if(moreLinks.length){
      const actions=document.createElement('div');actions.className='address-report-actions';
      for(const link of moreLinks)actions.appendChild(link);content.appendChild(actions);
    }
    content.title=match.address+' · Address location is approximate. Confirm incident instructions.';
    return content;
  }
  function setSearchExpanded(expanded){
    document.querySelector('.overview-top').classList.toggle('is-search-expanded',expanded);$('addressSearchClose').hidden=!expanded;
  }
  function closeAddressSearch(){
    addressRequestId++;currentAddressMatch=null;if(addressMarker){addressMarker.remove();addressMarker=null;}
    $('addressSearch').value='';$('addressForm').querySelector('button').disabled=false;
    $('addressIncidentResult').replaceChildren();$('addressIncidentResult').hidden=true;$('mapMessage').textContent='';setSearchExpanded(false);$('addressSearch').blur();
  }
  $('addressSearchClose').addEventListener('click',closeAddressSearch);
  $('addressSearch').addEventListener('input',()=>{
    addressRequestId++;currentAddressMatch=null;if(addressMarker){addressMarker.remove();addressMarker=null;}
    $('addressIncidentResult').replaceChildren();$('addressIncidentResult').hidden=true;$('mapMessage').textContent='';$('addressForm').querySelector('button').disabled=false;
    setSearchExpanded(Boolean($('addressSearch').value.trim()));
  });
  function renderAddressResult(){
    if(!currentAddressMatch)return;setSearchExpanded(true);
    $('addressIncidentResult').replaceChildren(addressIncidentContent(currentAddressMatch));$('addressIncidentResult').hidden=false;
  }
  $('addressForm').addEventListener('submit',async event=>{
    event.preventDefault();setOptionsOpen(false);setIncidentMenuOpen(false);if(!zoneFields)return;
    const text=$('addressSearch').value.trim();if(!text)return;setSearchExpanded(true);
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

  let refreshInFlight=null;
  function refreshAll(){
    if(!mapReady)return Promise.resolve();
    if(refreshInFlight)return refreshInFlight;
    $('refreshAll').disabled=true;
    refreshInFlight=Promise.all([view?.refreshLayers?view.refreshLayers():Promise.resolve(operationalLayers.forEach(layer=>layer.refresh())),refreshIncidents()])
      .finally(()=>{refreshInFlight=null;$('refreshAll').disabled=false;});
    return refreshInFlight;
  }
  $('refreshAll').addEventListener('click',refreshAll);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(!lastIncidentSuccess||Date.now()-lastIncidentSuccess>=C.refreshMs))refreshAll();});
  setInterval(()=>{if(!document.hidden)refreshAll();},C.refreshMs);
  initMap();
})();
