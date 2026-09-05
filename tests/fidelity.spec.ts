import { test, expect } from "@playwright/test";

test("measures the full image in output encoding and excludes transparent and out-of-domain inputs", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    const graph = createGraph();
    graph.colour.input = graph.colour.output = { ...graph.colour.working };
    engine.setImage({
      width: 2,
      height: 2,
      data: new Float32Array([
        0.1234567, 0.25, 0.75, 1, 0.8, 0.2, 0.3, 0, -0.01, 0.2, 0.3, 1, 1, 0,
        0.5, 0.5,
      ]),
    });
    const report = engine.measureFidelity(graph, {
      size: 17,
      interpolation: "trilinear",
      title: "Measured",
    });
    engine.dispose();
    return {
      ...report,
      errors: Array.from(report.errors),
      overlay: Array.from(report.overlay),
    };
  });
  expect(result.sampleCount).toBe(2);
  expect(result.transparentCount).toBe(1);
  expect(result.outOfDomainCount).toBe(1);
  expect(result.width).toBe(2);
  expect(result.height).toBe(2);
  expect(result.maximum).toBeLessThan(0.001);
  expect(result.channels).toHaveLength(3);
  expect(result.precision).toBe("RGBA32F");
  expect(result.interpolation).toBe("trilinear");
  expect(result.cube).toContain('TITLE "Measured"');
  expect(result.overlay.slice(4, 12)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
});

import { applyCube, applyTetrahedral, parseCube } from "./cube-tools";

for (const interpolation of ["trilinear", "tetrahedral"] as const) {
  test(`${interpolation} matches an independent applier across six orderings, ties, boundaries and nearest-rank metrics`, async ({
    page,
  }) => {
    await page.goto("/");
    // Six fractional orderings in the same cell, ties, every corner, and asymmetric probes.
    const permutations = [
      [0.8, 0.5, 0.2],
      [0.8, 0.2, 0.5],
      [0.5, 0.8, 0.2],
      [0.2, 0.8, 0.5],
      [0.5, 0.2, 0.8],
      [0.2, 0.5, 0.8],
    ];
    const probes = permutations.map(
      (p) => p.map((v) => (7 + v) / 16) as [number, number, number],
    );
    probes.push(
      [0.5, 0.5, 0.5],
      [0.46875, 0.46875, 0.46875],
      [0.23, 0.17, 0.71],
    );
    for (let i = 0; i < 8; i++)
      probes.push([i & 1, (i >> 1) & 1, (i >> 2) & 1]);
    // 21 samples distinguishes nearest rank (20th) from linear percentile interpolation.
    probes.push(
      [0.44, 0.1, 0.2],
      [0.1, 0.44, 0.2],
      [0.2, 0.1, 0.44],
      [0.9, 0.9, 0.9],
    );
    const result = await page.evaluate(
      async ({ probes, interpolation }) => {
        const { GradingEngine, createStarterGraph } = await import(
          /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
        );
        const graph = createStarterGraph();
        graph.colour.input = graph.colour.output = { ...graph.colour.working };
        const qualifier = graph.nodes.find(
          (n: { type: string }) => n.type === "qualifier",
        );
        qualifier.data.value = [0.46, 0.9, 0.03];
        const engine = new GradingEngine(document.createElement("canvas"));
        engine.setImage({
          width: 3,
          height: 7,
          data: new Float32Array(probes.flatMap((p) => [...p, 1])),
        });
        engine.render(graph);
        const direct = Array.from(engine.readPixels()) as number[];
        const report = engine.measureFidelity(graph, {
          size: 17,
          interpolation,
        });
        engine.dispose();
        return {
          cube: report.cube,
          direct,
          errors: Array.from(report.errors) as number[],
          overlay: Array.from(report.overlay),
          channels: report.channels,
          maximum: report.maximum,
          advice: report.advice,
        };
      },
      { probes, interpolation },
    );
    const cube = parseCube(result.cube);
    const expected = probes.map((p, i) => {
      const applied = (
        interpolation === "trilinear" ? applyCube : applyTetrahedral
      )(cube, p);
      return applied.map(
        (v, c) => Math.abs(v - result.direct[i * 4 + c]) * 255,
      );
    });
    expected.forEach((pixel, i) =>
      pixel.forEach((v, c) =>
        expect(result.errors[i * 4 + c]).toBeCloseTo(v, 2),
      ),
    );
    for (let c = 0; c < 3; c++) {
      const sorted = expected.map((p) => p[c]).sort((a, b) => a - b);
      expect(result.channels[c].maximum).toBeCloseTo(sorted.at(-1)!, 2);
      expect(result.channels[c].p95).toBeCloseTo(sorted[19], 2);
    }
    const peaks = expected.map((p) => Math.max(...p));
    expect(result.maximum).toBeGreaterThan(2);
    expect(
      result.advice.some((text: string) => text.includes("hard qualifier")),
    ).toBe(false);
    // The most erroneous pixel is yellow/red, the most accurate is blue, at their top-down positions.
    const worst = peaks.indexOf(Math.max(...peaks));
    expect(result.overlay[worst * 4]).toBe(255);
    expect(result.overlay[worst * 4 + 2]).toBe(0);
    const best = peaks.indexOf(Math.min(...peaks));
    expect(result.overlay[best * 4 + 2]).toBeGreaterThan(250);
  });
}

