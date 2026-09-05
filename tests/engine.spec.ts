import { test, expect } from "@playwright/test";

test("neutral exposure preserves sRGB pixels and straight alpha", async ({
  page,
}) => {
  await page.goto("/");
  const actual = await page.evaluate(async () => {
    const { GradingEngine } = (await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    )) as typeof import("../src/engine/GradingEngine");
    const engine = new GradingEngine(document.createElement("canvas"));
    engine.setImage(
      new ImageData(
        new Uint8ClampedArray([0, 10, 128, 255, 64, 192, 255, 128]),
        2,
        1,
      ),
    );
    engine.render(0);
    const pixels = Array.from(engine.readPixels());
    engine.dispose();
    return pixels;
  });
  const expected = [
    0,
    10 / 255,
    128 / 255,
    1,
    64 / 255,
    192 / 255,
    1,
    128 / 255,
  ];
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3));
});

test("exposure changes linear light without recompiling and clamps only the output", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine } = (await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    )) as typeof import("../src/engine/GradingEngine");
    // Instrument the WebGL system boundary only for the explicit no-recompile contract.
    const original = WebGL2RenderingContext.prototype.compileShader;
    let compiles = 0;
    WebGL2RenderingContext.prototype.compileShader = function (shader) {
      compiles++;
      original.call(this, shader);
    };
    const engine = new GradingEngine(document.createElement("canvas"));
    const initial = compiles;
    engine.setImage(
      new ImageData(new Uint8ClampedArray([128, 128, 128, 128]), 1, 1),
    );
    const values = [0, 1, -1, 6, -6].map((stops) => {
      engine.render(stops);
      return Array.from(engine.readPixels());
    });
    engine.dispose();
    WebGL2RenderingContext.prototype.compileShader = original;
    return { initial, compiles, values };
  });
  expect(result.initial).toBeGreaterThan(0);
  expect(result.compiles).toBe(result.initial);
  // Independently calculated sRGB values for encoded input 128/255.
  const expected = [0.501961, 0.688453, 0.362249, 1, 0.043418];
  result.values.forEach((pixel, i) => {
    pixel
      .slice(0, 3)
      .forEach((value) => expect(value).toBeCloseTo(expected[i], 3));
    expect(pixel[3]).toBeCloseTo(128 / 255, 3);
  });
});

test("keeps image row orientation and caps the preview at 2048 pixels", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine } = (await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    )) as typeof import("../src/engine/GradingEngine");
    const canvas = document.createElement("canvas");
    const engine = new GradingEngine(canvas);
    engine.setImage(
      new ImageData(
        new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
        1,
        2,
      ),
    );
    engine.render(0);
    const pixels = Array.from(engine.readPixels());
    engine.setImage(new ImageData(4096, 4));
    engine.render(0);
    const size = [canvas.width, canvas.height];
    engine.dispose();
    return { pixels, size };
  });
  expect(result.pixels).toEqual([1, 0, 0, 1, 0, 0, 1, 1]);
  expect(result.size).toEqual([2048, 2]);
});
