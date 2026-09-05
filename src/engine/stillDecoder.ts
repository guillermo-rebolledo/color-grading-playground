import type { FloatImage } from "./GradingEngine";
import { previewSize } from "./previewSize";

const MAX_PIXELS = 24_000_000;
export function checkDimensions(width: number, height: number) {
  if (!width || !height || width * height > MAX_PIXELS)
    throw new Error(
      "Image dimensions exceed the 24 megapixel import limit. Resize the source and try again.",
    );
}

/** Normalize and orient without an eight-bit intermediate; nearest sampling caps the preview. */
function floatImage(
  width: number,
  height: number,
  orientation: number,
  sample: (x: number, y: number, c: number) => number,
): FloatImage {
  const rotated = orientation >= 5;
  const ow = rotated ? height : width,
    oh = rotated ? width : height;
  const size = previewSize(ow, oh);
  const data = new Float32Array(size.width * size.height * 4);
  const mirrorX = [2, 3, 7, 8].includes(orientation);
  const mirrorY = [3, 4, 6, 7].includes(orientation);
  for (let y = 0; y < size.height; y++)
    for (let x = 0; x < size.width; x++) {
      const u = Math.floor((x * ow) / size.width);
      const v = Math.floor((y * oh) / size.height);
      const sx = rotated ? v : u,
        sy = rotated ? u : v;
      for (let c = 0; c < 4; c++)
        data[(y * size.width + x) * 4 + c] = sample(
          mirrorX ? width - 1 - sx : sx,
          mirrorY ? height - 1 - sy : sy,
          c,
        );
    }
  return { ...size, data };
}

function tiffDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const le = view.getUint16(0) === 0x4949;
  if ((!le && view.getUint16(0) !== 0x4d4d) || view.getUint16(2, le) !== 42)
    throw new Error(
      "Unsupported TIFF header. Export a classic TIFF (not BigTIFF).",
    );
  const offset = view.getUint32(4, le),
    count = view.getUint16(offset, le);
  const tags = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const entry = offset + 2 + i * 12;
    const tag = view.getUint16(entry, le),
      type = view.getUint16(entry + 2, le),
      length = view.getUint32(entry + 4, le);
    // Only pixel-layout tags and orientation are interpreted; colour profiles remain user-tagged.
    if (
      ![
        256, 257, 258, 259, 262, 266, 273, 274, 277, 278, 279, 284, 317, 322,
        323, 324, 325, 338, 339,
      ].includes(tag)
    )
      continue;
    if (tags.has(tag) || ![3, 4].includes(type) || length > 100_000)
      throw new Error("Malformed TIFF tags. Re-export the image.");
    const stride = type === 3 ? 2 : 4;
    const start =
      length * stride <= 4 ? entry + 8 : view.getUint32(entry + 8, le);
    const values = Array.from({ length }, (_, j) =>
      type === 3
        ? view.getUint16(start + j * stride, le)
        : view.getUint32(start + j * stride, le),
    );
    tags.set(tag, values);
  }
  const next = view.getUint32(offset + 2 + count * 12, le);
  return { view, le, tags, next };
}

