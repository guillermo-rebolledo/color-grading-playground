import { openLutExport } from "./fixtures";
import { test, expect } from "@playwright/test";

test("context restoration rebuilds source, curves and programs and keeps export usable", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const canvas = document.createElement("canvas");
    const engine = new GradingEngine(canvas);
    const gl = canvas.getContext("webgl2")!;
    const extension = gl.getExtension("WEBGL_lose_context")!;
    const graph = createGraph();
    graph.nodes[1].type = "curves";
    graph.nodes[1].data = {
      curves: Object.fromEntries(
        ["master", "r", "g", "b"].map((k) => [
          k,
          [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        ]),
      ),
    };
    const input = {
      width: 1,
      height: 1,
      data: new Float32Array([0.25, 0.5, 0.75, 1]),
    };
    engine.setImage(input);
    engine.render(graph);
    const before = Array.from(engine.readPixels());
    input.data.fill(0); // The caller may release or reuse its source after upload.
    const lost = new Promise<void>((resolve) =>
      canvas.addEventListener("webglcontextlost", () => resolve(), {
        once: true,
      }),
    );
    extension.loseContext();
    await lost;
    let feedback = "";
    try {
      engine.render(graph);
    } catch (cause) {
      feedback = String(cause);
    }
    const restored = new Promise<void>((resolve) =>
      canvas.addEventListener("webglcontextrestored", () => resolve(), {
        once: true,
      }),
    );
    setTimeout(() => extension.restoreContext(), 0);
    await Promise.race([
      restored,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Context did not restore")), 3000),
      ),
    ]);
    engine.render(graph);
    const after = Array.from(engine.readPixels());
    const finite = engine.renderLattice(graph, 17).every(Number.isFinite);
    engine.dispose();
    return { before, after, feedback, finite };
  });
  expect(result.after).toEqual(result.before);
  expect(result.feedback).toContain("restor");
  expect(result.finite).toBe(true);
});

test("numeric scrubs halve the capped preview and restore on release or 80 ms idle", async ({
  page,
}) => {
  const { openNeutralGraph } = await import("./fixtures");
  await openNeutralGraph(page);
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 4096;
    canvas.height = 16;
    return canvas.toDataURL().split(",")[1];
  });
  await page.getByLabel("Choose image").setInputFiles({
    name: "wide.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  const canvas = page.getByLabel("Graded image preview");
  await expect(canvas).toHaveAttribute("width", "2048");
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const slider = page.getByRole("slider", {
    name: "Scrub exposure",
    exact: true,
  });
  await slider.focus();
  await page.keyboard.down("ArrowRight");
  await page.clock.runFor(32);
  await expect(canvas).toHaveAttribute("width", "1024");
  await expect(canvas).toHaveAttribute("height", "4");
  await page.clock.runFor(100);
  await page.clock.runFor(32);
  await expect(canvas).toHaveAttribute("width", "2048");
  await page.keyboard.down("ArrowRight");
  await page.clock.runFor(32);
  await expect(canvas).toHaveAttribute("width", "1024");
  await page.keyboard.up("ArrowRight");
  await page.clock.runFor(32);
  await expect(canvas).toHaveAttribute("width", "2048");
  await expect(canvas).toHaveAttribute("height", "8");
});

test("closed bitmap recovery preserves straight RGB even at low alpha", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const canvas = document.createElement("canvas");
    const engine = new GradingEngine(canvas);
    const bitmap = await createImageBitmap(
      new ImageData(new Uint8ClampedArray([123, 57, 231, 1]), 1, 1),
      { premultiplyAlpha: "none", colorSpaceConversion: "none" },
    );
    engine.setImage(bitmap);
    bitmap.close();
    engine.render(0);
    const before = Array.from(engine.readPixels());
    engine.recover();
    engine.render(0);
    const after = Array.from(engine.readPixels());
    engine.dispose();
    return { before, after };
  });
  expect(result.after).toEqual(result.before);
});

