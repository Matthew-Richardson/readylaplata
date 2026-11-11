// Run from the repository root: node tests/incident-details.test.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.className='';this.listeners={};this.attributes={};this._text='';this.classList={add:c=>this.className+=' '+c};}
 set textContent(value){this._text=String(value);this.children=[]}get textContent(){return this._text+this.children.map(e=>e.textContent).join('')}
 append(...items){for(const item of items){item.parent=this;this.children.push(item)}}setAttribute(k,v){this.attributes[k]=v}addEventListener(k,fn){this.listeners[k]=fn}
 replaceChildren(...items){this._text='';this.children=[];this.append(...items)}remove(){if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this)}
}
const find=(element,cls)=>[element,...element.children.flatMap(child=>find(child,cls))].filter(e=>e.className.split(' ').includes(cls));
let content,records=[],zooms=0;
const context={window:{},document:{createElement:tag=>new Element(tag)},URL,AbortSignal,fetch:async()=>({ok:true,json:async()=>records})};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../zone-status.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../home-details.js'),'utf8'),context);
const view={openSupportPopup(_,node){content=node;return {isOpen:()=>true,remove(){},update(){}}}};
(async()=>{
 const API=context.window.ReadyLaPlataDetails,report=()=>({available:true,stale:false,zones:[{name:'JUN-1',status:'Go'}]});
 await API.open({name:'Example',view,latlng:[37.3,-107.8],getActiveZones:report,onZoom:()=>zooms++});
 const zoom=find(content,'incident-support-zoom')[0];assert.equal(zoom.textContent,'Zoom To');assert.equal(zoom.disabled,false);zoom.listeners.click();assert.equal(zooms,1);assert(content.textContent.includes('Support information has not been posted'));
 records=[{name:'Example',statusLink:'https://example.com/update'}];await API.open({name:'Example',view,latlng:[37.3,-107.8],getActiveZones:report,onZoom:()=>zooms++});
 const actions=find(content,'incident-support-actions')[0];assert.equal(find(actions,'incident-support-zoom').length,1);assert.equal(find(actions,'incident-latest-update').length,1);
 await API.open({name:'Example',view,latlng:[37.3,-107.8],getActiveZones:report});assert.equal(find(content,'incident-support-zoom')[0].disabled,true);
 let zones=[{name:'ACCESS-1',status:'Access',description:'Bridge closed.\nUse CR 203.'}];
 const accessReport=()=>({available:true,stale:false,zones});
 await API.open({name:'Example',view,latlng:[37.3,-107.8],getActiveZones:accessReport});
 assert.equal(find(content,'incident-support-resources')[0].hidden,true,'Access-only hides evacuation resources');
 const descriptions=find(content,'incident-access-descriptions')[0];assert.equal(descriptions.hidden,false);assert(descriptions.textContent.includes('Bridge closed.\nUse CR 203.'));
 zones.push({name:'ACCESS-2',status:'Access',description:'Second closure'});API.refreshZones();
 assert.equal(find(content,'incident-zone-group').length,1,'same status shares one group');assert.equal(find(content,'incident-zone-row').length,2,'both zones remain visible');
 zones.push({name:'GO-1',status:'Go',description:'Not an access description'});API.refreshZones();
 assert.equal(find(content,'incident-support-resources')[0].hidden,false,'mixed incidents keep support resources');assert.equal(find(content,'incident-zone-group').length,2,'different statuses have separate groups');
 assert(!descriptions.textContent.includes('Not an access description'));
 assert(content.children.indexOf(descriptions)>content.children.indexOf(find(content,'incident-active-zones')[0]),'Access descriptions follow active zones');
 zones=[{name:'ACCESS-1',status:'Access',description:''}];API.refreshZones();assert(descriptions.textContent.includes('Access details have not been posted'));
 zones=[{name:'SET-1',status:'Set'}];API.refreshZones();assert.equal(descriptions.hidden,true);assert.equal(find(content,'incident-support-resources')[0].hidden,false);
 console.log('PASS: Access-only descriptions, mixed incident resources, zone refresh transitions, blank descriptions, and description placement.');
 console.log('PASS: popup Zoom To invokes incident navigation, remains available without posted resources, shares actions with Latest update, and disables when navigation is unavailable.');
})().catch(error=>{console.error(error);process.exit(1)});
