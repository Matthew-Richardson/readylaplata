// Run from the repository root: node tests/performance.test.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8'),source=read('home.js');
const listeners={},button={addEventListener:(event,fn)=>listeners[event]=fn},frame={dataset:{src:'https://example.test/signup'},loads:0,set src(value){this.url=value;this.loads++},removeAttribute(){delete this.dataset.src}};
let opens=0;
const lazy={createOverlayToggle:()=>()=>opens++};vm.createContext(lazy);
const shared=read('shared.js'),start=shared.indexOf('  const initCoderedOverlay ='),end=shared.indexOf('  // ========== LPC ALERTS CALLER ID',start);
vm.runInContext(shared.slice(start,end)+'\nglobalThis.init=initCoderedOverlay;',lazy);
lazy.init({coderedButton:button,coderedOverlay:{querySelector:()=>frame.dataset.src?frame:null,addEventListener(){}}});
assert.equal(frame.loads,0);listeners.click();listeners.click();assert.equal(frame.loads,1,'signup loads once, only on demand');assert.equal(opens,2);
assert.match(read('index.html'),/<iframe data-src=/);assert(!/<iframe src=/.test(read('index.html')));
const frames=[];let measures=0;
const scheduled={requestAnimationFrame:fn=>{frames.push(fn);return frames.length},measureMapOverlays:()=>measures++};vm.createContext(scheduled);
const a=source.indexOf('  let overlayMeasureFrame='),b=source.indexOf('  const overlayObserver=',a);vm.runInContext(source.slice(a,b),scheduled);
scheduled.scheduleOverlayMeasure();scheduled.scheduleOverlayMeasure();scheduled.scheduleOverlayMeasure();assert.equal(frames.length,1,'resize events coalesce');frames.shift()();assert.equal(measures,1);scheduled.scheduleOverlayMeasure();assert.equal(frames.length,1,'next frame can schedule again');
(async()=>{
 const refreshButton={},context={mapReady:true,view:{},$:()=>refreshButton,Promise};let requests=0,resolveLayers;
 context.view.refreshLayers=()=>{requests++;return new Promise(resolve=>resolveLayers=resolve)};context.refreshIncidents=async()=>requests++;
 vm.createContext(context);const first=source.indexOf('  let refreshInFlight='),last=source.indexOf("  $('refreshAll').addEventListener",first);vm.runInContext(source.slice(first,last),context);
 const pending=context.refreshAll();assert.equal(context.refreshAll(),pending,'concurrent refresh shares work');assert.equal(requests,2);assert.equal(refreshButton.disabled,true);resolveLayers();await pending;assert.equal(refreshButton.disabled,false);
 context.view.refreshLayers=async()=>{throw Error('offline')};await assert.rejects(context.refreshAll(),/offline/);assert.equal(refreshButton.disabled,false,'failure releases refresh control');
 context.view.refreshLayers=async()=>requests++;await context.refreshAll();assert.equal(requests,5,'retry is possible after failure');
 console.log('PASS: on-demand signup loads once, resize events coalesce, refresh requests share work, and failures allow retry.');
})().catch(error=>{console.error(error);process.exit(1)});

const gestures={},gestureContext={};vm.createContext(gestureContext);
const guardStart=source.indexOf('  function guardMapPageZoom('),guardEnd=source.indexOf("  guardMapPageZoom($",guardStart);
vm.runInContext(source.slice(guardStart,guardEnd),gestureContext);
gestureContext.guardMapPageZoom({addEventListener(type,handler,options){assert.equal(options.passive,false);gestures[type]=handler;}});
let prevented=0;const gesture={cancelable:true,preventDefault(){prevented++},touches:[{},{}]};
gestures.gesturestart(gesture);gestures.gesturechange(gesture);gestures.touchmove(gesture);assert.equal(prevented,3);
gestures.touchmove({...gesture,touches:[{}]});assert.equal(prevented,3,'single finger input is left to map');
gestures.gesturechange({...gesture,cancelable:false});assert.equal(prevented,3,'noncancelable events are left alone');
console.log('PASS: native map pinch zoom is canceled without blocking single-touch events or stopping SDK propagation.');
