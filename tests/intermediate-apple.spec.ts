import { test, expect } from "@playwright/test";

// Blackmagic v1.1 p4: published coefficients evaluated independently in double
// precision. Keep fixture literals independent of production shaders/charts.
const intermediate = {
  transfer: "davinci-intermediate",
  samples: [
    -0.01, 0, 0.00262309, 0.00262409, 0.00262509, 0.18, 1, 10, 100, 200,
  ],
  codes: [
    -0.1044426855, 0, 0.027396256391, 0.027406700659, 0.027417144067,
    0.336043272385, 0.513837441116, 0.756598982755, 0.999999987017,
    1.073288502039,
  ],
};

// Apple September 2023 white paper pp4–5, including both toe boundaries.
const apple = {
  transfer: "apple-log",
  samples: [
    -0.1, -0.05641188, -0.05641088, -0.05640988, -0.03, 0, 0.009999, 0.01,
    0.010001, 0.18, 0.9, 1, 12, 16,
  ],
  codes: [
    0, 0, 0, 0.000000000047287, 0.032984396172, 0.150476452301, 0.208549035244,
    0.208555318703, 0.2085615993, 0.488272458527, 0.681686795934,
    0.694552983055, 0.999999978401, 1.035462914421,
  ],
};

for (const profile of [intermediate, apple]) {
  test(`${profile.transfer} encodes reference values and decodes independent codes`, async ({
    page,
  }) => {
    await page.goto("/");
    const actual = await page.evaluate(async (profile) => {
      const { GradingEngine, createGraph } = await import(
        /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
      );
      const engine = new GradingEngine(document.createElement("canvas"));
      const graph = createGraph();
      const linear = { transfer: "linear", primaries: "rec709" };
      const log = { transfer: profile.transfer, primaries: "rec709" };
      graph.nodes[2].data.clamp = "unbounded";
      function render(samples: number[]) {
        engine.setImage({
          width: samples.length,
          height: 1,
          data: new Float32Array(samples.flatMap((v) => [v, v, v, 0.5])),
        });
        engine.render(graph);
        return Array.from<number>(engine.readPixels());
      }
      graph.colour = { input: linear, working: linear, output: log };
      const encoded = render(profile.samples);
      graph.colour = { input: log, working: linear, output: linear };
      const decoded = render(profile.codes);
      const inverse = render(encoded.filter((_, i) => i % 4 === 0));
      engine.dispose();
      return { encoded, decoded, inverse };
    }, profile);
    profile.codes.forEach((v, i) => {
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(actual.encoded[i * 4 + c] - v)).toBeLessThan(5e-6);
        // Relative tolerance accommodates float log inversion at scene 200.
        const expected = Math.max(
          profile.samples[i],
          profile.transfer === "apple-log" ? -0.05641088 : -Infinity,
        );
        const tolerance = 5e-6 * Math.max(1, Math.abs(expected));
        expect(Math.abs(actual.decoded[i * 4 + c] - expected)).toBeLessThan(
          tolerance,
        );
        expect(Math.abs(actual.inverse[i * 4 + c] - expected)).toBeLessThan(
          tolerance,
        );
      }
      expect(actual.encoded[i * 4 + 3]).toBe(0.5);
      expect(actual.decoded[i * 4 + 3]).toBe(0.5);
    });
  });
}

