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
    const pixels = Array.from<number>(engine.readPixels());
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
      return Array.from<number>(engine.readPixels());
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
    const pixels = Array.from<number>(engine.readPixels());
    engine.setImage(new ImageData(4096, 4));
    engine.render(0);
    const size = [canvas.width, canvas.height];
    engine.dispose();
    return { pixels, size };
  });
  expect(result.pixels).toEqual([1, 0, 0, 1, 0, 0, 1, 1]);
  expect(result.size).toEqual([2048, 2]);
});

test("editable graphs evaluate reachable nodes and reuse cached topology", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    engine.setImage(
      new ImageData(new Uint8ClampedArray([128, 128, 128, 255]), 1, 1),
    );
    const graph = createGraph();
    graph.nodes[1].data.stops = 1;
    engine.render(graph);
    const exposed = engine.readPixels()[0];
    const original = WebGL2RenderingContext.prototype.compileShader;
    let compiles = 0;
    WebGL2RenderingContext.prototype.compileShader = function (shader) {
      compiles++;
      original.call(this, shader);
    };
    graph.nodes.push({
      id: "draft",
      type: "exposure",
      position: { x: 0, y: 0 },
      data: { stops: 4 },
    });
    engine.render(graph);
    graph.nodes[1].position.x = 999;
    graph.nodes[1].data.stops = 0;
    engine.render(graph);
    const unchangedCompiles = compiles;
    const direct = structuredClone(graph);
    direct.edges = [
      {
        id: "direct",
        source: "source",
        target: "output",
        sourceHandle: "rgb",
        targetHandle: "rgb",
      },
    ];
    engine.render(direct);
    const newCompiles = compiles;
    engine.render(graph);
    const reusedCompiles = compiles;
    const neutral = engine.readPixels()[0];
    WebGL2RenderingContext.prototype.compileShader = original;
    engine.dispose();
    return { exposed, neutral, unchangedCompiles, newCompiles, reusedCompiles };
  });
  expect(result.exposed).toBeCloseTo(0.688453, 3);
  expect(result.neutral).toBeCloseTo(0.501961, 3);
  expect(result.unchangedCompiles).toBe(0);
  expect(result.newCompiles).toBeGreaterThan(0);
  expect(result.reusedCompiles).toBe(result.newCompiles);
});

test("rejects invalid graphs at the public engine boundary without changing rendered pixels", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    engine.setImage(
      new ImageData(new Uint8ClampedArray([128, 128, 128, 255]), 1, 1),
    );
    engine.render(createGraph());
    const failures: string[] = [];
    const invalid = (
      change: (graph: ReturnType<typeof createGraph>) => void,
    ) => {
      const graph = createGraph();
      change(graph);
      try {
        engine.render(graph);
        failures.push("accepted invalid graph");
      } catch (error) {
        failures.push((error as Error).message);
      }
    };
    invalid((g) => (g.version = 2));
    invalid((g) => g.nodes.push({ ...g.nodes[0], id: "second-source" }));
    invalid((g) => g.nodes.push({ ...g.nodes[2], id: "second-output" }));
    invalid((g) => g.edges.pop());
    invalid((g) => (g.nodes[1].data.stops = Infinity));
    invalid((g) => (g.edges[0].sourceHandle = "mask"));
    invalid((g) => {
      g.nodes.push({
        id: "cycle",
        type: "exposure",
        data: { stops: 0 },
        position: { x: 0, y: 0 },
      });
      g.edges[0].source = "cycle";
      g.edges.push({
        id: "cycle-edge",
        source: "exposure",
        target: "cycle",
        sourceHandle: "rgb",
        targetHandle: "rgb",
      });
    });
    invalid((g) => g.edges.push({ ...g.edges[0], id: "duplicate-input" }));
    const pixel = engine.readPixels()[0];
    engine.dispose();
    return { failures, pixel };
  });
  expect(result.failures).toEqual([
    "Unsupported graph schema version.",
    "Graph requires exactly one Source.",
    "Graph requires exactly one Output.",
    "Output requires an RGB input. Connect it to Source.",
    "Exposure must be between −6 and +6 stops.",
    "Connect RGB outputs to RGB inputs. Mask ports are not supported by these nodes.",
    "Connection would create a cycle.",
    "This RGB input already has a connection. Remove it first.",
  ]);
  expect(result.pixel).toBeCloseTo(0.501961, 3);
});

