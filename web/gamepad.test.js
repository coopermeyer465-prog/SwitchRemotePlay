const {test} = require('node:test');
const assert = require('node:assert/strict');
const {mapGamepad, detectAxis} = require('./gamepad.js');
function pad(lic2 = true) {
  return {id: lic2 ? 'Lic2 Pro Controller (Vendor: 0000 Product: 0000)' : 'Standard gamepad',
    mapping: lic2 ? '' : 'standard', axes: lic2 ? [0,0,0,0,0,0,0,0,0,9/7] : [0,0,0,0],
    buttons: Array.from({length:18}, () => ({pressed:false,value:0}))};
}
test('Lic2 maps all fourteen controls without turning Home into D-pad input', () => {
  const expected = [2,4,1,8,16,32,64,128,256,512,1024,2048,4096,8192];
  for (let i = 0; i < expected.length; i++) {
    const g = pad(); g.buttons[i] = {pressed:true,value:1};
    const state = mapGamepad(g);
    assert.equal(state.buttons, expected[i], `button ${i}`);
    assert.equal(state.hat, 8, `button ${i} must not move D-pad`);
  }
});
test('Lic2 uses X/Y and Rx/Ry axes, ignoring the unused Z slot', () => {
  const g = pad(); g.axes.splice(0,5,-1,1,0.5,1,-1);
  assert.deepEqual(mapGamepad(g), {buttons:0,hat:8,lx:1,ly:255,rx:255,ry:1});
});
test('Lic2 hat axis maps eight directions, including diagonals and neutral', () => {
  const g = pad();
  for (let hat=0; hat<=8; hat++) {
    g.axes[9] = hat / 3.5 - 1;
    assert.equal(mapGamepad(g).hat,hat);
  }
  g.axes[9] = NaN; assert.equal(mapGamepad(g).hat,8);
});
test('standard controllers preserve triggers, sticks and diagonal D-pad', () => {
  const g = pad(false); g.buttons[6].pressed=true; g.buttons[12].pressed=true; g.buttons[15].pressed=true;
  g.axes=[0.5,-0.5,1,-1];
  assert.deepEqual(mapGamepad(g), {buttons:64,hat:1,lx:192,ly:65,rx:255,ry:1});
});
test('standard-mapped Lic2 uses the standard mapping', () => {
  const g = pad(); g.mapping='standard'; g.buttons[4].pressed=true; g.axes[2]=-1;
  assert.equal(mapGamepad(g).buttons,16);
  assert.equal(mapGamepad(g).rx,1);
});
test('axis detection learns unexpected slots and excludes already assigned axes', () => {
  assert.equal(detectAxis([0,0,.6,0,-.9],[0,0,0,0,0]),4);
  assert.equal(detectAxis([0,0,.6,0,-.9],[0,0,0,0,0],[4]),2);
  assert.equal(detectAxis([.01,0],[0,0]),-1);
});
test('calibration handles reversed, offset, narrow and asymmetric stick ranges', () => {
  const g=pad();
  const profile={axes:{lx:{index:6,center:.6,negative:1,positive:.2},
    ry:{index:7,center:-.8,negative:-1,positive:-.2}},buttons:{16:6,64:4,32:7,128:5}};
  g.axes[6]=.4; g.axes[7]=-.9; g.buttons[4].pressed=true;
  const s=mapGamepad(g,profile);
  assert.equal(s.lx,192); assert.equal(s.ry,65); assert.equal(s.buttons,64);
  g.axes[6]=.601;assert.equal(mapGamepad(g,profile).lx,128);
  g.axes[6]=-1;assert.equal(mapGamepad(g,profile).lx,255);
  g.axes[6]=NaN;assert.equal(mapGamepad(g,profile).lx,128);
});
