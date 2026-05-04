# TIFF.js

Small JavaScript module for reading and writing HDR TIFF images as 16-bit floating point RGBA data.

This is intentionally focused on one practical format:

- Classic TIFF, not BigTIFF
- Little-endian output
- Uncompressed image data
- RGB photometric interpretation with alpha
- 4 interleaved RGBA samples per pixel
- 16 bits per sample
- IEEE floating point sample format

It is useful when you want to store HDR pixel values such as `2.0` or `4.0` without clamping them to SDR.

## Usage

```js
import { TIFF } from "./TIFF.js";

const width = 320;
const height = 240;
const rgba = new Float16Array(width * height * 4);

for (let i = 0; i < width * height; i++) {
  rgba[i * 4 + 0] = 2.0;
  rgba[i * 4 + 1] = (Math.cos(i / 20) + 1.0) * 2.0;
  rgba[i * 4 + 2] = Math.sin(i / 320) + 1.0;
  rgba[i * 4 + 3] = 1.0;
}

const tifBytes = TIFF.encode({ width, height, data: rgba });
await Deno.writeFile("example.tif", tifBytes);

const image = TIFF.decode(tifBytes);
console.log(image.width, image.height, image.data);

const tifBytes2 = TIFF.encode(image);
await Deno.writeFile("example2.tif", tifBytes2);
```

## API

### `TIFF.encode(image)`

Encodes an HDR RGBA image into TIFF bytes.

```js
const bytes = TIFF.encode({
  width: 320,
  height: 240,
  data: rgba,
});
```

Input:

- `width`: positive integer
- `height`: positive integer
- `data`: array-like RGBA samples with `width * height * 4` values

`data` is typically a `Float16Array`, but other numeric array-like values also work. Values are written as IEEE 754 binary16 samples, so values are rounded to half-float precision.

Return value:

- `Uint8Array` containing TIFF file bytes

### `TIFF.decode(bytes)`

Decodes a supported TIFF file into HDR RGBA data.

```js
const image = TIFF.decode(bytes);
```

Return value:

```js
{
  width: 320,
  height: 240,
  data: Float16Array // or Float32Array if Float16Array is unavailable
}
```

## Supported TIFF Files

`TIFF.decode()` currently supports:

- Classic TIFF header
- Little-endian or big-endian input
- Uncompressed data
- RGB photometric interpretation
- Chunky/interleaved layout
- RGBA only, 4 samples per pixel
- `BitsPerSample = [16, 16, 16, 16]`
- `SampleFormat = IEEE floating point`
- Single-strip image data

Unsupported formats throw an error.

## HDR Notes

The pixel values are linear floating point values. Values above `1.0` are preserved in the file, but many image viewers apply their own tone mapping, exposure, color management, or clamping. Two TIFF files can contain identical HDR samples and still look different depending on the viewer.

To compare images accurately, compare the decoded sample values or the TIFF bytes rather than screenshots or viewer output.

```js
const a = TIFF.encode({ width, height, data: rgba });
const b = TIFF.encode(TIFF.decode(a));

console.log(a.length === b.length && a.every((value, i) => value === b[i]));
```

## Run the Example

```sh
deno run --allow-write example.js
```

This writes `example.tif`, decodes it, and writes `example2.tif`.

## CLI Conversion

These CLI tools use [code4fukui/OpenEXR `OpenEXR.js`](https://github.com/code4fukui/OpenEXR/blob/main/OpenEXR.js), imported from:

```js
https://code4fukui.github.io/OpenEXR/OpenEXR.js
```

Convert TIFF to OpenEXR:

```sh
deno run --allow-read --allow-write --allow-import=code4fukui.github.io,taisukef.github.io tif2exr.js input.tif
```

Convert OpenEXR to TIFF:

```sh
deno run --allow-read --allow-write --allow-import=code4fukui.github.io,taisukef.github.io exr2tif.js input.exr
```

The output path can be passed as the second argument. If omitted, only the extension is changed.

CLI files:

- [`tif2exr.js`](tif2exr.js): converts supported HDR TIFF files to OpenEXR
- [`exr2tif.js`](exr2tif.js): converts OpenEXR files to supported HDR TIFF files