test("serial exposures preserve highlights and output enums compile and reuse their programs", async ({
  page,
}) => {
  await page.goto("/");
  const actual = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    engine.setImage(
      new ImageData(new Uint8ClampedArray([128, 128, 128, 255]), 1, 1),
    );
    const graph = createGraph();
    graph.nodes[1].data.stops = 6;
    graph.nodes.push({
      id: "recover",
      type: "exposure",
      position: { x: 0, y: 0 },
      data: { stops: -6 },
    });
    graph.edges[1].source = "recover";
    graph.edges.push({
      id: "recover-input",
      source: "exposure",
      target: "recover",
      sourceHandle: "rgb",
      targetHandle: "rgb",
    });
    engine.render(graph);
    const recovered = engine.readPixels()[0];
    graph.nodes[3].data.stops = 0;
    engine.render(graph);
    const clamped = engine.readPixels()[0];
    graph.nodes[2].data.clamp = "unbounded";
    engine.render(graph);
    const unbounded = engine.readPixels()[0];
    const original = WebGL2RenderingContext.prototype.compileShader;
    let compiles = 0;
    WebGL2RenderingContext.prototype.compileShader = function (shader) {
      compiles++;
      original.call(this, shader);
    };
    graph.nodes[2].data.clamp = "clamp";
    engine.render(graph);
    graph.nodes[2].data.clamp = "unbounded";
    engine.render(graph);
    // Renaming stable IDs and changing image pixels do not change program structure.
    graph.nodes.forEach((n: { id: string }) => (n.id = "copy-" + n.id));
    graph.edges.forEach((e: { source: string; target: string }) => {
      e.source = "copy-" + e.source;
      e.target = "copy-" + e.target;
    });
    engine.setImage(
      new ImageData(new Uint8ClampedArray([64, 64, 64, 255]), 1, 1),
    );
    engine.render(graph);
    WebGL2RenderingContext.prototype.compileShader = original;
    engine.dispose();
    return { recovered, clamped, unbounded, compiles };
  });
  expect(actual.recovered).toBeCloseTo(0.501961, 3);
  expect(actual.clamped).toBe(1);
  expect(actual.unbounded).toBeCloseTo(3.095646, 3);
  expect(actual.compiles).toBe(0);
});

test("project input and output transfers are explicit", async ({ page }) => {
  await page.goto("/");
  const actual = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    engine.setImage(
      new ImageData(new Uint8ClampedArray([128, 128, 128, 255]), 1, 1),
    );
    const graph = createGraph();
    graph.colour = {
      input: { transfer: "rec709", primaries: "rec709" },
      working: { transfer: "linear", primaries: "rec709" },
      output: { transfer: "linear", primaries: "rec709" },
    };
    engine.render(graph);
    const pixel = engine.readPixels()[0];
    engine.dispose();
    return pixel;
  });
  expect(actual).toBeCloseTo(0.2614815, 3);
});

test("gamut conversion adapts DCI white and preserves unbounded primaries", async ({
  page,
}) => {
  await page.goto("/");
  const actual = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    engine.setImage(
      new ImageData(
        new Uint8ClampedArray([
          255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
        ]),
        4,
        1,
      ),
    );
    const graph = createGraph();
    graph.nodes[2].data.clamp = "unbounded";
    graph.colour.working = { transfer: "linear", primaries: "rec709" };
    graph.colour.output = { transfer: "linear", primaries: "rec709" };
    const values = ["rec2020", "display-p3", "dci-p3"].map((primaries) => {
      graph.colour.input = { transfer: "linear", primaries };
      engine.render(graph);
      return Array.from<number>(engine.readPixels());
    });
    engine.dispose();
    return values;
  });
  // Analytical reference vectors: Bradford CAT,
  // derived from ITU and SMPTE chromaticities, normalized white Y=1.
  const expected = [
    [
      1.660491, -0.12455, -0.018151, 1, -0.587641, 1.1329, -0.100579, 1,
      -0.07285, -0.008349, 1.11873, 1, 1, 1, 1, 1,
    ],
    [
      1.22494, -0.042057, -0.019638, 1, -0.22494, 1.042057, -0.078636, 1, 0, 0,
      1.098274, 1, 1, 1, 1, 1,
    ],
    [
      1.157516, -0.0415, -0.01805, 1, -0.154963, 1.045568, -0.078579, 1,
      -0.002553, -0.004068, 1.096629, 1, 1, 1, 1, 1,
    ],
  ];
  actual.forEach((pixels, i) =>
    pixels.forEach((v, j) => expect(v).toBeCloseTo(expected[i][j], 3)),
  );
});

