import { TIFF } from "./TIFF.js";

// エンコード
const w = 320;
const h = 240;
const rgba = new Float16Array(w * h * 4);
for (let i = 0; i < w * h; i++) {
  rgba[i * 4 + 0] = 2.0; // HDR
  rgba[i * 4 + 1] = (Math.cos(i / 20) + 1.0) * 2.0;
  rgba[i * 4 + 2] = Math.sin(i / 320) + 1.0;
  rgba[i * 4 + 3] = 1.0; // i / (w * h); // alpha
}
const tifBytes = TIFF.encode({ width: w, height: h, data: rgba });
await Deno.writeFile("example.tif", tifBytes);

// デコード
const imgdata16 = TIFF.decode(tifBytes);
console.log(imgdata16);

const tifBytes2 =  TIFF.encode(imgdata16);
await Deno.writeFile("example2.tif", tifBytes2);
