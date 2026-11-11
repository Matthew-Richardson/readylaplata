// Run from the repository root: node tests/search-overlay.test.cjs
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../home.js'),'utf8');
const nodes={},classes=new Set(),dock={classList:{toggle(key,on){on?classes.add(key):classes.delete(key)}}};
for(const id of ['addressSearch','addressSearchClose','addressIncidentResult','mapMessage','addressForm'])nodes[id]={value:'',hidden:false,content:'',disabled:false,listeners:{},addEventListener(event,callback){this.listeners[event]=callback},replaceChildren(){this.content=''},blur(){this.blurred=true},querySelector(){return nodes.submit}};
nodes.submit={disabled:true};nodes.addressSearch.value='6000 CR 203';nodes.addressIncidentResult.content='Existing status';
let removed=0;const context={document:{querySelector:()=>dock},$:id=>nodes[id],Boolean};vm.createContext(context);
const start=source.indexOf('  function setSearchExpanded('),end=source.indexOf('  function renderAddressResult()',start);
vm.runInContext(`let addressRequestId=3,currentAddressMatch={address:'old'},addressMarker={remove(){removed()}};${source.slice(start,end)};globalThis.state=()=>({request:addressRequestId,match:currentAddressMatch,marker:addressMarker});`,Object.assign(context,{removed:()=>removed++}));
context.setSearchExpanded(true);assert(classes.has('is-search-expanded'));assert.equal(nodes.addressSearchClose.hidden,false);
context.closeAddressSearch();assert.equal(context.state().request,4);assert.equal(context.state().match,null);assert.equal(context.state().marker,null);assert.equal(removed,1);assert.equal(nodes.addressSearch.value,'');assert.equal(nodes.addressIncidentResult.hidden,true);assert.equal(nodes.submit.disabled,false);assert(!classes.has('is-search-expanded'));assert.equal(nodes.addressSearchClose.hidden,true);
nodes.addressSearch.value='6000 CR 203';nodes.addressSearch.listeners.input();assert(classes.has('is-search-expanded'));assert.equal(nodes.addressSearchClose.hidden,false);
nodes.addressSearch.value='';nodes.addressSearch.listeners.input();assert(!classes.has('is-search-expanded'));
assert(!source.slice(start,end).includes('fitBounds'),'close preserves map extent');assert(!source.includes("reset.textContent='Reset'"),'address result has no Reset action');
console.log('PASS: typing expands search, clearing collapses it, close cancels stale requests and clears only address data without resetting the map.');
