// Inspect encoded dimensions before any browser bitmap allocation. Orientation
// can swap the axes, but cannot change either the pixel count or maximum edge.
export function parseImageDimensions(bytes) {
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 const fail=()=>{throw new Error('图片头无效或不受支持，请选择完整的 PNG、JPEG、WebP 或 BMP 图片。');};
 const need=(offset,n)=>{if(offset<0||offset+n>b.length)fail();};
 const text=(offset,n)=>{need(offset,n);return String.fromCharCode(...b.subarray(offset,offset+n));};
 const size=(width,height)=>{if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)fail();if(width>16384||height>16384||width*height>16777216)throw new Error('原图最多 1600 万像素、单边最多 16384px，请先缩小图片。');return {width,height};};
 if(b.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n)){need(0,33);if(v.getUint32(8)!==13||text(12,4)!=='IHDR')fail();return size(v.getUint32(16),v.getUint32(20));}
 if(b[0]===66&&b[1]===77){need(14,4);const dib=v.getUint32(14,true);if(dib===12){need(18,8);return size(v.getUint16(18,true),v.getUint16(20,true));}if(dib<40)fail();need(14,dib);return size(v.getInt32(18,true),Math.abs(v.getInt32(22,true)));}
 if(b[0]===255&&b[1]===216){let p=2;while(p<b.length){if(b[p++]!==255)fail();while(b[p]===255)p++;need(p,1);const marker=b[p++];if(marker===217||marker===218)fail();if(marker===1||(marker>=208&&marker<=215))continue;need(p,2);const n=v.getUint16(p);if(n<2)fail();need(p,n);if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(n<8)fail();return size(v.getUint16(p+5),v.getUint16(p+3));}p+=n;}fail();}
 if(b.length>=12&&text(0,4)==='RIFF'&&text(8,4)==='WEBP'){let p=12;while(p+8<=b.length){const tag=text(p,4),n=v.getUint32(p+4,true),d=p+8;need(d,n);if(tag==='VP8X'){if(n!==10)fail();return size(1+b[d+4]+b[d+5]*256+b[d+6]*65536,1+b[d+7]+b[d+8]*256+b[d+9]*65536);}if(tag==='VP8 '){if(n<10||b[d+3]!==157||b[d+4]!==1||b[d+5]!==42)fail();return size(v.getUint16(d+6,true)&16383,v.getUint16(d+8,true)&16383);}if(tag==='VP8L'){if(n<5||b[d]!==47)fail();const bits=v.getUint32(d+1,true);return size((bits&16383)+1,((bits>>>14)&16383)+1);}p=d+n+(n%2);}fail();}
 fail();
}
export async function assertImageDimensions(file) {
 if(!file||file.size>20*1024*1024)throw new Error('图片超过 20MB，请先选择较小的图片。');
 return parseImageDimensions(new Uint8Array(await file.arrayBuffer()));
}
