#!/usr/bin/env -S deno run --allow-read --allow-write --allow-import=code4fukui.github.io,taisukef.github.io

import { OpenEXR } from "https://code4fukui.github.io/OpenEXR/OpenEXR.js";
import { TIFF } from "./TIFF.js";

const usage = () => {
  console.log("exr2tif <input.exr> [output.tif]");
};

const setExt = (path, ext) => {
  const index = path.lastIndexOf(".");
  return `${index < 0 ? path : path.slice(0, index)}.${ext}`;
};

const withoutLibraryLogs = (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
};

const input = Deno.args[0];
const output = Deno.args[1] ?? (input ? setExt(input, "tif") : undefined);

if (!input || !output) {
  usage();
  Deno.exit(1);
}

const exrBytes = await Deno.readFile(input);
const image = withoutLibraryLogs(() => OpenEXR.decode(exrBytes));
const tifBytes = TIFF.encode(image);
await Deno.writeFile(output, tifBytes);

console.log(`${input} -> ${output}`);