test("DaVinci Wide Gamut transforms publisher primary vectors and round-trips CST metadata", async ({
  page,
}) => {
  await page.goto("/");
  const actual = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    const graph = createGraph();
    const wide = { transfer: "linear", primaries: "davinci-wide-gamut" };
    const linear = { transfer: "linear", primaries: "rec709" };
    graph.colour = { input: wide, working: linear, output: linear };
    graph.nodes[2].data.clamp = "unbounded";
    const probes = [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1];
    engine.setImage({ width: 4, height: 1, data: new Float32Array(probes) });
    engine.render(graph);
    const converted = Array.from<number>(engine.readPixels());
    graph.colour.output = wide;
    engine.render(graph);
    const inverse = Array.from<number>(engine.readPixels());
    const results = [
      {
        transfer: "davinci-intermediate",
        primaries: "davinci-wide-gamut",
        grey: 0.336043272385,
      },
      { transfer: "apple-log", primaries: "rec2020", grey: 0.488272458527 },
    ].map(({ grey, ...log }) => {
      graph.colour = { input: log, working: log, output: log };
      graph.nodes = [
        graph.nodes.find((n: { id: string }) => n.id === "source"),
        graph.nodes.find((n: { id: string }) => n.id === "output"),
        {
          id: "decode",
          type: "cst",
          position: { x: 0, y: 0 },
          data: { from: log, to: linear },
        },
        {
          id: "encode",
          type: "cst",
          position: { x: 0, y: 0 },
          data: { from: linear, to: log },
        },
      ];
      graph.edges = [
        ["source", "decode"],
        ["decode", "encode"],
        ["encode", "output"],
      ].map(([source, target]) => ({
        id: source,
        source,
        target,
        sourceHandle: "rgb",
        targetHandle: "rgb",
      }));
      const saved = JSON.parse(JSON.stringify(graph));
      engine.setImage({
        width: 1,
        height: 1,
        data: new Float32Array([grey, grey, grey, 0.75]),
      });
      engine.render(saved);
      return {
        pixels: Array.from<number>(engine.readPixels()),
        grey,
        validation: GradingEngine.validate(saved),
        colour: saved.colour,
        log,
      };
    });
    engine.dispose();
    return { converted, inverse, probes, results };
  });
  // Blackmagic v1.1 p3 RGB->XYZ matrix multiplied by the standard
  // XYZ->Rec.709 D65 matrix, independently of the chromaticity generator.
  const expected = [
    1.898614892, -0.168948786, -0.121539157, 1, -0.792176171, 1.488975757,
    -0.315675859, 1, -0.106438711, -0.320026974, 1.437215016, 1, 1, 1, 1, 1,
  ];
  actual.converted.forEach((v, i) =>
    expect(Math.abs(v - expected[i])).toBeLessThan(5e-6),
  );
  actual.inverse.forEach((v, i) =>
    expect(Math.abs(v - actual.probes[i])).toBeLessThan(5e-6),
  );
  actual.results.forEach(({ pixels, grey, validation, colour, log }) => {
    expect(validation).toBeNull();
    expect(colour).toEqual({ input: log, working: log, output: log });
    pixels
      .slice(0, 3)
      .forEach((v) => expect(Math.abs(v - grey)).toBeLessThan(5e-6));
    expect(pixels[3]).toBe(0.75);
  });
});

test("decoder breakpoints retain Apple's negative-code floor and Intermediate's linear toe", async ({
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
    const cases = [
      {
        transfer: "apple-log",
        codes: [
          -0.1, 0, 0.00000001, 0.208554315955, 0.208555315955, 0.208556315955,
        ],
      },
      {
        transfer: "davinci-intermediate",
        codes: [0.02740568, 0.02740668, 0.02740768],
      },
    ];
    const results = cases.map(({ transfer, codes }) => {
      graph.colour.input = { transfer, primaries: "rec709" };
      engine.setImage({
        width: codes.length,
        height: 1,
        data: new Float32Array(codes.flatMap((v) => [v, v, v, 1])),
      });
      engine.render(graph);
      return Array.from<number>(engine.readPixels()).filter(
        (_, i) => i % 4 === 0,
      );
    });
    engine.dispose();
    return results;
  });
  const expected = [
    [
      -0.05641088, -0.05641088, -0.0563963378, 0.0099998408, 0.0099999996,
      0.0100001588,
    ],
    [0.0026239923, 0.002624088, 0.0026241838],
  ];
  actual.forEach((values, i) =>
    values.forEach((v, j) =>
      expect(Math.abs(v - expected[i][j])).toBeLessThan(5e-7),
    ),
  );
});
