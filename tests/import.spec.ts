import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { crc32, deflateSync } from "node:zlib";

function png16() {
  const samples = new Uint16Array([
    32768, 16384, 8192, 32768, 32769, 16385, 8193, 65535,
  ]);
  return PNG.sync.write(
    { width: 2, height: 1, data: Buffer.from(samples.buffer) } as PNG,
    { bitDepth: 16, colorType: 6, inputColorType: 6, inputHasAlpha: true },
  );
}

test("16-bit PNG samples and straight alpha survive import and GPU evaluation", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async (bytes) => {
    const { loadImage } = (await import(
      /* @vite-ignore */ "/src/engine/loadImage.ts" as string
    )) as typeof import("../src/engine/loadImage");
    const { GradingEngine } = (await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    )) as typeof import("../src/engine/GradingEngine");
    const loaded = await loadImage(
      new File([new Uint8Array(bytes)], "precision.png", { type: "image/png" }),
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    engine.setImage(loaded.bitmap);
    engine.render(0);
    const pixels = Array.from(engine.readPixels());
    engine.dispose();
    return pixels;
  }, Array.from(png16()));
  const expected = [
    0.5000076295, 0.2500038148, 0.1250019074, 0.5000076295, 0.5000228885,
    0.2500190738, 0.1250171664, 1,
  ];
  result.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 6));
  expect(result[4] - result[0]).toBeGreaterThan(0.000015);
});

// Independent TIFF fixture writer: fixed 2x1 strip, TIFF 6.0 directory entries.
function tiff16({
  little = true,
  orientation = 1,
  alpha = 2,
  compression = 1,
  depth = 16,
  channels = 4,
  width = 2,
} = {}) {
  const entries: [number, number, number[]][] = [
    [256, 4, [width]],
    [257, 4, [1]],
    [258, 3, Array(channels).fill(depth)],
    [259, 3, [compression]],
    [262, 3, [2]],
    [273, 4, [256]],
    [274, 3, [orientation]],
    [277, 3, [channels]],
    [278, 4, [1]],
    [279, 4, [(2 * channels * depth) / 8]],
    [284, 3, [1]],
  ];
  if (channels === 4) entries.push([338, 3, [alpha]]);
  const buffer = Buffer.alloc(256 + (2 * channels * depth) / 8);
  const u16 = (n: number, offset: number) =>
    little ? buffer.writeUInt16LE(n, offset) : buffer.writeUInt16BE(n, offset);
  const u32 = (n: number, offset: number) =>
    little ? buffer.writeUInt32LE(n, offset) : buffer.writeUInt32BE(n, offset);
  buffer.write(little ? "II" : "MM");
  u16(42, 2);
  u32(8, 4);
  u16(entries.length, 8);
  let extra = 192;
  entries.forEach(([tag, type, values], i) => {
    const entry = 10 + i * 12,
      stride = type === 3 ? 2 : 4;
    u16(tag, entry);
    u16(type, entry + 2);
    u32(values.length, entry + 4);
    const offset = values.length * stride <= 4 ? entry + 8 : extra;
    if (offset === extra) {
      u32(extra, entry + 8);
      extra += values.length * stride;
    }
    values.forEach((v, j) =>
      type === 3 ? u16(v, offset + j * stride) : u32(v, offset + j * stride),
    );
  });
  const samples =
    channels === 4
      ? [32768, 16384, 8192, 32768, 32769, 16385, 8193, 65535]
      : [32768, 16384, 8192, 32769, 16385, 8193];
  samples.forEach((v, i) =>
    depth === 16
      ? u16(v, 256 + i * 2)
      : buffer.writeUInt8(Math.round(v / 257), 256 + i),
  );
  return buffer;
}

for (const little of [true, false])
  for (const channels of [3, 4]) {
    test(`TIFF ${little ? "little" : "big"} endian ${channels} channels preserves precision`, async ({
      page,
    }) => {
      await page.goto("/");
      const result = await evaluateFile(
        page,
        tiff16({ little, channels }),
        "precision.tif",
      );
      expect(result.width).toBe(2);
      expect(result.pixels[0]).toBeCloseTo(0.5000076295, 6);
      expect(result.pixels[4]).toBeCloseTo(0.5000228885, 6);
      expect(result.pixels[3]).toBeCloseTo(
        channels === 4 ? 0.5000076295 : 1,
        6,
      );
    });
  }

