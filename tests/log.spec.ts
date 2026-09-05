import { test, expect } from "@playwright/test";

test("LogC3 EI 800 decodes published exposure values through the engine", async ({
  page,
}) => {
  await page.goto("/");
  const actual = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    const graph = createGraph();
    graph.colour.input = { transfer: "logc3", primaries: "rec709" };
    graph.colour.output = { transfer: "linear", primaries: "rec709" };
    graph.nodes[2].data.clamp = "unbounded";
    // ARRI 2017 exposure-domain EI 800 table and worked formula vectors.
    const codes = [
      0.092809, 0.391006832034, 0.57063155812, 0.149657834105, 0.03913245,
      0.718701631374,
    ];
    engine.setImage({
      width: codes.length,
      height: 1,
      data: new Float32Array(codes.flatMap((v) => [v, v, v, 0.5])),
    });
    engine.render(graph);
    const pixels = Array.from<number>(engine.readPixels());
    engine.dispose();
    return pixels;
  });
  [0, 0.18, 1, 0.010591, -0.01, 4].forEach((v, i) => {
    for (let c = 0; c < 3; c++)
      expect(Math.abs(actual[i * 4 + c] - v)).toBeLessThan(5e-6);
    expect(actual[i * 4 + 3]).toBe(0.5);
  });
});

test("S-Log3 decodes Sony black, grey, white and toe values", async ({
  page,
}) => {
  await page.goto("/");
  const actual = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    const graph = createGraph();
    graph.colour.input = { transfer: "slog3", primaries: "rec709" };
    graph.colour.output = { transfer: "linear", primaries: "rec709" };
    graph.nodes[2].data.clamp = "unbounded";
    // Sony appendix: full-range 10-bit black 95, grey 420; white rounds to 598.
    const codes = [
      95 / 1023,
      420 / 1023,
      0.584452842075,
      171.2102946929 / 1023,
      0.026644688004,
      0.749098911819,
    ];
    engine.setImage({
      width: codes.length,
      height: 1,
      data: new Float32Array(codes.flatMap((v) => [v, v, v, 1])),
    });
    engine.render(graph);
    const pixels = Array.from<number>(engine.readPixels());
    engine.dispose();
    return pixels;
  });
  [0, 0.18, 0.9, 0.01125, -0.01, 4].forEach((v, i) => {
    for (let c = 0; c < 3; c++)
      expect(Math.abs(actual[i * 4 + c] - v)).toBeLessThan(5e-6);
  });
});

test("camera gamuts preserve linear primaries and neutral white without a look transform", async ({
  page,
}) => {
  await page.goto("/");
  const actual = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    const graph = createGraph();
    graph.colour.output = { transfer: "linear", primaries: "rec709" };
    graph.nodes[2].data.clamp = "unbounded";
    engine.setImage({
      width: 4,
      height: 1,
      data: new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1]),
    });
    const values = ["arri-wide-gamut3", "sgamut3-cine"].map((primaries) => {
      graph.colour.input = { transfer: "linear", primaries };
      engine.render(graph);
      return Array.from<number>(engine.readPixels());
    });
    engine.dispose();
    return values;
  });
  // ARRI p7 linear matrix (not p6 tone-map matrix); Sony p7 chromaticities
  // converted analytically to Rec.709 D65. Columns are RGB primary probes.
  const expected = [
    [
      1.617523, -0.070573, -0.021102, 1, -0.537287, 1.334613, -0.226954, 1,
      -0.080237, -0.26404, 1.248056, 1, 1, 1, 1, 1,
    ],
    [
      1.626948, -0.178515, -0.044436, 1, -0.540138, 1.41794, -0.19592, 1,
      -0.08681, -0.239425, 1.240356, 1, 1, 1, 1, 1,
    ],
  ];
  actual.forEach((pixels, i) =>
    pixels.forEach((v, j) =>
      expect(Math.abs(v - expected[i][j])).toBeLessThan(5e-6),
    ),
  );
});

