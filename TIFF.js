const LITTLE_ENDIAN = true;
const TIFF_MAGIC = 42;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;

const TAG_IMAGE_WIDTH = 256;
const TAG_IMAGE_LENGTH = 257;
const TAG_BITS_PER_SAMPLE = 258;
const TAG_COMPRESSION = 259;
const TAG_PHOTOMETRIC_INTERPRETATION = 262;
const TAG_STRIP_OFFSETS = 273;
const TAG_SAMPLES_PER_PIXEL = 277;
const TAG_ROWS_PER_STRIP = 278;
const TAG_STRIP_BYTE_COUNTS = 279;
const TAG_PLANAR_CONFIGURATION = 284;
const TAG_EXTRA_SAMPLES = 338;
const TAG_SAMPLE_FORMAT = 339;

const COMPRESSION_NONE = 1;
const PHOTOMETRIC_RGB = 2;
const PLANAR_CHUNKY = 1;
const EXTRA_SAMPLE_UNASSOCIATED_ALPHA = 2;
const SAMPLE_FORMAT_IEEE_FLOAT = 3;

const hasFloat16Array = () => typeof Float16Array !== "undefined";

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const typeSize = (type) => {
  switch (type) {
    case TYPE_SHORT:
      return 2;
    case TYPE_LONG:
      return 4;
    default:
      throw new Error(`Unsupported TIFF field type: ${type}`);
  }
};

const getFieldValue = (view, entryOffset, endian, valueOffset, type, count) => {
  const size = typeSize(type) * count;
  if (size <= 4) {
    valueOffset = entryOffset + 8;
  }

  if (count === 1) {
    if (type === TYPE_SHORT) {
      return view.getUint16(valueOffset, endian);
    }
    if (type === TYPE_LONG) {
      return view.getUint32(valueOffset, endian);
    }
  }

  const values = [];
  for (let i = 0; i < count; i++) {
    const offset = valueOffset + i * typeSize(type);
    if (type === TYPE_SHORT) {
      values.push(view.getUint16(offset, endian));
    } else if (type === TYPE_LONG) {
      values.push(view.getUint32(offset, endian));
    }
  }
  return values;
};

const floatToHalf = (value) => {
  if (Number.isNaN(value)) {
    return 0x7e00;
  }
  if (value === Infinity) {
    return 0x7c00;
  }
  if (value === -Infinity) {
    return 0xfc00;
  }

  const sign = value < 0 || Object.is(value, -0) ? 0x8000 : 0;
  const abs = Math.abs(value);

  if (abs === 0) {
    return sign;
  }
  if (abs >= 65504) {
    return sign | 0x7bff;
  }
  if (abs < 0.000000059604644775390625) {
    return sign;
  }

  if (abs < 0.00006103515625) {
    return sign | Math.round(abs / 0.000000059604644775390625);
  }

  const exponent = Math.floor(Math.log2(abs));
  const mantissa = abs / 2 ** exponent - 1;
  let halfExponent = exponent + 15;
  let halfMantissa = Math.round(mantissa * 1024);

  if (halfMantissa === 1024) {
    halfMantissa = 0;
    halfExponent++;
  }
  if (halfExponent >= 31) {
    return sign | 0x7bff;
  }

  return sign | (halfExponent << 10) | halfMantissa;
};

const halfToFloat = (bits) => {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const mantissa = bits & 0x03ff;

  if (exponent === 0) {
    return mantissa === 0 ? sign * 0 : sign * 2 ** -14 * (mantissa / 1024);
  }
  if (exponent === 31) {
    return mantissa === 0 ? sign * Infinity : NaN;
  }
  return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
};

const normalizeSamples = (value, count, name) => {
  const values = Array.isArray(value) ? value : [value];
  assert(values.length === count, `${name} must contain ${count} values`);
  return values;
};

const readIFD = (view, offset, endian) => {
  const fields = new Map();
  const entries = view.getUint16(offset, endian);

  for (let i = 0; i < entries; i++) {
    const entryOffset = offset + 2 + i * 12;
    const tag = view.getUint16(entryOffset, endian);
    const type = view.getUint16(entryOffset + 2, endian);
    const count = view.getUint32(entryOffset + 4, endian);
    const valueOffset = view.getUint32(entryOffset + 8, endian);
    fields.set(tag, getFieldValue(view, entryOffset, endian, valueOffset, type, count));
  }

  return fields;
};

