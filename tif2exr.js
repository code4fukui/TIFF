#!/usr/bin/env -S deno run --allow-read --allow-write --allow-import=code4fukui.github.io,taisukef.github.io

import { TIFF } from "./TIFF.js";
import { OpenEXR } from "https://code4fukui.github.io/OpenEXR/OpenEXR.js";

const usage = () => {
  console.log("tif2exr <input.tif> [output.exr]");
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
const output = Deno.args[1] ?? (input ? setExt(input, "exr") : undefined);

if (!input || !output) {
  usage();
  Deno.exit(1);
}

const tifBytes = await Deno.readFile(input);
const image = TIFF.decode(tifBytes);
const exrBytes = withoutLibraryLogs(() => OpenEXR.encode(image));
await Deno.writeFile(output, exrBytes);

console.log(`${input} -> ${output}`);