for (const profile of [
  {
    transfer: "logc3",
    primaries: "arri-wide-gamut3",
    toe: [0.01059, 0.010591, 0.010592],
    codes: [0.14965246645, 0.149657834105, 0.149662951472],
    grey: 0.391006832034,
    black: 0.092809,
    white: 0.57063155812,
  },
  {
    transfer: "slog3",
    primaries: "sgamut3-cine",
    toe: [0.011249, 0.01125, 0.011251],
    codes: [0.167354369936, 0.16736099188, 0.167366215976],
    grey: 420 / 1023,
    black: 95 / 1023,
    white: 0.59602734369,
  },
]) {
  test(`${profile.transfer} encodes both sides of its toe and inverts through saved CST metadata`, async ({
    page,
  }) => {
    await page.goto("/");
    const actual = await page.evaluate(async (profile) => {
      const { GradingEngine, createGraph } = await import(
        /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
      );
      const engine = new GradingEngine(document.createElement("canvas"));
      const graph = createGraph();
      const linear = { transfer: "linear", primaries: profile.primaries };
      const log = { transfer: profile.transfer, primaries: profile.primaries };
      graph.colour = { input: linear, working: linear, output: log };
      graph.nodes[2].data.clamp = "unbounded";
      const samples = [...profile.toe, 0.18, 0, 1, -0.1, 16];
      const input = samples.flatMap((v) => [v, v, v, 0.75]);
      engine.setImage({
        width: samples.length,
        height: 1,
        data: new Float32Array(input),
      });
      engine.render(graph);
      const encoded = Array.from<number>(engine.readPixels());
      // Actual inverse invocation, not a same-encoding no-op.
      engine.setImage({
        width: samples.length,
        height: 1,
        data: new Float32Array(encoded),
      });
      graph.colour = { input: log, working: linear, output: linear };
      engine.render(graph);
      const decoded = Array.from<number>(engine.readPixels());
      // CST reaches output encoding, exercising no double encode after JSON save/restore.
      graph.nodes.push({
        id: "cst",
        type: "cst",
        position: { x: 0, y: 0 },
        data: { from: linear, to: log },
      });
      graph.edges[1].source = "cst";
      graph.edges.push({
        id: "cst-in",
        source: "exposure",
        target: "cst",
        sourceHandle: "rgb",
        targetHandle: "rgb",
      });
      graph.colour.output = log;
      const saved = JSON.parse(JSON.stringify(graph));
      engine.render(saved);
      const restored = Array.from<number>(engine.readPixels());
      engine.dispose();
      return {
        encoded,
        decoded,
        restored,
        input,
        validation: GradingEngine.validate(saved),
      };
    }, profile);
    [...profile.codes, profile.grey, profile.black, profile.white].forEach(
      (v, i) => {
        expect(Math.abs(actual.encoded[i * 4] - v)).toBeLessThan(5e-6);
      },
    );
    actual.decoded.forEach((v, i) =>
      expect(Math.abs(v - actual.input[i])).toBeLessThan(3e-5),
    );
    actual.restored.forEach((v, i) =>
      expect(Math.abs(v - actual.encoded[i])).toBeLessThan(5e-6),
    );
    expect(actual.validation).toBeNull();
  });
}

test("camera-log output inverts asymmetric colours and recovers chart highlights in linear light", async ({
  page,
}) => {
  await page.goto("/");
  const actual = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const { createLogChart, logCharts } = await import(
      /* @vite-ignore */ "/src/logCharts.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    const input = [0.7, 0.05, -0.02, 0.5, 0, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1];
    const results = Object.keys(logCharts).map((profile) => {
      const log = logCharts[profile].encoding;
      const linear = { transfer: "linear", primaries: "rec709" };
      const graph = createGraph();
      graph.nodes[2].data.clamp = "unbounded";
      graph.colour = { input: linear, working: linear, output: log };
      engine.setImage({ width: 4, height: 1, data: new Float32Array(input) });
      engine.render(graph);
      const encoded = engine.readPixels();
      engine.setImage({ width: 4, height: 1, data: encoded });
      graph.colour = { input: log, working: linear, output: linear };
      engine.render(graph);
      const roundTrip = Array.from<number>(engine.readPixels());
      engine.setImage(createLogChart(profile));
      graph.nodes[1].data.stops = -4;
      engine.render(graph);
      const chart = engine.readPixels();
      return {
        roundTrip,
        greys: [48, 144, 240, 336, 432, 528].map((x) => chart[x * 4]),
      };
    });
    engine.dispose();
    return { input, results };
  });
  for (const result of actual.results) {
    result.roundTrip.forEach((v, i) =>
      expect(Math.abs(v - actual.input[i])).toBeLessThan(5e-6),
    );
    [0, 0.000625, 0.01125, 0.05625, 0.25, 1].forEach((v, i) =>
      expect(Math.abs(v - result.greys[i])).toBeLessThan(5e-6),
    );
  }
});
