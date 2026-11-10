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
  async function open({name,view,latlng,getActiveZones}={}){
    if(!view||!latlng)return;
    close();const request=generation;
    const content=node('section','incident-support-content');
    content.setAttribute('aria-label',name+' support resources');
    const header=node('div','incident-support-heading');header.append(node('h3','incident-support-title',name));
    content.append(header);
    const zoneArea=node('section','incident-active-zones');zoneArea.setAttribute('aria-label','Active zones for '+name);content.append(zoneArea);
    function renderZones(){
      const report=getActiveZones?.();zoneArea.replaceChildren();
      zoneArea.append(node('h4','','Active zones'));
      if(!report?.available){zoneArea.append(node('p','detail-pending','Active zone information is unavailable.'));return;}
      if(report.stale)zoneArea.append(node('p','detail-pending','Showing last known zones. Updates are temporarily unavailable.'));
      const unique=new Map();for(const zone of report.zones)unique.set(JSON.stringify([zone.name,zone.status]),zone);
      const order=['Go','Shelter','Set','Access','Planning'];
      const zones=[...unique.values()].sort((a,b)=>order.indexOf(a.status)-order.indexOf(b.status)||a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
      if(!zones.length){zoneArea.append(node('p','detail-pending','No active zones are currently listed for this incident.'));return;}
      const list=node('ul','incident-zone-list');
      for(const zone of zones){
        const style=window.ReadyLaPlataZones.styles[zone.status],row=node('li','incident-zone-row');
        row.append(node('strong','incident-zone-name',zone.name));
        const status=node('span','incident-zone-status'),symbol=node('span','incident-status-symbol');symbol.setAttribute('aria-hidden','true');
        symbol.style.background=style.fill;symbol.style.borderColor=style.stroke;if(style.hatch)symbol.classList.add('access-hatch');
        status.append(symbol,node('span','',style.label));row.append(status);list.append(row);
      }
      zoneArea.append(list);
    }
    renderZones();
    content.append(node('div','detail-label','Incident support resources'));
    const resourceArea=node('div','incident-support-resources');resourceArea.setAttribute('aria-live','polite');content.append(resourceArea);
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
      const url=safeUrl(data.statusLink);if(url){const link=node('a','home-btn primary incident-latest-update','Latest update');link.href=url;link.target='_blank';link.rel='noopener noreferrer';header.append(link);}
      const grid=node('div','incident-detail-resource-grid');
      grid.append(resourceCard('Check-in location',data.checkIn,data.checkInAddr),resourceCard('Evacuation shelters',data.shelters,data.sheltersAddr),resourceCard('Road closures',data.road),resourceCard('Small animals',data.smallAnimals,data.smallAnimalsAddr),resourceCard('Large animals',data.largeAnimals,data.largeAnimalsAddr));resourceArea.append(grid);
      resourceArea.append(node('p','incident-detail-source','La Plata County OEM · Information can change. Follow current incident instructions.'));
      popup.update();
    }catch(_){if(!current())return;loading.textContent='Incident support information could not be loaded.';
      const retry=node('button','home-btn','Retry information');retry.type='button';retry.addEventListener('click',()=>open({name,view,latlng,getActiveZones}));resourceArea.append(retry);popup.update();}
  }
  window.ReadyLaPlataDetails={open,close,refreshZones:()=>refreshActiveZones?.()};
})();
