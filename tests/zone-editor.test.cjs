const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../zone.html'),'utf8');
class E{
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.style={};this.attributes={};this._value='';this.textContent='';this.className='';this.classList={add(){}};}
 appendChild(c){this.children.push(c);c.parent=this;if(this.tag==='select'&&(c.selected||this.children.length===1))this._value=String(c.value);return c;}
 append(...cs){cs.forEach(c=>this.appendChild(c));}set innerHTML(v){this.children=[];}set value(v){this._value=String(v)}get value(){return this._value}
 setAttribute(k,v){this.attributes[k]=v}addEventListener(){}
 querySelectorAll(s){return this.children.flatMap(c=>[...(s==='[data-field]'&&c.dataset.field?[c]:s==='.status-opt'&&c.className==='status-opt'?[c]:[]),...c.querySelectorAll(s)])}
 querySelector(s){return this.querySelectorAll(s)[0]}
}
const nodes={fields:new E('div')},ctx={document:{createElement:t=>new E(t)},CONFIG:{statusOptions:['Go','Set','Shelter','Access','Planning']},loadIncidentValues(){},incidentValues:[],oidField:'OBJECTID',layer:{geometryType:'polygon',fields:[{name:'STATUS',type:'string'},{name:'incident',type:'string'},{name:'zonename',type:'string'},{name:'Live',type:'small-integer'}]},editor:new E('div'),deleteBtn:new E('button'),fieldsEl:nodes.fields,mode:'edit',$:id=>nodes[id]||(nodes[id]=new E('div'))};
vm.createContext(ctx);
const a=html.indexOf('  const SKIP ='),b=html.indexOf('  function polygonArea',a);vm.runInContext(html.slice(a,b)+'\nglobalThis.openForm=openForm;globalThis.readForm=readForm;globalThis.initialLiveValue=initialLiveValue;globalThis.canonicalStatus=canonicalStatus;globalThis.renderer=editorStatusRenderer;',ctx);
ctx.openForm({OBJECTID:1,STATUS:'shelter in place',incident:'TEST ONLY',zonename:'TEST-8',Live:1},'Edit zone');
let attrs=ctx.readForm();assert.equal(attrs.STATUS,'Shelter');assert.equal(attrs.Live,1);assert.equal(typeof attrs.Live,'number');assert.equal(attrs.incident,'TEST ONLY');
let controls=nodes.fields.querySelectorAll('[data-field]');let live=controls.find(c=>c.dataset.field==='Live');live.value='0';assert.equal(ctx.readForm().Live,0);
assert.equal(ctx.initialLiveValue(1,'add'),0);assert.equal(ctx.initialLiveValue(1,'carve'),0);assert.equal(ctx.initialLiveValue(1,'split'),1);assert.equal(ctx.initialLiveValue(null,'edit'),0);
const statuses=nodes.fields.children.find(c=>c.children.some(x=>x.className==='status-opts')).children.find(c=>c.className==='status-opts');assert.equal(statuses.children.length,5);assert.equal(statuses.children[2].children[1].textContent,'Shelter-In-Place');assert.equal(statuses.children[3].children[1].textContent,'Access Impact Area');statuses.children[3].onclick();assert.equal(ctx.readForm().STATUS,'Access');
let renderer=ctx.renderer('STATUS');assert.equal(renderer.uniqueValueInfos.length,5);assert.equal(renderer.uniqueValueInfos[3].symbol.style,'backward-diagonal');
ctx.mode='add';ctx.openForm(null,'New zone');assert.equal(ctx.readForm().Live,0);
// Exercise the actual pre-save attribute checks without touching geometry or AGOL.
let prefix=html.slice(html.indexOf('  async function onSave(){'),html.indexOf('    setSaving(true);',html.indexOf('  async function onSave(){')));
vm.runInContext(prefix+"return 'ready';}\nglobalThis.validate=onSave;",ctx);Object.assign(ctx,{saving:false,mergeBusy:false,selected:{},sketchVM:{state:'ready'},toast:message=>ctx.message=message});
(async()=>{ctx.mode='edit';ctx.openForm({OBJECTID:1,STATUS:'Go',Live:1},'Edit');assert.equal(await ctx.validate(),undefined);assert.match(ctx.message,/incident/);ctx.openForm({OBJECTID:1,STATUS:'Go',Live:0},'Edit');assert.equal(await ctx.validate(),'ready');console.log('PASS: five statuses, labels, aliases, LIVE integer values/defaults/inheritance, editor renderer, and required active-zone attributes.');})().catch(e=>{console.error(e);process.exit(1)});
