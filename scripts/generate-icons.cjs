const fs = require('node:fs');
const zlib = require('node:zlib');
function crc(bytes) { let c=0xffffffff; for(const b of bytes) { c^=b; for(let k=0;k<8;k++) c=(c>>>1)^((c&1)?0xedb88320:0); } return (c^0xffffffff)>>>0; }
function chunk(type, data) { const t=Buffer.from(type), n=Buffer.alloc(4), c=Buffer.alloc(4); n.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t,data]))); return Buffer.concat([n,t,data,c]); }
fs.mkdirSync('public/icons',{recursive:true});
for(const size of [16,32,48,64,128,192,256,512]) {
  const rows=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const u=x/size,v=y/size, i=y*(size*4+1)+1+x*4;
    const f=(u>.22&&u<.3&&v>.22&&v<.78)||(u>.22&&u<.62&&v>.22&&v<.3)||(u>.22&&u<.5&&v>.44&&v<.52);
    const line=u>.48&&u<.81&&Math.abs(v-(.82-(u-.48)*1.25))<.035;
    rows.set(f?[231,241,255,255]:line?[54,211,153,255]:[14,25,46,255],i);
  }
  const h=Buffer.alloc(13);h.writeUInt32BE(size);h.writeUInt32BE(size,4);h[8]=8;h[9]=6;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
  fs.writeFileSync(`public/icons/icon-${size}.png`,png);
  if(size===256) {const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);fs.writeFileSync('public/icons/icon.ico',Buffer.concat([ico,png]));}
}