test("CST metadata prevents a second output transform and warns on incompatible declarations", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    engine.setImage(
      new ImageData(new Uint8ClampedArray([128, 64, 192, 255]), 1, 1),
    );
    const graph = createGraph();
    graph.nodes.push({
      id: "cst",
      type: "cst",
      position: { x: 0, y: 0 },
      data: {
        from: { ...graph.colour.working },
        to: { ...graph.colour.output },
      },
    });
    graph.edges[1].source = "cst";
    graph.edges.push({
      id: "cst-in",
      source: "exposure",
      target: "cst",
      sourceHandle: "rgb",
      targetHandle: "rgb",
    });
    engine.render(graph);
    const pixel = Array.from<number>(engine.readPixels());
    const warnings = GradingEngine.warnings(graph);
    graph.nodes[3].data.from.transfer = "gamma22";
    const mismatch = GradingEngine.warnings(graph);
    graph.colour.working.transfer = "srgb";
    const exposureWarning = GradingEngine.warnings(graph);
    engine.dispose();
    return { pixel, warnings, mismatch, exposureWarning };
  });
  [128 / 255, 64 / 255, 192 / 255, 1].forEach((v, i) =>
    expect(result.pixel[i]).toBeCloseTo(v, 3),
  );
  expect(result.warnings).toEqual([]);
  expect(result.mismatch.join(" ")).toContain("CST from encoding differs");
  expect(result.exposureWarning.join(" ")).toContain(
    "Exposure expects linear light",
  );
});

test("viewer converts output to sRGB without changing numeric output pixels", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const canvas = document.createElement("canvas");
    const engine = new GradingEngine(canvas);
    engine.setImage(
      new ImageData(new Uint8ClampedArray([128, 128, 128, 255]), 1, 1),
    );
    const graph = createGraph();
    graph.colour.output.transfer = "linear";
    engine.render(graph);
    const output = engine.readPixels()[0];
    const gl = canvas.getContext("webgl2")!;
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    engine.dispose();
    return {
      output,
      display: Array.from(pixel),
      colourSpace: gl.drawingBufferColorSpace,
    };
  });
  expect(result.output).toBeCloseTo(0.215861, 3);
  expect(result.display).toEqual([128, 128, 128, 255]);
  expect(result.colourSpace).toBe("srgb");
});

test("transfer reference vectors cover toes, negatives, highlights and inverse pairs", async ({
  page,
}) => {
  await page.goto("/");
  const vectors = [
    {
      transfer: "srgb",
      input: [-0.1, 0, 0.04044, 0.04045, 0.04046, 0.5, 1, 2],
      decoded: [
        -0.007739938, 0, 0.003130031, 0.003130805, 0.003131595, 0.21404114, 1,
        4.953845752,
      ],
    },
    {
      transfer: "rec709",
      input: [-0.1, 0, 0.08099, 0.081, 0.08101, 0.5, 1, 2],
      decoded: [
        -0.022222222, 0, 0.017997778, 0.017945023, 0.01794724, 0.259589401, 1,
        4.211891875,
      ],
    },
    {
      transfer: "gamma22",
      input: [-2, -0.5, 0, 0.5, 1, 2],
      decoded: [-4.59479342, -0.21763764, 0, 0.21763764, 1, 4.59479342],
    },
    {
      transfer: "gamma24",
      input: [-2, -0.5, 0, 0.5, 1, 2],
      decoded: [-5.27803164, -0.189464571, 0, 0.189464571, 1, 5.27803164],
    },
    {
      transfer: "linear",
      input: [-2, -0.5, 0, 0.5, 1, 2],
      decoded: [-2, -0.5, 0, 0.5, 1, 2],
    },
  ];
  const actual = await page.evaluate(async (vectors) => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    const graph = createGraph();
    graph.nodes[2].data.clamp = "unbounded";
    const values = vectors.map((v) => {
      engine.setImage({
        width: v.input.length,
        height: 1,
        data: new Float32Array(v.input.flatMap((x) => [x, x, x, 1])),
      });
      graph.colour.input.transfer = v.transfer;
      graph.colour.output.transfer = "linear";
      engine.render(graph);
      const decoded = Array.from<number>(engine.readPixels()).filter(
        (_, i) => i % 4 === 0,
      );
      graph.colour.output.transfer = v.transfer;
      engine.render(graph);
      return {
        decoded,
        roundtrip: Array.from<number>(engine.readPixels()).filter(
          (_, i) => i % 4 === 0,
        ),
      };
    });
    engine.dispose();
    return values;
  }, vectors);
  actual.forEach((v, i) => {
    v.decoded.forEach((x, j) =>
      expect(x).toBeCloseTo(vectors[i].decoded[j], 5),
    );
    // BT.709's published rounded constants leave a small discontinuity at the toe.
    v.roundtrip.forEach((x, j) =>
      expect(Math.abs(x - vectors[i].input[j])).toBeLessThan(
        i === 1 ? 0.00025 : 0.00001,
      ),
    );
  });
});

