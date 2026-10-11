const {test}=require('node:test');
const assert=require('node:assert/strict');
const {layouts,decode}=require('./lic2-hid');
const item=(size,count,usages,min,max,extra={})=>({reportSize:size,reportCount:count,usages,logicalMinimum:min,logicalMaximum:max,...extra});
function descriptor(){return [{inputReports:[{reportId:63,items:[
  item(1,16,[],0,1,{isRange:true,usageMinimum:0x90001,usageMaximum:0x90010}),
  item(4,1,[0x10039],0,7),item(4,1,[],0,0,{isConstant:true}),
  item(16,4,[0x10030,0x10031,0x10033,0x10034],0,65535)
]}]}]}
function report(){const d=new DataView(new ArrayBuffer(11));d.setUint8(2,8);for(let i=3;i<11;i+=2)d.setUint16(i,32768,true);return d}
test('raw HID decodes both sticks independently, with neutral hat',()=>{
  const layout=layouts(descriptor()).get(63),d=report();
  assert.deepEqual(decode(layout,d),{buttons:0,hat:8,lx:128,ly:128,rx:128,ry:128});
  d.setUint16(3,65535,true);d.setUint16(5,0,true);d.setUint16(7,0,true);d.setUint16(9,65535,true);
  assert.deepEqual(decode(layout,d),{buttons:0,hat:8,lx:255,ly:1,rx:1,ry:255});
});
test('raw shoulders and D-pad do not affect stick axes',()=>{
  const layout=layouts(descriptor()).get(63);
  for(const [index,bit] of [[4,64],[5,128],[6,16],[7,32]]){
    const d=report();d.setUint16(0,2**index,true);d.setUint8(2,6);
    assert.deepEqual(decode(layout,d),{buttons:bit,hat:6,lx:128,ly:128,rx:128,ry:128});
  }
});
test('unknown and truncated reports are ignored',()=>{
  assert.equal(decode(undefined,report()),null);
  assert.equal(decode(layouts(descriptor()).get(63),new DataView(new ArrayBuffer(3))),null);
  assert.equal(layouts([{inputReports:[{reportId:48,items:[item(8,40,[],0,255)]}]}]).size,0);
});
