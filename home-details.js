/* Incident information stays on the overview. Legacy incident URLs redirect here. */
(function () {
  'use strict';
  let generation=0,activePopup=null;
  const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
  function close(){generation++;activePopup?.remove();activePopup=null;}
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
  async function open({name,view,latlng}={}){
    if(!view||!latlng)return;
    close();const request=generation;
    const content=node('section','incident-support-content');
    content.setAttribute('aria-label',name+' support resources');
    content.append(node('h3','incident-support-title',name),node('div','detail-label','Incident support resources'));
    const resourceArea=node('div','incident-support-resources');resourceArea.setAttribute('aria-live','polite');content.append(resourceArea);
    const loading=node('p','detail-pending','Loading incident information…');resourceArea.append(loading);
    const popup=view.openSupportPopup(latlng,content);activePopup=popup;
    const current=()=>request===generation&&popup.isOpen();
    try{
      const response=await fetch('incident.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('HTTP '+response.status);
      const records=await response.json();if(!Array.isArray(records))throw new Error('Invalid incident information');
      if(!current())return;
      loading.remove();const data=records.find(record=>String(record.name||'').toLowerCase()===name.toLowerCase());
      if(!data){resourceArea.append(node('p','detail-pending','Support information has not been posted for this incident. Follow current zone instructions.'));popup.update();return;}
      const url=safeUrl(data.statusLink);if(url){const link=node('a','home-btn primary','Latest county update');link.href=url;link.target='_blank';link.rel='noopener noreferrer';resourceArea.append(link);}
      const grid=node('div','incident-detail-resource-grid');
      grid.append(resourceCard('Check-in location',data.checkIn,data.checkInAddr),resourceCard('Evacuation shelters',data.shelters,data.sheltersAddr),resourceCard('Road closures',data.road),resourceCard('Small animals',data.smallAnimals,data.smallAnimalsAddr),resourceCard('Large animals',data.largeAnimals,data.largeAnimalsAddr));resourceArea.append(grid);
      resourceArea.append(node('p','incident-detail-source','La Plata County OEM · Information can change. Follow current incident instructions.'));
      popup.update();
    }catch(_){if(!current())return;loading.textContent='Incident support information could not be loaded.';
      const retry=node('button','home-btn','Retry information');retry.type='button';retry.addEventListener('click',()=>open({name,view,latlng}));resourceArea.append(retry);popup.update();}
  }
  window.ReadyLaPlataDetails={open,close};
})();