test("GPU limits and transient resource failures report errors without replacing the loaded image", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const canvas = document.createElement("canvas");
    const engine = new GradingEngine(canvas);
    const gl = canvas.getContext("webgl2")!;
    engine.setImage(
      new ImageData(new Uint8ClampedArray([128, 64, 32, 255]), 1, 1),
    );
    engine.render(0);
    const before = Array.from(engine.readPixels());
    const parameter = gl.getParameter.bind(gl);
    const createTexture = gl.createTexture.bind(gl);
    const storage = gl.texStorage2D.bind(gl);
    const failures: string[] = [];
    const attempt = (operation: () => void) => {
      try {
        operation();
        failures.push("unexpected success");
      } catch (cause) {
        failures.push(String(cause));
      }
    };
    gl.getParameter = (key) =>
      key === gl.MAX_TEXTURE_SIZE ? 1 : parameter(key);
    attempt(() => engine.setImage(new ImageData(2, 1)));
    gl.getParameter = (key) =>
      key === gl.MAX_RENDERBUFFER_SIZE ? 1 : parameter(key);
    attempt(() => engine.setImage(new ImageData(2, 1)));
    gl.getParameter = (key) =>
      key === gl.MAX_VIEWPORT_DIMS ? new Int32Array([1, 1]) : parameter(key);
    attempt(() => engine.setImage(new ImageData(2, 1)));
    gl.getParameter = parameter;
    Reflect.set(gl, "createTexture", () => null);
    attempt(() => engine.setImage(new ImageData(2, 1)));
    gl.createTexture = createTexture;
    engine.render(0);
    const after = Array.from(engine.readPixels());
    const graph = createGraph();
    graph.nodes[1].type = "curves";
    graph.nodes[1].data = {
      curves: Object.fromEntries(
        ["master", "r", "g", "b"].map((k) => [
          k,
          [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        ]),
      ),
    };
    gl.getParameter = (key) =>
      key === gl.MAX_TEXTURE_IMAGE_UNITS ? 4 : parameter(key);
    attempt(() => engine.render(graph));
    gl.getParameter = parameter;
    gl.texStorage2D = (target, levels, format, width, height) =>
      storage(target, levels, format, -1, height);
    attempt(() => engine.render(graph));
    gl.texStorage2D = storage;
    engine.render(graph);
    const recovered = Array.from(engine.readPixels());
    engine.dispose();
    return { before, after, recovered, failures };
  });
  expect(result.after).toEqual(result.before);
  expect(result.recovered).toEqual(result.before);
  [
    "texture limit",
    "render-target limit",
    "render-target limit",
    "allocate preview",
    "texture-unit limit",
    "curve texture",
  ].forEach((reason, i) => expect(result.failures[i]).toContain(reason));
});

test("browser keeps editing through loss and retries a failed restoration", async ({
  page,
}) => {
  const { openNeutralGraph } = await import("./fixtures");
  await openNeutralGraph(page);
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 20;
    return canvas.toDataURL().split(",")[1];
  });
  await page.getByLabel("Choose image").setInputFiles({
    name: "recover.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  const preview = page.getByLabel("Graded image preview");
  await expect(preview).toHaveAttribute("width", "40");
  await preview.evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext("webgl2")!;
    const extension = gl.getExtension("WEBGL_lose_context")!;
    const create = gl.createTexture.bind(gl);
    Reflect.set(gl, "createTexture", () => null);
    canvas.addEventListener("test-restore", () => extension.restoreContext(), {
      once: true,
    });
    canvas.addEventListener(
      "webglcontextrestored",
      () => {
        gl.createTexture = create;
      },
      { once: true },
    );
    extension.loseContext();
  });
  await expect(
    page
      .getByText("Waiting for automatic restoration", { exact: false })
      .first(),
  ).toBeVisible();
  const exposure = page.getByRole("spinbutton", { name: "Exposure in stops" });
  await exposure.fill("1");
  await exposure.press("Enter");
  await preview.dispatchEvent("test-restore");
  await expect(
    page.getByText("Graphics recovery failed:", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry graphics recovery" })
    .click({ timeout: 5000 });
  await expect(
    page.getByRole("heading", { name: "Preview unavailable" }),
  ).toHaveCount(0);
  await expect(exposure).toHaveValue("1.00");
  await expect(preview).toHaveAttribute("width", "40");
  await expect(page.getByText("recover.png", { exact: true })).toBeVisible();
});

test("mobile warning keeps the independently probed full-float route", async ({
  page,
}) => {
  await page.emulateMedia({ media: "screen" });
  await page.addInitScript(() => {
    const match = window.matchMedia.bind(window);
    window.matchMedia = (query) =>
      query === "(pointer: coarse)"
        ? Object.defineProperty(match(query), "matches", { value: true })
        : match(query);
  });
  await page.goto("/");
  await expect(
    page.getByText("Desktop is recommended.", { exact: false }),
  ).toBeVisible();
  await openLutExport(page);
  await expect(
    page.getByText("32-bit float", { exact: false }).first(),
  ).toBeVisible();
});

