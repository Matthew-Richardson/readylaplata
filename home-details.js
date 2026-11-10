/* Incident information stays on the overview. Legacy incident URLs redirect here. */
(function () {
  'use strict';
  const Z=window.ReadyLaPlataZones;
  const dialog=document.getElementById('incidentDialog'),title=document.getElementById('incidentDialogTitle'),body=document.getElementById('incidentDialogBody');
  let generation=0;
  const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
  function close(){generation++;dialog.close();}
  document.getElementById('incidentDialogClose').addEventListener('click',close);
  document.getElementById('incidentDialogDone').addEventListener('click',close);
  dialog.addEventListener('close',()=>{generation++;});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
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
    if(addresses.length){const directions=node('div','detail-directions');directions.append(node('span','detail-label','Directions'));for(const address of addresses){const link=node('a','home-btn',address);link.href='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(address);link.target='_blank';link.rel='noopener noreferrer';directions.append(link);}card.append(directions);}
    return card;
  }
  function zoneCards(zones,statusField,zoneField){
    const grid=node('div','incident-detail-zones');
    for(const status of ['Go','Shelter','Set','Access','Planning']){
      const features=zones.filter(f=>Z.key(f.properties[statusField])===status);if(!features.length)continue;
      const style=Z.styles[status],card=node('section','incident-detail-zone'),label=node('h4','',style.label);
      card.style.background=style.fill;card.style.borderColor=style.stroke;
      const actions={Go:'Evacuate now. Follow incident instructions.',Shelter:'Stay indoors. Follow incident instructions.',Set:'Prepare to leave. Follow incident instructions.',Access:'Road access is affected. Review closures and instructions.',Planning:'Used for testing. No protective action ordered.'};
      card.append(label,node('p','',actions[status]));const chips=node('div','incident-detail-zone-chips');
      features.forEach(f=>chips.append(node('span','',String(f.properties[zoneField]||'Unnamed zone'))));card.append(chips);grid.append(card);
    }
    return grid;
  }
  async function open({names=[],addressContent=null,zones=[],statusField,zoneField,incidentField,addressLabel}={}){
    const request=++generation;
    title.textContent=addressLabel?addressLabel+' — Incident information':names.length===1?names[0]:'Incident information';
    body.replaceChildren();if(addressContent)body.append(addressContent);
    const resourceArea=node('div','incident-detail-sections');body.append(resourceArea);
    const sections=names.map(name=>{const section=node('section','incident-detail-section');section.append(node('h3','',name));
      // The address summary already lists every zone containing that address.
      if(!addressContent)section.append(zoneCards(zones.filter(f=>String(f.properties[incidentField]||'').trim()===name),statusField,zoneField));
      const loading=node('p','detail-pending','Loading incident information…');section.append(loading);resourceArea.append(section);return {name,section,loading};});
    if(!dialog.open)dialog.showModal();body.scrollTop=0;
    if(!names.length)return;
    try{
      const response=await fetch('incident.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('HTTP '+response.status);
      const records=await response.json();if(!Array.isArray(records))throw new Error('Invalid incident information');
      if(request!==generation||!dialog.open)return;
      for(const {name,section,loading} of sections){loading.remove();const data=records.find(record=>String(record.name||'').toLowerCase()===name.toLowerCase());
        if(!data){section.append(node('p','detail-pending','Detailed support information has not been posted for this incident. Follow current zone instructions.'));continue;}
        const url=safeUrl(data.statusLink);if(url){const link=node('a','home-btn primary','Latest county update ↗');link.href=url;link.target='_blank';link.rel='noopener noreferrer';section.append(link);}
        const grid=node('div','incident-detail-resource-grid');
        grid.append(resourceCard('Check-in location',data.checkIn,data.checkInAddr),resourceCard('Evacuation shelters',data.shelters,data.sheltersAddr),resourceCard('Road closures',data.road),resourceCard('Small animals',data.smallAnimals,data.smallAnimalsAddr),resourceCard('Large animals',data.largeAnimals,data.largeAnimalsAddr));section.append(grid);
      }
      resourceArea.append(node('p','incident-detail-source','Source: La Plata County Office of Emergency Management · Loaded '+new Date().toLocaleString('en-US',{timeZone:'America/Denver',hour:'numeric',minute:'2-digit',timeZoneName:'short'})));
    }catch(_){if(request!==generation||!dialog.open)return;for(const {loading} of sections){loading.textContent='Incident support information could not be loaded.';}
      const retry=node('button','home-btn','Retry information');retry.type='button';retry.addEventListener('click',()=>open({names,addressContent,zones,statusField,zoneField,incidentField,addressLabel}));resourceArea.append(retry);}
  }
  window.ReadyLaPlataDetails={open,close};
})();
