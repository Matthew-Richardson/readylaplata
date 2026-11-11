/* Incident information stays on the overview. Legacy incident URLs redirect here. */
(function () {
  'use strict';
  let generation=0,activePopup=null,refreshActiveZones=null;
  const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
  function close(){generation++;activePopup?.remove();activePopup=null;refreshActiveZones=null;}
  function safeUrl(value){
    const text=String(value||'').trim();if(!text)return null;
    try{const url=new URL(/^[a-z][a-z\d+.-]*:/i.test(text)?text:'https://'+text);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch(_){return null;}
  }
  function resourceCard(label,value,address){
    const card=node('section','incident-detail-resource'),heading=node('h4','',label);card.append(heading);
    const lines=String(value||'').trim().split(/\n+/).filter(Boolean);
    if(!lines.length)card.append(node('p','detail-pending',label==='Road closures'?'No road closures reported.':'Information pending — check back for updates.'));
    else lines.forEach((line,index)=>card.append(node(index===0&&label!=='Road closures'?'strong':'p','detail-resource-text',line)));
    const addresses=String(address||'').split(/[\n;]+/).map(a=>a.trim()).filter(Boolean);
    if(addresses.length){const directions=node('div','detail-directions');directions.append(node('span','detail-label','Directions'));for(const address of addresses){const link=node('a','home-btn',address);link.href='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(address);link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','Directions to '+address);directions.append(link);}card.append(directions);}
    return card;
  }
  async function open({name,view,latlng,getActiveZones,onZoom}={}){
    if(!view||!latlng)return;
    close();const request=generation;
    const content=node('section','incident-support-content');
    content.setAttribute('aria-label',name+' support resources');
    const header=node('div','incident-support-heading');header.append(node('h3','incident-support-title',name));
    const headerActions=node('div','incident-support-actions');
    const zoom=node('button','home-btn incident-support-zoom','Zoom To');zoom.type='button';zoom.disabled=typeof onZoom!=='function';zoom.setAttribute('aria-label','Zoom to '+name);zoom.addEventListener('click',()=>onZoom?.());headerActions.append(zoom);header.append(headerActions);
    content.append(header);
    const zoneArea=node('section','incident-active-zones');zoneArea.setAttribute('aria-label','Active zones for '+name);content.append(zoneArea);
    const accessArea=node('section','incident-access-descriptions');content.append(accessArea);
    const resourceHeading=node('div','detail-label','Incident support resources');content.append(resourceHeading);
    const resourceArea=node('div','incident-support-resources');resourceArea.setAttribute('aria-live','polite');content.append(resourceArea);
    function renderZones(){
      const report=getActiveZones?.();zoneArea.replaceChildren();accessArea.replaceChildren();accessArea.hidden=true;resourceHeading.hidden=false;resourceArea.hidden=false;
      zoneArea.append(node('h4','','Active zones'));
      if(!report?.available){zoneArea.append(node('p','detail-pending','Active zone information is unavailable.'));return;}
      if(report.stale)zoneArea.append(node('p','detail-pending','Showing last known zones. Updates are temporarily unavailable.'));
      const unique=new Map();for(const zone of report.zones)unique.set(JSON.stringify([zone.name,zone.status,zone.description]),zone);
      const order=['Go','Shelter','Set','Access','Planning'];
      const zones=[...unique.values()].sort((a,b)=>order.indexOf(a.status)-order.indexOf(b.status)||a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
      if(!zones.length){zoneArea.append(node('p','detail-pending','No active zones are currently listed for this incident.'));return;}
      for(const key of order){
        const members=zones.filter(zone=>zone.status===key);if(!members.length)continue;
        const group=node('section','incident-zone-group'),style=window.ReadyLaPlataZones.styles[key];
        const heading=node('h5','incident-zone-group-heading'),symbol=node('span','incident-status-symbol');
        symbol.setAttribute('aria-hidden','true');symbol.style.background=style.fill;symbol.style.borderColor=style.stroke;
        if(style.hatch)symbol.classList.add('access-hatch');
        heading.append(symbol,node('span','',style.label));group.append(heading);
        const list=node('ul','incident-zone-list');
        for(const zone of members){
          const row=node('li','incident-zone-row'),zoneName=node('strong','incident-zone-name',zone.name);
          row.append(zoneName);list.append(row);
        }
        group.append(list);zoneArea.append(group);
      }
      const access=zones.filter(zone=>zone.status==='Access');
      const accessOnly=zones.length>0&&zones.every(zone=>zone.status==='Access');
      resourceHeading.hidden=accessOnly;resourceArea.hidden=accessOnly;
      if(access.length){
        accessArea.hidden=false;accessArea.append(node('h4','','Access issues'));
        for(const zone of access){
          const description=String(zone.description||'').trim();if(!description)continue;
          const item=node('div','incident-access-description');
          item.append(node('strong','',zone.name),node('p','',description));accessArea.append(item);
        }
        if(accessArea.children.length===1){
          if(accessOnly)accessArea.append(node('p','detail-pending','Access details have not been posted. Follow current incident instructions.'));
          else accessArea.hidden=true;
        }
      }
    }
    renderZones();
    const loading=node('p','detail-pending','Loading incident information…');resourceArea.append(loading);
    const popup=view.openSupportPopup(latlng,content);activePopup=popup;
    const current=()=>request===generation&&popup.isOpen();
    refreshActiveZones=()=>{if(current()){renderZones();popup.update();}};
    try{
      const response=await fetch('incident.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('HTTP '+response.status);
      const records=await response.json();if(!Array.isArray(records))throw new Error('Invalid incident information');
      if(!current())return;
      loading.remove();const data=records.find(record=>String(record.name||'').toLowerCase()===name.toLowerCase());
      if(!data){resourceArea.append(node('p','detail-pending','Support information has not been posted for this incident. Follow current zone instructions.'));popup.update();return;}
      const url=safeUrl(data.statusLink);if(url){const link=node('a','home-btn primary incident-latest-update','Latest update');link.href=url;link.target='_blank';link.rel='noopener noreferrer';headerActions.append(link);}
      const grid=node('div','incident-detail-resource-grid');
      grid.append(resourceCard('Check-in location',data.checkIn,data.checkInAddr),resourceCard('Evacuation shelters',data.shelters,data.sheltersAddr),resourceCard('Road closures',data.road),resourceCard('Small animals',data.smallAnimals,data.smallAnimalsAddr),resourceCard('Large animals',data.largeAnimals,data.largeAnimalsAddr));resourceArea.append(grid);
      resourceArea.append(node('p','incident-detail-source','La Plata County OEM · Information can change. Follow current incident instructions.'));
      popup.update();
    }catch(_){if(!current())return;loading.textContent='Incident support information could not be loaded.';
      const retry=node('button','home-btn','Retry information');retry.type='button';retry.addEventListener('click',()=>open({name,view,latlng,getActiveZones,onZoom}));resourceArea.append(retry);popup.update();}
  }
  window.ReadyLaPlataDetails={open,close,refreshZones:()=>refreshActiveZones?.()};
})();