test("precision/readback probes reject corrupted data and export refuses non-finite artifacts", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const canvas = document.createElement("canvas");
    const engine = new GradingEngine(canvas);
    const gl = canvas.getContext("webgl2")!;
    const read = gl.readPixels;
    const failures: string[] = [];
    const attempt = (operation: () => void) => {
      try {
        operation();
        failures.push("unexpected success");
      } catch (cause) {
        failures.push(String(cause));
      }
    };
    gl.readPixels = function (
      this: WebGL2RenderingContext,
      ...args: unknown[]
    ) {
      Reflect.apply(read, this, args);
      if (ArrayBuffer.isView(args[6])) (args[6] as Float32Array).fill(0);
    };
    attempt(() => engine.latticeSupport());
    gl.readPixels = read;
    const support = engine.latticeSupport();
    gl.readPixels = function (
      this: WebGL2RenderingContext,
      ...args: unknown[]
    ) {
      Reflect.apply(read, this, args);
      if (ArrayBuffer.isView(args[6])) (args[6] as Float32Array)[0] = Infinity;
    };
    attempt(() => engine.renderLattice(createGraph(), 17));
    gl.readPixels = read;
    engine.dispose();
    const proto = WebGL2RenderingContext.prototype;
    const precision = proto.getShaderPrecisionFormat;
    proto.getShaderPrecisionFormat = () => ({
      precision: 10,
      rangeMin: 14,
      rangeMax: 14,
    });
    try {
      attempt(() => new GradingEngine(document.createElement("canvas")));
    } finally {
      proto.getShaderPrecisionFormat = precision;
    }
    return { support, failures };
  });
  expect(result.support).toEqual({ format: "RGBA32F" });
  expect(result.failures[0]).toContain("RGBA32F readback error");
  expect(result.failures[0]).toContain("RGBA16F readback error");
  expect(result.failures[1]).toContain("non-finite LUT");
  expect(result.failures[2]).toContain("precision required");
});

test("65-cube automatically tiles at device limits and fidelity uses full preview size", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph, serializeCube } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const canvas = document.createElement("canvas");
    const engine = new GradingEngine(canvas);
    const gl = canvas.getContext("webgl2")!;
    const graph = createGraph();
    graph.colour.input = graph.colour.output = {
      transfer: "linear",
      primaries: "rec709",
    };
    const parameter = gl.getParameter.bind(gl);
    gl.getParameter = (key) =>
      key === gl.MAX_RENDERBUFFER_SIZE ? 128 : parameter(key);
    const lattice = engine.renderLattice(graph, 65);
    const cube = serializeCube({
      title: "Tiled identity",
      size: 65,
      samples: lattice,
    });
    gl.getParameter = parameter;
    engine.setImage(new ImageData(40, 20));
    engine.renderViewer(graph, { interactive: true });
    const interactive = [canvas.width, canvas.height];
    const report = engine.measureFidelity(graph, {
      size: 17,
      interpolation: "trilinear",
    });
    engine.recover();
    const current = engine.isFidelityCurrent(report, graph);
    engine.dispose();
    return { cube, interactive, full: [report.width, report.height], current };
  });
  const { parseCube } = await import("./cube-tools");
  const cube = parseCube(result.cube);
  expect(cube.size).toBe(65);
  // Verify ordering and precision at every lattice point, including tile boundaries.
  let maximumError = 0;
  for (let b = 0; b < 65; b++)
    for (let g = 0; g < 65; g++)
      for (let r = 0; r < 65; r++) {
        const offset = (r + g * 65 + b * 65 * 65) * 3;
        [r, g, b].forEach((step, channel) => {
          maximumError = Math.max(
            maximumError,
            Math.abs(cube.table[offset + channel] - step / 64),
          );
        });
      }
  expect(maximumError).toBeLessThanOrEqual(0.500001e-6);
  expect(result.interactive).toEqual([20, 10]);
  expect(result.full).toEqual([40, 20]);
  expect(result.current).toBe(false);
});

test("initial program allocation failure can be retried without reloading", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const proto = WebGL2RenderingContext.prototype;
    const create = proto.createProgram;
    Reflect.set(proto, "createProgram", () => null);
    window.addEventListener(
      "resources-available",
      () => {
        proto.createProgram = create;
      },
      { once: true },
    );
  });
  await page.goto("/");
  await expect(
    page
      .getByText("Could not allocate a grading program.", { exact: true })
      .first(),
  ).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("resources-available")),
  );
  await page
    .getByRole("button", { name: "Retry graphics recovery" })
    .click({ timeout: 5000 });
  await expect(
    page.getByRole("heading", { name: "Preview unavailable" }),
  ).toHaveCount(0);
  await openLutExport(page);
  await expect(page.getByText("32-bit float", { exact: false })).toBeVisible();
  const canvas = page.getByLabel("Graded image preview");
  await canvas.evaluate((element: HTMLCanvasElement) => {
    const extension = element
      .getContext("webgl2")!
      .getExtension("WEBGL_lose_context")!;
    element.addEventListener("test-restore", () => extension.restoreContext(), {
      once: true,
    });
    extension.loseContext();
  });
  await expect(
    page.getByRole("heading", { name: "Preview unavailable" }),
  ).toBeVisible();
  await canvas.dispatchEvent("test-restore");
  await expect(
    page.getByRole("heading", { name: "Preview unavailable" }),
  ).toHaveCount(0);
  await openLutExport(page);
  await expect(page.getByText("32-bit float", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export .cube", exact: true }),
  ).toBeEnabled();
});