const encode = ({ width, height, data }) => {
  assert(Number.isInteger(width) && width > 0, "width must be a positive integer");
  assert(Number.isInteger(height) && height > 0, "height must be a positive integer");
  assert(data && data.length === width * height * 4, "data must contain width * height * 4 RGBA samples");

  const imageBytes = width * height * 4 * 2;
  const entries = [
    [TAG_IMAGE_WIDTH, TYPE_LONG, 1, width],
    [TAG_IMAGE_LENGTH, TYPE_LONG, 1, height],
    [TAG_BITS_PER_SAMPLE, TYPE_SHORT, 4, [16, 16, 16, 16]],
    [TAG_COMPRESSION, TYPE_SHORT, 1, COMPRESSION_NONE],
    [TAG_PHOTOMETRIC_INTERPRETATION, TYPE_SHORT, 1, PHOTOMETRIC_RGB],
    [TAG_STRIP_OFFSETS, TYPE_LONG, 1, 0],
    [TAG_SAMPLES_PER_PIXEL, TYPE_SHORT, 1, 4],
    [TAG_ROWS_PER_STRIP, TYPE_LONG, 1, height],
    [TAG_STRIP_BYTE_COUNTS, TYPE_LONG, 1, imageBytes],
    [TAG_PLANAR_CONFIGURATION, TYPE_SHORT, 1, PLANAR_CHUNKY],
    [TAG_EXTRA_SAMPLES, TYPE_SHORT, 1, EXTRA_SAMPLE_UNASSOCIATED_ALPHA],
    [TAG_SAMPLE_FORMAT, TYPE_SHORT, 4, [SAMPLE_FORMAT_IEEE_FLOAT, SAMPLE_FORMAT_IEEE_FLOAT, SAMPLE_FORMAT_IEEE_FLOAT, SAMPLE_FORMAT_IEEE_FLOAT]],
  ].sort((a, b) => a[0] - b[0]);

  const headerBytes = 8;
  const ifdBytes = 2 + entries.length * 12 + 4;
  const bitsPerSampleOffset = headerBytes + ifdBytes;
  const sampleFormatOffset = bitsPerSampleOffset + 8;
  const imageOffset = sampleFormatOffset + 8;
  const bytes = new Uint8Array(imageOffset + imageBytes);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, TIFF_MAGIC, LITTLE_ENDIAN);
  view.setUint32(4, headerBytes, LITTLE_ENDIAN);
  view.setUint16(headerBytes, entries.length, LITTLE_ENDIAN);

  let entryOffset = headerBytes + 2;
  for (const [tag, type, count, rawValue] of entries) {
    const value = tag === TAG_STRIP_OFFSETS ? imageOffset : rawValue;
    view.setUint16(entryOffset, tag, LITTLE_ENDIAN);
    view.setUint16(entryOffset + 2, type, LITTLE_ENDIAN);
    view.setUint32(entryOffset + 4, count, LITTLE_ENDIAN);

    if (tag === TAG_BITS_PER_SAMPLE) {
      view.setUint32(entryOffset + 8, bitsPerSampleOffset, LITTLE_ENDIAN);
      [16, 16, 16, 16].forEach((v, i) => view.setUint16(bitsPerSampleOffset + i * 2, v, LITTLE_ENDIAN));
    } else if (tag === TAG_SAMPLE_FORMAT) {
      view.setUint32(entryOffset + 8, sampleFormatOffset, LITTLE_ENDIAN);
      [3, 3, 3, 3].forEach((v, i) => view.setUint16(sampleFormatOffset + i * 2, v, LITTLE_ENDIAN));
    } else if (type === TYPE_SHORT) {
      view.setUint16(entryOffset + 8, value, LITTLE_ENDIAN);
    } else if (type === TYPE_LONG) {
      view.setUint32(entryOffset + 8, value, LITTLE_ENDIAN);
    }

    entryOffset += 12;
  }
  view.setUint32(headerBytes + 2 + entries.length * 12, 0, LITTLE_ENDIAN);

  for (let i = 0; i < data.length; i++) {
    view.setUint16(imageOffset + i * 2, floatToHalf(Number(data[i])), LITTLE_ENDIAN);
  }

  return bytes;
};

const decode = (bytes) => {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const byteOrder = String.fromCharCode(source[0], source[1]);
  const endian = byteOrder === "II" ? true : byteOrder === "MM" ? false : null;

  assert(endian !== null, "Invalid TIFF byte order");
  assert(view.getUint16(2, endian) === TIFF_MAGIC, "Only classic TIFF is supported");

  const fields = readIFD(view, view.getUint32(4, endian), endian);
  const width = fields.get(TAG_IMAGE_WIDTH);
  const height = fields.get(TAG_IMAGE_LENGTH);
  const samplesPerPixel = fields.get(TAG_SAMPLES_PER_PIXEL) ?? 1;
  const compression = fields.get(TAG_COMPRESSION) ?? COMPRESSION_NONE;
  const photometric = fields.get(TAG_PHOTOMETRIC_INTERPRETATION);
  const planar = fields.get(TAG_PLANAR_CONFIGURATION) ?? PLANAR_CHUNKY;
  const stripOffset = fields.get(TAG_STRIP_OFFSETS);
  const stripByteCount = fields.get(TAG_STRIP_BYTE_COUNTS);
  const bitsPerSample = normalizeSamples(fields.get(TAG_BITS_PER_SAMPLE), samplesPerPixel, "BitsPerSample");
  const sampleFormat = normalizeSamples(fields.get(TAG_SAMPLE_FORMAT) ?? SAMPLE_FORMAT_IEEE_FLOAT, samplesPerPixel, "SampleFormat");

  assert(width > 0 && height > 0, "Invalid TIFF dimensions");
  assert(compression === COMPRESSION_NONE, "Only uncompressed TIFF is supported");
  assert(photometric === PHOTOMETRIC_RGB, "Only RGB TIFF is supported");
  assert(planar === PLANAR_CHUNKY, "Only chunky/interleaved TIFF is supported");
  assert(samplesPerPixel === 4, "Only RGBA TIFF is supported");
  assert(bitsPerSample.every((v) => v === 16), "Only 16-bit samples are supported");
  assert(sampleFormat.every((v) => v === SAMPLE_FORMAT_IEEE_FLOAT), "Only IEEE float samples are supported");
  assert(stripByteCount >= width * height * samplesPerPixel * 2, "Invalid TIFF strip byte count");

  const length = width * height * samplesPerPixel;
  const data = hasFloat16Array() ? new Float16Array(length) : new Float32Array(length);

  for (let i = 0; i < length; i++) {
    data[i] = halfToFloat(view.getUint16(stripOffset + i * 2, endian));
  }

  return { width, height, data };
};

export const TIFF = { encode, decode };
export default TIFF;