async function evaluateFile(
  page: import("@playwright/test").Page,
  bytes: Buffer,
  name: string,
) {
  return page.evaluate(
    async ({ bytes, name }) => {
      const { loadImage } = (await import(
        /* @vite-ignore */ "/src/engine/loadImage.ts" as string
      )) as typeof import("../src/engine/loadImage");
      const { GradingEngine } = (await import(
        /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
      )) as typeof import("../src/engine/GradingEngine");
      // Deliberately absent MIME: format detection must use file signatures.
      const loaded = await loadImage(new File([new Uint8Array(bytes)], name));
      const engine = new GradingEngine(document.createElement("canvas"));
      try {
        engine.setImage(loaded.bitmap);
        engine.render(0);
        return {
          width: loaded.bitmap.width,
          height: loaded.bitmap.height,
          pixels: Array.from(engine.readPixels()),
        };
      } finally {
        engine.dispose();
        if ("close" in loaded.bitmap) loaded.bitmap.close();
      }
    },
    { bytes: Array.from(bytes), name },
  );
}

for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
  test(`TIFF orientation ${orientation} and associated alpha`, async ({
    page,
  }) => {
    await page.goto("/");
    const result = await evaluateFile(
      page,
      tiff16({ orientation, alpha: 1 }),
      "oriented.tiff",
    );
    expect([result.width, result.height]).toEqual(
      orientation >= 5 ? [1, 2] : [2, 1],
    );
    const red = [result.pixels[0], result.pixels[4]];
    const expected = [2, 3, 7, 8].includes(orientation)
      ? [0.5000228885, 1]
      : [1, 0.5000228885];
    red.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 6));
    const green = result.pixels[expected[0] === 1 ? 1 : 5];
    expect(green).toBeCloseTo(0.5, 6);
  });
}

test("live 16-bit uploads allow encoding correction and preserve the project on invalid input", async ({
  page,
}) => {
  await page.goto("/");
  const picker = page.getByLabel("Choose image");
  for (const [name, buffer] of [
    ["precision.png", png16()],
    ["precision.tiff", tiff16()],
  ] as const) {
    await picker.setInputFiles({ name, mimeType: "", buffer });
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  const canvas = page.getByLabel("Graded image preview");
  const before = await canvas.screenshot();
  await page
    .getByLabel("Input transfer", { exact: true })
    .selectOption("linear");
  await expect(page.getByText("Source tag:")).toContainText("Linear");
  await expect
    .poll(async () => (await canvas.screenshot()).equals(before))
    .toBe(false);
  const corrected = await canvas.screenshot();
  for (const [name, buffer, message] of [
    ["compressed.tif", tiff16({ compression: 5 }), "Unsupported TIFF variant"],
    ["truncated.tif", tiff16().subarray(0, 260), "Truncated TIFF"],
    ["huge.tif", tiff16({ width: 25_000_000 }), "24 megapixel"],
    ["broken.png", png16().subarray(0, 50), "Truncated PNG"],
  ] as const) {
    await picker.setInputFiles({ name, mimeType: "", buffer });
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(
      page.getByText("precision.tiff", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Input transfer", { exact: true }),
    ).toHaveValue("linear");
    expect((await canvas.screenshot()).equals(corrected)).toBe(true);
  }
});

for (const filterType of [0, 1, 2, 3, 4]) {
  test(`RGB16 PNG filter ${filterType} reconstructs multiple scanlines`, async ({
    page,
  }) => {
    const samples = new Uint16Array([
      32768, 16384, 8192, 32769, 16385, 8193, 0, 65535, 32768, 65535, 0, 1,
    ]);
    const bytes = PNG.sync.write(
      { width: 2, height: 2, data: Buffer.from(samples.buffer) } as PNG,
      {
        bitDepth: 16,
        colorType: 2,
        inputColorType: 2,
        inputHasAlpha: false,
        filterType,
      },
    );
    await page.goto("/");
    const { pixels } = await evaluateFile(page, bytes, "filtered.png");
    const expected = [
      0.5000076295, 0.2500038148, 0.1250019074, 1, 0.5000228885, 0.2500190738,
      0.1250171664, 1, 0, 1, 0.5000076295, 1, 1, 0, 0.000015259, 1,
    ];
    pixels.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 6));
  });
}

function chunk(type: string, data: Buffer) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
  return result;
}