test("six-decimal quantization is measured before display conversion with the selected output policy", async ({
  page,
}) => {
  await page.goto("/");
  const reports = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const graph = createGraph();
    graph.colour.input = graph.colour.output = { ...graph.colour.working };
    graph.nodes[1].type = "cdl";
    graph.nodes[1].data = {
      slope: [0, 0, 0],
      offset: [0.1234567, -0.1, 1.1234567],
      power: [1, 1, 1],
      saturation: 1,
    };
    const engine = new GradingEngine(document.createElement("canvas"));
    engine.setImage({
      width: 1,
      height: 1,
      data: new Float32Array([0, 0, 0, 1]),
    });
    const result = ["clamp", "unbounded"].map((clamp) => {
      graph.nodes[2].data.clamp = clamp;
      const report = engine.measureFidelity(graph, {
        size: 17,
        interpolation: "tetrahedral",
      });
      engine.render(graph);
      return {
        direct: Array.from(engine.readPixels()) as number[],
        cube: report.cube,
        errors: Array.from(report.errors) as number[],
      };
    });
    engine.dispose();
    return result;
  });
  reports.forEach((report, i) => {
    const applied = applyTetrahedral(parseCube(report.cube), [0, 0, 0]);
    for (let c = 0; c < 3; c++)
      expect(report.errors[c]).toBeCloseTo(
        Math.abs(applied[c] - report.direct[c]) * 255,
        4,
      );
    expect(report.errors[0]).toBeGreaterThan(0.00005);
    expect(applied[2]).toBe(i === 0 ? 1 : 1.123457);
  });
});

test("steep curves and hard keys expose error and give explicitly heuristic remedies", async ({
  page,
}) => {
  await page.goto("/");
  const reports = await page.evaluate(async () => {
    const { GradingEngine, createGraph, createStarterGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const curve = createGraph();
    curve.colour.input = curve.colour.output = { ...curve.colour.working };
    curve.nodes[1].type = "curves";
    const identity = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    curve.nodes[1].data = {
      label: "Steep master",
      curves: {
        master: [
          { x: 0, y: 0 },
          { x: 0.49, y: 0 },
          { x: 0.495, y: 1 },
          { x: 1, y: 1 },
        ],
        r: identity,
        g: identity,
        b: identity,
      },
    };
    const key = createStarterGraph();
    key.colour.input = key.colour.output = { ...key.colour.working };
    const qualifier = key.nodes.find(
      (n: { type: string }) => n.type === "qualifier",
    );
    qualifier.data = {
      label: "Hard value key",
      hue: [0, 360, 0],
      sat: [0, 1, 0],
      value: [0.492, 1, 0],
    };
    const engine = new GradingEngine(document.createElement("canvas"));
    const data = new Float32Array(257 * 4);
    for (let i = 0; i < 257; i++)
      data.set([0.48 + i / 12800, 0.2, 0.1, 1], i * 4);
    engine.setImage({ width: 257, height: 1, data });
    const result = [curve, key].flatMap((graph) =>
      [17, 65].map((size) => {
        const r = engine.measureFidelity(graph, {
          size,
          interpolation: "trilinear",
        });
        return { maximum: r.maximum, advice: r.advice };
      }),
    );
    engine.dispose();
    return result;
  });
  for (let i = 0; i < reports.length; i++) {
    expect(reports[i].maximum).toBeGreaterThan(2);
    expect(reports[i].advice[0]).toContain(
      i % 2 === 0 ? "Try 65³" : "softening",
    );
    expect(reports[i].advice.join(" ")).toContain(
      i < 2 ? "Heuristic: Steep master" : "Heuristic: Hard value key",
    );
  }
});

test("full capped preview coverage and current-report checks track image, topology, parameters, encodings, policy, size and interpolation", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const graph = createGraph();
    graph.colour.input = graph.colour.output = { ...graph.colour.working };
    const engine = new GradingEngine(document.createElement("canvas"));
    const image = {
      width: 2050,
      height: 2,
      data: new Float32Array(2050 * 2 * 4).fill(1),
    };
    engine.setImage(image);
    const options = { size: 17, interpolation: "trilinear" };
    const report = engine.measureFidelity(graph, options);
    const checks = [engine.isFidelityCurrent(report, graph, options)];
    const layout = structuredClone(graph);
    layout.nodes[1].position.x += 10;
    layout.nodes[1].selected = false;
    checks.push(engine.isFidelityCurrent(report, layout, options));
    for (const change of [
      (g: typeof graph) => {
        g.nodes[1].data.stops = 1;
      },
      (g: typeof graph) => {
        g.edges[1].source = "source";
      },
      (g: typeof graph) => {
        g.colour.input.transfer = "srgb";
      },
      (g: typeof graph) => {
        g.colour.output.transfer = "srgb";
      },
      (g: typeof graph) => {
        g.colour.working.primaries = "rec2020";
      },
      (g: typeof graph) => {
        g.nodes[2].data.clamp = "unbounded";
      },
    ]) {
      const edited = structuredClone(graph);
      change(edited);
      checks.push(engine.isFidelityCurrent(report, edited, options));
    }
    checks.push(
      engine.isFidelityCurrent(report, graph, { ...options, size: 33 }),
    );
    checks.push(
      engine.isFidelityCurrent(report, graph, {
        ...options,
        interpolation: "tetrahedral",
      }),
    );
    engine.setImage(image);
    checks.push(engine.isFidelityCurrent(report, graph, options));
    engine.dispose();
    return {
      checks,
      sampleCount: report.sampleCount,
      width: report.width,
      height: report.height,
    };
  });
  expect(result.sampleCount).toBe(4096);
  expect([result.width, result.height]).toEqual([2048, 2]);
  expect(result.checks).toEqual([
    true,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
});
