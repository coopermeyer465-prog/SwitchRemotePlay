const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'controller.h'),'utf8');
const sendSource=html.slice(html.indexOf('function send(force=false)'),html.indexOf('const desktopButton='));
function harness(){
  const sent=[],timers=new Map();let sequence=0;
  const c={claimed:true,connected:true,useHttp:false,lastSent:'',lastWireMs:0,lastWireDigital:'',sendTimer:0,
    clock:100,state:{buttons:0,hat:8,lx:128,ly:128,rx:128,ry:128},
    WebSocket:{OPEN:1},ws:{readyState:1,send:p=>sent.push(JSON.parse(p))},
    setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id)};
  c.performance={now:()=>c.clock};c.merged=()=>({...c.state});c.payload=s=>JSON.stringify(s);
  vm.createContext(c);vm.runInContext(sendSource,c);
  return {c,sent,timers,flush(){const pending=[...timers.values()];timers.clear();for(const t of pending)t.fn()}};
}
test('rapid press and release bypass the analog limiter without minimum hold',()=>{
  const {c,sent}=harness();c.send();c.clock=101;c.state.buttons=4;c.send();
  c.clock=102;c.state.buttons=0;c.send();
  assert.deepEqual(sent.map(s=>s.buttons),[0,4,0]);
});
test('forced mouse motion is coalesced to the latest position inside four milliseconds',()=>{
  const h=harness(),{c,sent,timers}=h;c.send();
  c.clock=101;c.state.rx=140;c.send(true);c.clock=102;c.state.rx=170;c.send(true);
  assert.equal(sent.length,1);assert.equal(timers.size,1);
  c.clock=104;h.flush();assert.equal(sent.length,2);assert.equal(sent[1].rx,170);
});
test('D-pad edges cancel pending analog timers and include current sticks',()=>{
  const {c,sent,timers}=harness();c.send();c.clock=101;c.state.lx=200;c.send();
  assert.equal(timers.size,1);c.state.hat=2;c.send();
  assert.equal(timers.size,0);assert.equal(sent[1].hat,2);assert.equal(sent[1].lx,200);
});
test('unchanged heartbeats still transmit after the analog interval',()=>{
  const {c,sent}=harness();c.send();c.clock=350;c.send(true);assert.equal(sent.length,2);
});
