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