export function decodeTiff(bytes: Uint8Array) {
  const { view, le, tags, next } = tiffDirectory(bytes);
  const one = (tag: number, fallback = 0) => {
    const values = tags.get(tag);
    if (values && values.length !== 1)
      throw new Error("Malformed TIFF scalar tag. Re-export the image.");
    return values?.[0] ?? fallback;
  };
  const width = one(256),
    height = one(257),
    channels = one(277),
    bits = tags.get(258) ?? [];
  checkDimensions(width, height);
  const orientation = one(274, 1),
    alpha = one(338);
  if (
    next ||
    one(259, 1) !== 1 ||
    one(266, 1) !== 1 ||
    one(262) !== 2 ||
    one(284, 1) !== 1 ||
    one(317, 1) !== 1 ||
    [322, 323, 324, 325].some((tag) => tags.has(tag)) ||
    ![3, 4].includes(channels) ||
    bits.length !== channels ||
    !bits.every((bit) => bit === bits[0]) ||
    ![8, 16].includes(bits[0]) ||
    (tags.has(339) &&
      (tags.get(339)!.length !== channels ||
        !tags.get(339)!.every((value) => value === 1))) ||
    orientation < 1 ||
    orientation > 8 ||
    (channels === 4 ? ![1, 2].includes(alpha) : tags.has(338))
  )
    throw new Error(
      "Unsupported TIFF variant. Export a single-page, uncompressed, chunky 8/16-bit unsigned RGB/RGBA TIFF with explicit alpha.",
    );
  const rows = one(278, height),
    offsets = tags.get(273) ?? [],
    counts = tags.get(279) ?? [];
  if (
    !rows ||
    offsets.length !== Math.ceil(height / rows) ||
    counts.length !== offsets.length
  )
    throw new Error("Malformed TIFF strips. Re-export the image.");
  const stride = bits[0] / 8;
  offsets.forEach((offset, i) => {
    const required =
      Math.min(rows, height - i * rows) * width * channels * stride;
    if (counts[i] !== required || offset + required > bytes.length)
      throw new Error("Truncated TIFF pixels. Re-export the image.");
  });
  const raw = (x: number, y: number, c: number) => {
    if (c === 3 && channels === 3) return 1;
    const offset =
      offsets[Math.floor(y / rows)] +
      ((y % rows) * width * channels + x * channels + c) * stride;
    return stride === 2
      ? view.getUint16(offset, le) / 65535
      : view.getUint8(offset) / 255;
  };
  const bitmap = floatImage(width, height, orientation, (x, y, c) => {
    const value = raw(x, y, c);
    if (alpha !== 1 || c === 3) return value;
    const a = raw(x, y, 3);
    return a === 0 ? 0 : value / a;
  });
  return {
    bitmap,
    originalWidth: orientation >= 5 ? height : width,
    originalHeight: orientation >= 5 ? width : height,
  };
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

/** PNG scanline reconstruction, including Adam7, with bounded streaming inflation. */
export async function decodePng16(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16),
    height = view.getUint32(20),
    colour = bytes[25];
  checkDimensions(width, height);
  if (
    bytes[24] !== 16 ||
    ![2, 6].includes(colour) ||
    bytes[26] ||
    bytes[27] ||
    bytes[28] > 1
  )
    throw new Error(
      "Unsupported high-bit-depth PNG. Export 16-bit RGB or RGBA PNG.",
    );
  const channels = colour === 6 ? 4 : 3,
    bpp = channels * 2;
  const passes = bytes[28]
    ? [
        [0, 0, 8, 8],
        [4, 0, 8, 8],
        [0, 4, 4, 8],
        [2, 0, 4, 4],
        [0, 2, 2, 4],
        [1, 0, 2, 2],
        [0, 1, 1, 2],
      ]
    : [[0, 0, 1, 1]];
  const layouts = passes.map(([x, y, dx, dy]) => ({
    x,
    y,
    dx,
    dy,
    w: Math.max(0, Math.ceil((width - x) / dx)),
    h: Math.max(0, Math.ceil((height - y) / dy)),
  }));
  const expected = layouts.reduce(
    (n, p) => n + (p.w && p.h ? p.h * (p.w * bpp + 1) : 0),
    0,
  );
  const compressed: Uint8Array<ArrayBuffer>[] = [];
  let orientation = 1,
    transparency: number[] | undefined,
    ended = false,
    dataEnded = false;
  for (let offset = 8; offset < bytes.length;) {
    const length = view.getUint32(offset),
      end = offset + 12 + length;
    if (end > bytes.length)
      throw new Error("Truncated PNG chunk. Re-export the image.");
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4))
      throw new Error("PNG checksum failed. Re-export the image.");
    const chunk = bytes.slice(offset + 8, end - 4);
    if (offset === 8 ? type !== "IHDR" || length !== 13 : type === "IHDR")
      throw new Error("Malformed PNG header.");
    if (type === "IDAT") {
      if (dataEnded) throw new Error("Malformed PNG data order.");
      compressed.push(chunk);
    } else if (compressed.length) dataEnded = true;
    if (type === "eXIf")
      orientation = tiffDirectory(chunk).tags.get(274)?.[0] ?? 1;
    if (type === "tRNS") {
      if (channels !== 3 || length !== 6 || compressed.length || transparency)
        throw new Error("Malformed PNG transparency.");
      const t = new DataView(chunk.buffer);
      transparency = [t.getUint16(0), t.getUint16(2), t.getUint16(4)];
    }
    if (type === "IEND") {
      if (length || end !== bytes.length) throw new Error("Malformed PNG end.");
      ended = true;
      break;
    }
    if (!["IHDR", "IDAT", "PLTE"].includes(type) && !(bytes[offset + 4] & 32))
      throw new Error("Unsupported PNG critical chunk.");
    offset = end;
  }
  if (!ended || !compressed.length || orientation < 1 || orientation > 8)
    throw new Error(
      "Incomplete PNG or invalid orientation. Re-export the image.",
    );
  const scanlines = new Uint8Array(expected);
  const reader = new Blob(compressed)
    .stream()
    .pipeThrough(new DecompressionStream("deflate"))
    .getReader();
  let written = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (written + value.length > expected)
        throw new Error(
          "PNG decompressed data exceeds its dimensions. Re-export the image.",
        );
      scanlines.set(value, written);
      written += value.length;
    }
  } finally {
    await reader.cancel();
  }
  if (written !== expected)
    throw new Error("Truncated PNG scanlines. Re-export the image.");
  const samples = new Uint16Array(width * height * channels);
  let cursor = 0;
  for (const pass of layouts) {
    if (!pass.w || !pass.h) continue;
    let previous = new Uint8Array(pass.w * bpp);
    for (let y = 0; y < pass.h; y++) {
      const filter = scanlines[cursor++],
        row = scanlines.slice(cursor, cursor + previous.length);
      cursor += row.length;
      if (filter > 4) throw new Error("Invalid PNG scanline filter.");
      for (let i = 0; i < row.length; i++) {
        const a = i >= bpp ? row[i - bpp] : 0,
          b = previous[i],
          c = i >= bpp ? previous[i - bpp] : 0;
        const p = a + b - c,
          pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c);
        const predictor =
          filter === 0
            ? 0
            : filter === 1
              ? a
              : filter === 2
                ? b
                : filter === 3
                  ? Math.floor((a + b) / 2)
                  : pa <= pb && pa <= pc
                    ? a
                    : pb <= pc
                      ? b
                      : c;
        row[i] += predictor;
      }
      for (let x = 0; x < pass.w; x++)
        for (let c = 0; c < channels; c++) {
          const i = (x * channels + c) * 2;
          samples[
            ((pass.y + y * pass.dy) * width + pass.x + x * pass.dx) * channels +
              c
          ] = row[i] * 256 + row[i + 1];
        }
      previous = row;
    }
  }
  const bitmap = floatImage(width, height, orientation, (x, y, c) => {
    const start = (y * width + x) * channels;
    if (c === 3 && channels === 3)
      return transparency?.every((v, i) => v === samples[start + i]) ? 0 : 1;
    return samples[start + c] / 65535;
  });
  return {
    bitmap,
    originalWidth: orientation >= 5 ? height : width,
    originalHeight: orientation >= 5 ? width : height,
  };
}
