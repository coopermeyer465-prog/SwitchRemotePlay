(function(root){
  "use strict";
  const buttonBits=[2,4,1,8,64,128,16,32,256,512,1024,2048,4096,8192];
  function layouts(collections){
    const result=new Map();
    function visit(c){
      for(const report of c.inputReports||[]){
        if(result.has(report.reportId))continue;
        let offset=0;
        const fields=[];
        for(const item of report.items){
          for(let i=0;i<item.reportCount;i++){
            const usage=item.isRange?Math.min(item.usageMinimum+i,item.usageMaximum):item.usages?.[i];
            if(!item.isConstant&&!item.isArray&&usage!==undefined)
              fields.push({offset,size:item.reportSize,usage,min:item.logicalMinimum,max:item.logicalMaximum});
            offset+=item.reportSize;
          }
        }
        // Ignore vendor packets; require the complete standard stick report.
        if([0x10030,0x10031,0x10033,0x10034].every(u=>fields.some(f=>f.usage===u)))
          result.set(report.reportId,{fields,bytes:Math.ceil(offset/8)});
      }
      for(const child of c.children||[])visit(child);
    }
    collections.forEach(visit);return result;
  }
  function decode(layout,data){
    if(!layout||data.byteLength<layout.bytes)return null;
    const state={buttons:0,hat:8,lx:128,ly:128,rx:128,ry:128};
    const axes={65584:"lx",65585:"ly",65587:"rx",65588:"ry"};
    for(const f of layout.fields){
      if(f.size<1||f.size>32)continue;
      let value=0;
      for(let bit=0;bit<f.size;bit++)value+=((data.getUint8((f.offset+bit)>>3)>>((f.offset+bit)%8))&1)*2**bit;
      if(f.min<0&&value>=2**(f.size-1))value-=2**f.size;
      if((f.usage>>>16)===9){if(value)state.buttons|=buttonBits[(f.usage&65535)-1]||0}
      else if(f.usage===0x10039){if(value>=f.min&&value<=f.max&&f.max-f.min===7)state.hat=value-f.min}
      else if(axes[f.usage]&&f.max>f.min){
        const n=Math.max(0,Math.min(1,(value-f.min)/(f.max-f.min)));
        state[axes[f.usage]]=Math.abs(n-.5)<.025?128:Math.round(1+n*254);
      }
    }
    return state;
  }
  const api={layouts,decode};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.Lic2HID=api;
})(typeof globalThis!=="undefined"?globalThis:this);