// A 2x2 Adam7 stream has TL in pass 1, TR in pass 6, BL/BR in pass 7.
function interlacedPng(orientation = 1) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2);
  header.writeUInt32BE(2, 4);
  header[8] = 16;
  header[9] = 2;
  header[12] = 1;
  const scanlines = Buffer.from([
    0, 128, 0, 0, 0, 0, 0, 0, 128, 1, 0, 0, 0, 0, 0, 0, 0, 255, 255, 0, 0, 0, 0,
    0, 0, 255, 255,
  ]);
  const exif = Buffer.alloc(26);
  exif.write("II");
  exif.writeUInt16LE(42, 2);
  exif.writeUInt32LE(8, 4);
  exif.writeUInt16LE(1, 8);
  exif.writeUInt16LE(274, 10);
  exif.writeUInt16LE(3, 12);
  exif.writeUInt32LE(1, 14);
  exif.writeUInt16LE(orientation, 18);
  const gamma = Buffer.alloc(4);
  gamma.writeUInt32BE(100000);
  const transparent = Buffer.from([0, 0, 255, 255, 0, 0]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("eXIf", exif),
    chunk("gAMA", gamma),
    chunk("tRNS", transparent),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("Adam7 PNG respects EXIF orientation and transparency while explicit tags override embedded gamma", async ({
  page,
}) => {
  await page.goto("/");
  const { pixels } = await evaluateFile(
    page,
    interlacedPng(6),
    "interlaced.png",
  );
  // Clockwise rotation: bottom-left, top-left, bottom-right, top-right.
  const expected = [
    0, 1, 0, 0, 0.5000076295, 0, 0, 1, 0, 0, 1, 1, 0.5000228885, 0, 0, 1,
  ];
  pixels.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 6));
});

test("oversized previews retain selected 16-bit code values", async ({
  page,
}) => {
  const samples = new Uint16Array(4096 * 3).fill(32769);
  const bytes = PNG.sync.write(
    { width: 4096, height: 1, data: Buffer.from(samples.buffer) } as PNG,
    { bitDepth: 16, colorType: 2, inputColorType: 2, inputHasAlpha: false },
  );
  await page.goto("/");
  const result = await evaluateFile(page, bytes, "wide.png");
  expect([result.width, result.height]).toEqual([2048, 1]);
  expect(result.pixels[0]).toBeCloseTo(0.5000228885, 6);
});

test("failed GPU allocation keeps the previous imported image evaluable", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async (bytes) => {
    const { loadImage } = (await import(
      /* @vite-ignore */ "/src/engine/loadImage.ts" as string
    )) as typeof import("../src/engine/loadImage");
    const { GradingEngine } = (await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    )) as typeof import("../src/engine/GradingEngine");
    const engine = new GradingEngine(document.createElement("canvas"));
    const loaded = await loadImage(
      new File([new Uint8Array(bytes)], "precision.png"),
    );
    engine.setImage(loaded.bitmap);
    engine.render(0);
    const before = Array.from(engine.readPixels());
    const original = WebGL2RenderingContext.prototype.getError;
    WebGL2RenderingContext.prototype.getError = function () {
      return this.OUT_OF_MEMORY;
    };
    let error = "";
    try {
      engine.setImage(loaded.bitmap);
    } catch (cause) {
      error = (cause as Error).message;
    } finally {
      WebGL2RenderingContext.prototype.getError = original;
    }
    engine.render(0);
    const after = Array.from(engine.readPixels());
    engine.dispose();
    return { before, after, error };
  }, Array.from(png16()));
  expect(result.error).toContain("Try a smaller image");
  expect(result.after).toEqual(result.before);
});

test("PNG checksum and inflated-size failures are actionable and preserve the viewer", async ({
  page,
}) => {
  await page.goto("/");
  const picker = page.getByLabel("Choose image");
  await picker.setInputFiles({
    name: "good.png",
    mimeType: "image/png",
    buffer: png16(),
  });
  await expect(page.getByText("good.png", { exact: true })).toBeVisible();
  const corrupt = png16();
  corrupt[40] ^= 1;
  const source = png16();
  const bomb = Buffer.concat([
    source.subarray(0, 33),
    chunk("IDAT", deflateSync(Buffer.alloc(10000))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  for (const [buffer, message] of [
    [corrupt, "checksum"],
    [bomb, "exceeds its dimensions"],
  ] as const) {
    await picker.setInputFiles({
      name: "bad.png",
      mimeType: "image/png",
      buffer,
    });
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(page.getByText("good.png", { exact: true })).toBeVisible();
  }
});
