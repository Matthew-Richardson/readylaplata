// Run from the repository root: node tests/home-map.test.cjs
// Model the SDK's service URL + layerId representation, including layer zero.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
class Collection extends Array{toArray(){return [...this]}add(x){this.push(x)}addMany(xs){this.push(...xs)}removeAll(){this.length=0}remove(x){const i=this.indexOf(x);if(i>=0)this.splice(i,1)}}
class Layer{constructor(p){Object.assign(this,p);this.visible=p.visible??true;this.graphics=new Collection()}load(){return Promise.resolve(this)}refresh(){this.refreshed=true}add(x){this.graphics.add(x)}addMany(xs){this.graphics.addMany(xs)}remove(x){this.graphics.remove(x)}removeAll(){this.graphics.removeAll()}}
const config={zonesWhere:'LIVE = 1',webmapId:'source-map',zonesUrl:'https://example.test/zones/0',roadsServiceUrl:'https://example.test/roads',roadClosuresUrl:'https://example.test/pois/1',evacPoisUrl:'https://example.test/pois/0',countyBounds:[[36.98,-108.4],[37.65,-107.46]]};
const group={type:'group',visible:false};const native=[new Layer({url:config.zonesUrl,title:'Zones',fields:[{name:'LIVE'},{name:'incident'}],definitionExpression:'incident IS NOT NULL'}),new Layer({url:config.roadClosuresUrl,title:'Road info'}),new Layer({url:config.evacPoisUrl,title:'POI',parent:group}),new Layer({type:'vector-tile',title:'Roads'})];
for(const layer of native){if(layer.url&&/\/[01]$/.test(layer.url)){layer.layerId=Number(layer.url.slice(-1));layer.url=layer.url.slice(0,-2);}}
let map,view;class WebMap{constructor(p){map=this;Object.assign(this,p);this.layers=new Collection(...native);this.allLayers=this.layers;}load(){return Promise.resolve(this)}add(x){this.layers.add(x)}addMany(xs){this.layers.addMany(xs)}reorder(x,n){this.layers.remove(x);this.layers.splice(n,0,x)}}
class MapView{constructor(p){view=this;Object.assign(this,p);this.zoom=9;this.handlers={};this.moves=[]}on(event,fn){this.handlers[event]=fn}when(){return Promise.resolve(this)}goTo(target){this.moves.push(target);if(target.zoom)this.zoom=target.zoom;return Promise.resolve()}closePopup(){}openPopup(p){this.popupOpened=p}hitTest(){return Promise.resolve(this.hits||{results:[]})}}
class Model{constructor(p){Object.assign(this,p)}}class Extent extends Model{expand(factor){return {...this,factor}}}
const controls=Object.fromEntries(['roadsToggle','roadLayerToggle','poiLayerToggle','mapMessage'].map(id=>[id,{dataset:{},listeners:{},addEventListener(e,fn){this.listeners[e]=fn;}}]));
const modules=[WebMap,MapView,Layer,Model,Model,Extent,{watch(){}}];
const context={window:{require(names,fn){fn(...modules)},ReadyLaPlataZones:{renderer:field=>({type:'unique-value',field}),styles:{Go:{stroke:'#15803d'},Shelter:{stroke:'#1e6eb6'},Access:{stroke:'#824ab6'}}}},document:{getElementById:id=>controls[id]},console:{...console,warn(){},error(){}}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../home-map.js'),'utf8'),context);
(async()=>{
 
 const API=context.window.ReadyLaPlataMap,adapter=await API.create({container:'viewDiv',config,fields:{status:'STATUS',zone:'zonename',incident:'incident'},popupFor(){},onIncident(name){context.clicked=name}});
 assert.equal(map.portalItem.id,'source-map');assert.equal(map.layers.filter(l=>l===native[0]).length,1,'no duplicate zone layers');
 assert.equal(native[0].definitionExpression,'(incident IS NOT NULL) AND (LIVE = 1)');assert.equal(native[0].renderer,undefined);assert.equal(native[0].labelingInfo,undefined);
 assert.equal(map.layers.length,native.length+2,'only incident summaries and temporary address layer may be added');
 assert.equal(view.popup.autoOpenEnabled,undefined,'use native feature popups');
 await adapter.fitBounds(config.countyBounds);assert.equal(view.moves.at(-1).xmin,-108.4);assert.equal(view.moves.at(-1).ymax,37.65);
 await adapter.setView([37.4,-107.8],15);assert.equal(view.moves.at(-1).center.longitude,-107.8);assert.equal(view.moves.at(-1).zoom,15);
 controls.poiLayerToggle.checked=false;controls.poiLayerToggle.listeners.change();assert.equal(native[2].visible,false);
 controls.poiLayerToggle.checked=true;controls.poiLayerToggle.listeners.change();assert.equal(native[2].visible,true);assert.equal(group.visible,true);
 adapter.setIncidents([{name:'TEST ONLY',point:{lat:37.3,lng:-107.8},statuses:['Shelter','Access']}]);
 const pins=map.layers.find(l=>l.title==='Active incidents');assert.equal(pins.graphics.length,4);assert.equal(pins.graphics[3].symbol.color,'#824ab6');assert.equal(pins.graphics[0].attributes.incident,'TEST ONLY');
 context.clicked=null;view.hits={results:[{graphic:{layer:pins,attributes:{incident:'TEST ONLY'}}}]};await view.handlers.click({mapPoint:{latitude:37.3,longitude:-107.8}});assert.equal(context.clicked,'TEST ONLY','incident pin opens support resources');
 adapter.setIncidents([]);assert.equal(pins.graphics.length,0,'refresh removes old incident markers');adapter.setOverlayPadding({top:90,bottom:140});assert.equal(view.padding.top,90);assert.equal(view.padding.bottom,140);
 const marker=adapter.markAddress({location:{x:-107.8,y:37.4}}),address=map.layers.find(l=>l.title==='Searched address');assert.equal(address.graphics.length,1);marker.remove();assert.equal(address.graphics.length,0);
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
 assert.equal(native[0].outFields[0],'*');console.log('PASS: ArcGIS normalized service URL plus layerId identifies zones, roads, and POIs.');console.log('PASS: missing attributes and hatched interiors use spatial fallback; inactive/unassigned zones, query errors, and rapid-tap races handled.');console.log('PASS: live-zone tap opens incident resources; inactive, unnamed, and non-zone hits are excluded.');
 native.length=0;const empty=await API.create({container:'viewDiv',config});assert.equal(map.layers.length,2,'missing operational layers must not be injected');assert.equal(empty.operationalLayers.length,0);assert.equal(controls.roadsToggle.disabled,true);
 native.push(new Layer({url:config.zonesUrl,title:'Zones missing LIVE',fields:[]}));await API.create({container:'viewDiv',config});assert.equal(native[0].visible,false,'hide zones when LIVE is not exposed');console.log('PASS: LIVE filter preserves existing definition, hides zones missing LIVE, and keeps native styling, navigation and layer controls.');
})().catch(e=>{console.error(e);process.exitCode=1});
