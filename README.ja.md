# TIFF.js

> English README: [README.md](README.md)

HDR TIFF 画像を 16bit 浮動小数点 RGBA データとして読み書きするための小さな JavaScript モジュールです。

この実装は、次の実用的な形式に絞っています。

- Classic TIFF、BigTIFF ではありません
- 書き出しは little-endian
- 非圧縮画像データ
- RGB photometric interpretation + alpha
- 1 ピクセルあたり RGBA 4 サンプルのインターリーブ配列
- 1 サンプル 16bit
- IEEE floating point sample format

`2.0` や `4.0` のような HDR の画素値を、SDR にクランプせず保存したい場合に使えます。

## 使い方

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

HDR RGBA 画像を TIFF のバイト列にエンコードします。

```js
const bytes = TIFF.encode({
  width: 320,
  height: 240,
  data: rgba,
});
```

入力:

- `width`: 正の整数
- `height`: 正の整数
- `data`: `width * height * 4` 個の RGBA サンプルを持つ array-like オブジェクト

`data` は通常 `Float16Array` を使いますが、数値を読める array-like オブジェクトでも動作します。値は IEEE 754 binary16 として書き込まれるため、half-float 精度に丸められます。

戻り値:

- TIFF ファイルのバイト列を持つ `Uint8Array`

### `TIFF.decode(bytes)`

対応している TIFF ファイルを HDR RGBA データにデコードします。

```js
const image = TIFF.decode(bytes);
```

戻り値:

```js
{
  width: 320,
  height: 240,
  data: Float16Array // Float16Array がない環境では Float32Array
}
```

## 対応している TIFF

`TIFF.decode()` が現在対応している形式は次の通りです。

- Classic TIFF ヘッダ
- little-endian または big-endian の入力
- 非圧縮データ
- RGB photometric interpretation
- chunky/interleaved layout
- RGBA のみ、1 ピクセル 4 サンプル
- `BitsPerSample = [16, 16, 16, 16]`
- `SampleFormat = IEEE floating point`
- single-strip の画像データ

未対応の形式はエラーになります。

## HDR に関する注意

画素値はリニアな浮動小数点値です。`1.0` を超える値もファイル内には保持されますが、多くの画像ビューアは独自にトーンマップ、露出補正、カラーマネジメント、クランプを行います。そのため、TIFF ファイル内の HDR サンプルが同一でも、ビューアによって見た目が変わることがあります。

画像を正確に比較する場合は、スクリーンショットやビューア表示ではなく、デコード後のサンプル値または TIFF のバイト列を比較してください。

```js
const a = TIFF.encode({ width, height, data: rgba });
const b = TIFF.encode(TIFF.decode(a));

console.log(a.length === b.length && a.every((value, i) => value === b[i]));
```

## サンプルの実行

```sh
deno run --allow-write example.js
```

`example.tif` を書き出し、それをデコードして `example2.tif` を書き出します。

## CLI 変換

これらの CLI は [code4fukui/OpenEXR の `OpenEXR.js`](https://github.com/code4fukui/OpenEXR/blob/main/OpenEXR.js) を使っています。import 元は次の URL です。

```js
https://code4fukui.github.io/OpenEXR/OpenEXR.js
```

TIFF から OpenEXR へ変換:

```sh
deno run --allow-read --allow-write --allow-import=code4fukui.github.io,taisukef.github.io tif2exr.js input.tif
```

OpenEXR から TIFF へ変換:

```sh
deno run --allow-read --allow-write --allow-import=code4fukui.github.io,taisukef.github.io exr2tif.js input.exr
```

出力先は第2引数で指定できます。省略した場合は拡張子だけを変更します。

CLI ファイル:

- [`tif2exr.js`](tif2exr.js): 対応している HDR TIFF ファイルを OpenEXR に変換
- [`exr2tif.js`](exr2tif.js): OpenEXR ファイルを対応している HDR TIFF に変換
