// Run from the repository root: node tests/home-map.test.cjs
// Model the SDK's service URL + layerId representation, including layer zero.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
class Collection extends Array{toArray(){return [...this]}add(x){this.push(x)}addMany(xs){this.push(...xs)}removeAll(){this.length=0}remove(x){const i=this.indexOf(x);if(i>=0)this.splice(i,1)}}
class Layer{constructor(p){Object.assign(this,p);this.visible=p.visible??true;this.graphics=new Collection()}load(){return Promise.resolve(this)}refresh(){this.refreshed=true}add(x){this.graphics.add(x)}addMany(xs){this.graphics.addMany(xs)}remove(x){this.graphics.remove(x)}removeAll(){this.graphics.removeAll()}}
const config={zonesWhere:'LIVE = 1',webmapId:'source-map',zonesUrl:'https://example.test/zones/0',roadsServiceUrl:'https://example.test/roads',roadClosuresUrl:'https://example.test/pois/1',evacPoisUrl:'https://example.test/pois/0',countyBounds:[[36.98,-108.4],[37.65,-107.46]]};
const group={type:'group',visible:false};const native=[new Layer({url:config.zonesUrl,title:'Zones',fields:[{name:'LIVE'},{name:'incident'}],definitionExpression:'incident IS NOT NULL'}),new Layer({url:config.roadClosuresUrl,title:'Road info'}),new Layer({url:config.evacPoisUrl,title:'POI',parent:group}),new Layer({type:'vector-tile',title:'Roads'})];
for(const layer of native){if(layer.url&&/\/[01]$/.test(layer.url)){layer.layerId=Number(layer.url.slice(-1));layer.url=layer.url.slice(0,-2);}}
let map,view;class WebMap{constructor(p){map=this;Object.assign(this,p);this.layers=new Collection(...native);this.allLayers=this.layers;}load(){return Promise.resolve(this)}add(x){this.layers.add(x)}addMany(xs){this.layers.addMany(xs)}reorder(x,n){this.layers.remove(x);this.layers.splice(n,0,x)}}
class MapView{constructor(p){view=this;Object.assign(this,p);this.zoom=9;this.widgetMoves=[];this.widgetRemoved=[];this.ui={move:(...args)=>this.widgetMoves.push(args),remove:id=>this.widgetRemoved.push(id)};this.scale=100000;this.width=1000;this.height=700;this.handlers={};this.moves=[]}on(event,fn){this.handlers[event]=fn}when(){return Promise.resolve(this)}goTo(target){this.moves.push(target);if(target.zoom)this.zoom=target.zoom;return Promise.resolve()}toScreen(){return {x:400,y:300}}closePopup(){}openPopup(p){this.popupOpened=p}hitTest(){return Promise.resolve(this.hits||{results:[]})}}
class Model{constructor(p){Object.assign(this,p)}}class Extent extends Model{expand(factor){return {...this,factor}}}
const controls=Object.fromEntries(['roadsToggle','roadLayerToggle','poiLayerToggle','incidentLabelsToggle','mapMessage'].map(id=>[id,{dataset:{},listeners:{},addEventListener(e,fn){this.listeners[e]=fn;}}]));
const watchers=[];const modules=[WebMap,MapView,Layer,Model,Model,Extent,{watch(getter,callback){watchers.push(callback)}}];
class LabelElement{constructor(){this.children=[];this.listeners={};this.style={setProperty(k,v){this[k]=v}};this.classList={add(){}};this.hidden=false;this.offsetWidth=180;this.offsetHeight=50;}setAttribute(k,v){this[k]=v}getAttribute(k){return this[k]}focus(){}remove(){if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this)}contains(){return false}append(...elements){for(const element of elements){element.parent=this;this.children.push(element)}}appendChild(element){element.parent=this;this.children.push(element)}replaceChildren(){this.children=[]}addEventListener(type,fn){this.listeners[type]=fn}}
controls.incidentMapLabels=new LabelElement();
const context={window:{require(names,fn){fn(...modules)},ReadyLaPlataZones:{renderer:field=>({type:'unique-value',field}),styles:{Go:{stroke:'#15803d'},Shelter:{stroke:'#1e6eb6'},Access:{stroke:'#824ab6'}}}},document:{getElementById:id=>controls[id],createElement:()=>new LabelElement()},console:{...console,warn(){},error(){}}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../home-map.js'),'utf8'),context);
(async()=>{
 
 const API=context.window.ReadyLaPlataMap,adapter=await API.create({container:'viewDiv',config,fields:{status:'STATUS',zone:'zonename',incident:'incident'},popupFor(){},onIncident(name){context.clicked=name}});
 const polygon=coordinates=>({geometry:{type:'Polygon',coordinates}});
 const concave=API.interiorPointForFeature(polygon([[[0,0],[10,0],[10,2],[2,2],[2,10],[0,10],[0,0]]]));assert(concave&&(concave.lng<=2||concave.lat<=2),'anchor remains inside concave zone');
 const donut=API.interiorPointForFeature(polygon([[[0,0],[10,0],[10,10],[0,10],[0,0]],[[4,4],[6,4],[6,6],[4,6],[4,4]]]));assert(donut&&!(donut.lng>4&&donut.lng<6&&donut.lat>4&&donut.lat<6),'anchor avoids zone holes');
 assert.equal(map.portalItem.id,'source-map');assert.equal(map.layers.filter(l=>l===native[0]).length,1,'no duplicate zone layers');
 assert.equal(native[0].definitionExpression,'(incident IS NOT NULL) AND (LIVE = 1)');assert.equal(native[0].renderer,undefined);assert.equal(native[0].labelingInfo,undefined);
 assert.equal(map.layers.length,native.length+2,'only incident summaries and temporary address layer may be added');
 assert(view.widgetRemoved.includes('zoom'));assert.equal(view.widgetMoves[0][0],'attribution');assert.equal(view.widgetMoves[0][1],'manual');assert.equal(view.constraints.snapToZoom,false);
 assert.equal(view.popup.autoOpenEnabled,undefined,'use native feature popups');
 await adapter.fitBounds(config.countyBounds);assert.equal(view.moves.at(-1).xmin,-108.4);assert.equal(view.moves.at(-1).ymax,37.65);
 const beforeZoom=view.zoom;await adapter.fitBounds(config.countyBounds,{county:true});assert.equal(view.zoom,beforeZoom,'county fit does not add a zoom level');assert.equal(view.moves.at(-1).factor,1.02);
 await adapter.setView([37.4,-107.8],15);assert.equal(view.moves.at(-1).center.longitude,-107.8);assert.equal(view.moves.at(-1).zoom,15);
 controls.poiLayerToggle.checked=false;controls.poiLayerToggle.listeners.change();assert.equal(native[2].visible,false);
 controls.poiLayerToggle.checked=true;controls.poiLayerToggle.listeners.change();assert.equal(native[2].visible,true);assert.equal(group.visible,true);
 adapter.setIncidents([{name:'TEST ONLY',point:{lat:37.3,lng:-107.8},statuses:['Shelter','Access']}]);
 const pins=map.layers.find(l=>l.title==='Active incidents');assert.equal(pins.graphics.length,1);assert.equal(pins.graphics[0].attributes.incident,'TEST ONLY');
 assert.equal(controls.incidentMapLabels.children[1].hidden,true,'incident labels start off by default');
 controls.incidentLabelsToggle.checked=false;controls.incidentLabelsToggle.listeners.change();assert.equal(controls.incidentMapLabels.children[1].hidden,true,'incident name plate hides');assert.equal(pins.visible,true,'incident points stay visible');
 controls.incidentLabelsToggle.checked=true;controls.incidentLabelsToggle.listeners.change();
 const plate=controls.incidentMapLabels.children[1];assert.equal(plate.children[0].textContent,'TEST ONLY');assert.equal(plate.children[1].children.length,2);assert.equal(plate.hidden,false);
 view.scale=50000;watchers[0]();assert.equal(plate.hidden,true);assert.equal(native[0].labelsVisible,true);assert.equal(pins.visible,false);
 view.scale=100000;watchers[0]();assert.equal(plate.hidden,false);assert.equal(native[0].labelsVisible,false);
 plate.listeners.click({stopPropagation(){}});assert.equal(context.clicked,'TEST ONLY');
 assert.equal(plate.listeners.pointerdown,undefined,'label does not intercept drag input');
 context.clicked=null;await view.handlers.click({x:400,y:300,mapPoint:{latitude:37.3,longitude:-107.8}});assert.equal(context.clicked,'TEST ONLY','map tap on visible label opens that incident');
 view.scale=50000;watchers[0]();context.clicked=null;view.hits={results:[]};await view.handlers.click({x:400,y:300});assert.equal(context.clicked,null,'hidden labels do not intercept map taps');view.scale=100000;watchers[0]();
 await adapter.zoomBy(1);assert.equal(view.zoom,16);await adapter.zoomBy(-1);assert.equal(view.zoom,15);
 context.clicked=null;view.hits={results:[{graphic:{layer:pins,attributes:{incident:'TEST ONLY'}}}]};await view.handlers.click({mapPoint:{latitude:37.3,longitude:-107.8}});assert.equal(context.clicked,'TEST ONLY','incident pin opens support resources');
 adapter.setIncidents([{name:'First',point:{lat:37.3,lng:-107.8},statuses:['Go']},{name:'Second',point:{lat:37.3,lng:-107.8},statuses:['Access']}]);
 assert.equal(controls.incidentMapLabels.children.filter(element=>element.className==='incident-area-label').length,2,'nearby incidents remain individual labels');
 assert.notEqual(controls.incidentMapLabels.children[1].style.top,controls.incidentMapLabels.children[3].style.top,'nearby labels separate vertically');
 adapter.setIncidents(['Priority Go','Shelter','Set','Access','Planning'].map((name,index)=>({name,point:{lat:37.3,lng:-107.8},statuses:[['Go','Shelter','Set','Access','Planning'][index]]})));
 const individual=controls.incidentMapLabels.children.filter(element=>element.className==='incident-area-label');
 assert.equal(individual.length,5);assert(individual.every(element=>!element.hidden),'every enabled name remains visible');assert.equal(pins.graphics.length,5);
 assert(!controls.incidentMapLabels.children.some(element=>element.className.includes('incident-area-group')),'no grouped labels are created');
 view.toScreen=point=>({x:120+(point.longitude+108)*800,y:300});adapter.setIncidents([{name:'Separated Go',point:{lat:37.3,lng:-108},statuses:['Go']},{name:'Separated Access',point:{lat:37.3,lng:-107.5},statuses:['Access']}]);
 assert(controls.incidentMapLabels.children.filter(element=>element.className==='incident-area-label').every(element=>!element.hidden),'separated labels remain visible');view.toScreen=()=>({x:400,y:300});
 adapter.setIncidents([]);assert.equal(controls.incidentMapLabels.children.length,0);assert.equal(pins.graphics.length,0,'refresh removes old incident markers');adapter.setOverlayPadding({top:90,bottom:140,compact:true});assert.equal(view.padding.left,12);assert.equal(view.padding.right,12);assert.equal(view.padding.top,view.padding.bottom);adapter.setOverlayPadding({top:90,bottom:140});assert.equal(view.padding.top,90);assert.equal(view.padding.bottom,140);
 const marker=adapter.markAddress({location:{x:-107.8,y:37.4}}),address=map.layers.find(l=>l.title==='Searched address');assert.equal(address.graphics.length,1);marker.remove();assert.equal(address.graphics.length,0);
 const previousPadding=view.padding;adapter.setOverlayPadding({top:90,bottom:140});assert.equal(view.padding,previousPadding,'unchanged overlay padding does not trigger SDK relayout');
 assert.equal(adapter.operationalLayers.length,3);

 view.hits={results:[{graphic:{layer:native[0],attributes:{LIVE:1,incident:'TEST ONLY'}}}]};
 await view.handlers.click({mapPoint:{latitude:37.3,longitude:-107.8}});assert.equal(context.clicked,'TEST ONLY');
 context.clicked=null;view.hits.results[0].graphic.attributes.LIVE=0;await view.handlers.click({});assert.equal(context.clicked,null);
 view.hits.results[0].graphic.attributes.LIVE=1;view.hits.results[0].graphic.attributes.incident='';await view.handlers.click({});assert.equal(context.clicked,null);
 view.hits={results:[{graphic:{layer:native[1],attributes:{LIVE:1,incident:'Wrong layer'}}}]};await view.handlers.click({});assert.equal(context.clicked,null);
 
 const zone=native[0],point={latitude:37.3,longitude:-107.8};let queried;
 zone.createQuery=()=>({where:zone.definitionExpression});
 zone.queryFeatures=async q=>{queried=q;return {features:[{attributes:{LIVE:1,incident:'Spatial fallback'}}]}};
 view.hits={results:[{graphic:{layer:zone,attributes:{OBJECTID:535}}}]};context.clicked=null;
 await view.handlers.click({mapPoint:point});assert.equal(context.clicked,'Spatial fallback');assert.equal(queried.geometry,point);assert.equal(queried.spatialRelationship,'intersects');assert.match(queried.where,/LIVE = 1/);assert.match(queried.where,/incident IS NOT NULL/);
 view.hits={results:[]};context.clicked=null;await view.handlers.click({mapPoint:point});assert.equal(context.clicked,'Spatial fallback','hatched/empty visual hit uses service query');
 zone.queryFeatures=async()=>({features:[{attributes:{LIVE:1,incident:null}}]});context.clicked=null;await view.handlers.click({mapPoint:point});assert.equal(context.clicked,null);assert.match(controls.mapMessage.textContent,/no incident assigned/);
 zone.queryFeatures=async()=>({features:[{attributes:{LIVE:0,incident:'Inactive'}}]});context.clicked=null;await view.handlers.click({mapPoint:point});assert.equal(context.clicked,null);
 zone.queryFeatures=async()=>{throw Error('offline')};await view.handlers.click({mapPoint:point});assert.match(controls.mapMessage.textContent,/could not be loaded/);
 let resolveOld;zone.queryFeatures=()=>new Promise(resolve=>{resolveOld=resolve});const pending=view.handlers.click({mapPoint:point});await new Promise(resolve=>setImmediate(resolve));
 zone.queryFeatures=async()=>({features:[{attributes:{LIVE:1,incident:'New selection'}}]});await view.handlers.click({mapPoint:point});resolveOld({features:[{attributes:{LIVE:1,incident:'Old selection'}}]});await pending;assert.equal(context.clicked,'New selection');assert.equal(controls.mapMessage.textContent,'');
 assert.equal(native[0].outFields[0],'*');console.log('PASS: county fit, matching zoom controls, interior anchors, translucent label contents, overlap connectors and zone-scale label switching.');console.log('PASS: ArcGIS normalized service URL plus layerId identifies zones, roads, and POIs.');console.log('PASS: missing attributes and hatched interiors use spatial fallback; inactive/unassigned zones, query errors, and rapid-tap races handled.');console.log('PASS: live-zone tap opens incident resources; inactive, unnamed, and non-zone hits are excluded.');
 native.length=0;const empty=await API.create({container:'viewDiv',config});assert.equal(map.layers.length,2,'missing operational layers must not be injected');assert.equal(empty.operationalLayers.length,0);assert.equal(controls.roadsToggle.disabled,true);
 native.push(new Layer({url:config.zonesUrl,title:'Zones missing LIVE',fields:[]}));await API.create({container:'viewDiv',config});assert.equal(native[0].visible,false,'hide zones when LIVE is not exposed');console.log('PASS: LIVE filter preserves existing definition, hides zones missing LIVE, and keeps native styling, navigation and layer controls.');
})().catch(e=>{console.error(e);process.exitCode=1});