test("encoding toes use the published branches and enum programs are cached", async ({
  page,
}) => {
  await page.goto("/");
  const actual = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    const graph = createGraph();
    graph.colour.input.transfer = "linear";
    graph.nodes[2].data.clamp = "unbounded";
    const values = [
      0.0031307, 0.0031308, 0.0031309, 0.017999, 0.018, 0.018001, -0.1, 2,
    ];
    engine.setImage({
      width: values.length,
      height: 1,
      data: new Float32Array(values.flatMap((x) => [x, x, x, 1])),
    });
    graph.colour.output.transfer = "srgb";
    engine.render(graph);
    const srgb = Array.from<number>(engine.readPixels()).filter(
      (_, i) => i % 4 === 0,
    );
    graph.colour.output.transfer = "rec709";
    engine.render(graph);
    const rec709 = Array.from<number>(engine.readPixels()).filter(
      (_, i) => i % 4 === 0,
    );
    const compile = WebGL2RenderingContext.prototype.compileShader;
    let compiles = 0;
    WebGL2RenderingContext.prototype.compileShader = function (shader) {
      compiles++;
      compile.call(this, shader);
    };
    try {
      graph.nodes[1].data.stops = 1;
      engine.render(graph);
      const numeric = compiles;
      graph.colour.output.transfer = "gamma24";
      engine.render(graph);
      const changed = compiles;
      graph.colour.output.transfer = "rec709";
      engine.render(graph);
      graph.colour.output.transfer = "gamma24";
      engine.render(graph);
      return { srgb, rec709, numeric, changed, reused: compiles };
    } finally {
      WebGL2RenderingContext.prototype.compileShader = compile;
      engine.dispose();
    }
  });
  [0.040448644, 0.040449936, 0.040451178].forEach((v, i) =>
    expect(actual.srgb[i]).toBeCloseTo(v, 6),
  );
  [0.0809955, 0.081247944, 0.08125245].forEach((v, i) =>
    expect(actual.rec709[i + 3]).toBeCloseTo(v, 6),
  );
  expect(actual.srgb[6]).toBeCloseTo(-1.292, 5);
  expect(actual.srgb[7]).toBeCloseTo(1.353256046, 5);
  expect(actual.rec709[6]).toBeCloseTo(-0.45, 5);
  expect(actual.rec709[7]).toBeCloseTo(1.402278243, 5);
  expect(actual.numeric).toBe(0);
  expect(actual.changed).toBeGreaterThan(0);
  expect(actual.reused).toBe(actual.changed);
});

test("CST gamut inverse pairs recover signed RGB and invalid encoding metadata is rejected", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    engine.setImage({
      width: 2,
      height: 1,
      data: new Float32Array([-0.2, 0.4, 2, 1, 1, 1, 1, 0.5]),
    });
    const graph = createGraph();
    graph.colour.input.transfer = "linear";
    graph.colour.output.transfer = "linear";
    graph.nodes[2].data.clamp = "unbounded";
    graph.nodes.push({
      id: "cst",
      type: "cst",
      position: { x: 0, y: 0 },
      data: {
        from: { ...graph.colour.working },
        to: { transfer: "gamma22", primaries: "dci-p3" },
      },
    });
    graph.edges[1].source = "cst";
    graph.edges.push({
      id: "in",
      source: "exposure",
      target: "cst",
      sourceHandle: "rgb",
      targetHandle: "rgb",
    });
    const compile = WebGL2RenderingContext.prototype.compileShader;
    let compiles = 0;
    WebGL2RenderingContext.prototype.compileShader = function (shader) {
      compiles++;
      compile.call(this, shader);
    };
    try {
      engine.render(graph);
      const first = compiles;
      graph.nodes[3].data.to.primaries = "display-p3";
      engine.render(graph);
      const changed = compiles;
      graph.nodes[3].data.to.primaries = "dci-p3";
      engine.render(graph);
      // Serialization order is not an enum change.
      graph.colour = Object.fromEntries(
        Object.entries(graph.colour)
          .reverse()
          .map(([key, value]) => [
            key,
            Object.fromEntries(Object.entries(value as object).reverse()),
          ]),
      );
      graph.nodes[3].data.to = { primaries: "dci-p3", transfer: "gamma22" };
      engine.render(graph);
      const reused = compiles;
      const pixels = Array.from<number>(engine.readPixels());
      graph.nodes[3].data.to.transfer = "unknown";
      const cstError = GradingEngine.validate(graph);
      graph.colour.input.primaries = "unknown";
      const projectError = GradingEngine.validate(graph);
      return { pixels, cstError, projectError, first, changed, reused };
    } finally {
      WebGL2RenderingContext.prototype.compileShader = compile;
      engine.dispose();
    }
  });
  [-0.2, 0.4, 2, 1, 1, 1, 1, 0.5].forEach((v, i) =>
    expect(result.pixels[i]).toBeCloseTo(v, 5),
  );
  expect(result.cstError).toContain("CST requires supported");
  expect(result.projectError).toContain("supported input, working and output");
  expect(result.changed).toBeGreaterThan(result.first);
  expect(result.reused).toBe(result.changed);
});
