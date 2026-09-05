import { test, expect } from "@playwright/test";

test("CDL lower-clamped unbounded SOP and Rec.709 saturation reference vectors", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    const graph = createGraph();
    for (const key of ["input", "working", "output"])
      graph.colour[key] = { transfer: "linear", primaries: "rec709" };
    graph.nodes[2].data.clamp = "unbounded";
    graph.nodes[1].type = "cdl";
    graph.nodes[1].data = {
      slope: [1, 1, 1],
      offset: [0, 0, 0],
      power: [1, 1, 1],
      saturation: 1,
    };
    engine.setImage({
      width: 1,
      height: 1,
      data: new Float32Array([-0.5, 0.5, 2, 1]),
    });
    engine.render(graph);
    const neutral = Array.from(engine.readPixels());
    graph.nodes[1].data = {
      slope: [2, 1, 0.5],
      offset: [0.25, 0, 0],
      power: [2, 2, 2],
      saturation: 0,
    };
    engine.render(JSON.parse(JSON.stringify(graph)));
    const adjusted = Array.from(engine.readPixels());
    engine.dispose();
    return { neutral, adjusted };
  });
  // Half-float preview tolerance: 0.002 absolute, before comparing any vectors.
  [0, 0.5, 2, 1].forEach((v, i) =>
    expect(Math.abs((result.neutral[i] as number) - v)).toBeLessThan(0.002),
  );
  [0.251, 0.251, 0.251, 1].forEach((v, i) =>
    expect(Math.abs((result.adjusted[i] as number) - v)).toBeLessThan(0.002),
  );
});

test("contrast preserves its pivot, floors near-zero inputs and keeps highlights", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    const graph = createGraph();
    for (const key of ["input", "working", "output"])
      graph.colour[key] = { transfer: "linear", primaries: "rec709" };
    graph.nodes[2].data.clamp = "unbounded";
    graph.nodes[1].type = "contrast";
    graph.nodes[1].data = { contrast: 2, pivot: 0.5 };
    engine.setImage({
      width: 2,
      height: 1,
      data: new Float32Array([0.25, 0.5, 2, 1, -1, 0, 0.0000001, 1]),
    });
    engine.render(graph);
    const adjusted = Array.from(engine.readPixels());
    graph.nodes[1].data.contrast = 1;
    engine.render(graph);
    const neutral = Array.from(engine.readPixels());
    engine.dispose();
    return { adjusted, neutral };
  });
  [0.125, 0.5, 8, 1, 0, 0, 0, 1].forEach((v, i) =>
    expect(Math.abs((result.adjusted[i] as number) - v)).toBeLessThan(0.002),
  );
  [0.25, 0.5, 2, 1, 0.000001, 0.000001, 0.000001, 1].forEach((v, i) =>
    expect(Math.abs((result.neutral[i] as number) - v)).toBeLessThan(
      i >= 4 && i < 7 ? 0.0000001 : 0.002,
    ),
  );
});

test("saturation is neutral unbounded and vibrance favours less-saturated colours", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    const graph = createGraph();
    for (const key of ["input", "working", "output"])
      graph.colour[key] = { transfer: "linear", primaries: "rec709" };
    graph.nodes[2].data.clamp = "unbounded";
    graph.nodes[1].type = "saturation";
    graph.nodes[1].data = { saturation: 1, vibrance: 0 };
    engine.setImage({
      width: 3,
      height: 1,
      data: new Float32Array([0.6, 0.4, 0.4, 1, 1, 0, 0, 1, -0.5, 0.5, 2, 1]),
    });
    engine.render(graph);
    const neutral = Array.from(engine.readPixels());
    graph.nodes[1].data.vibrance = 1;
    engine.render(graph);
    const vibrant = Array.from(engine.readPixels());
    graph.nodes[1].data = { saturation: 0, vibrance: 0 };
    engine.render(graph);
    const grey = Array.from(engine.readPixels());
    engine.dispose();
    return { neutral, vibrant, grey };
  });
  [0.6, 0.4, 0.4, 1, 1, 0, 0, 1, -0.5, 0.5, 2, 1].forEach((v, i) =>
    expect(Math.abs((result.neutral[i] as number) - v)).toBeLessThan(0.002),
  );
  [0.7049867, 0.3716533, 0.3716533, 1, 1, 0, 0, 1].forEach((v, i) =>
    expect(Math.abs((result.vibrant[i] as number) - v)).toBeLessThan(0.002),
  );
  [
    0.44252, 0.44252, 0.44252, 1, 0.2126, 0.2126, 0.2126, 1, 0.3957, 0.3957,
    0.3957, 1,
  ].forEach((v, i) =>
    expect(Math.abs((result.grey[i] as number) - v)).toBeLessThan(0.002),
  );
});

test("adjustment inspectors support reset, wheel edits and reversible history", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add CDL", exact: true }).click();
  const slope = page.getByRole("spinbutton", { name: "Slope R", exact: true });
  await slope.fill("1.5");
  await slope.press("Enter");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(slope).toHaveValue("1");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(slope).toHaveValue("1.5");
  await page.getByRole("button", { name: "Reset CDL", exact: true }).click();
  await expect(slope).toHaveValue("1");
  const wheel = page.getByRole("group", {
    name: "Slope colour wheel",
    exact: true,
  });
  await wheel.focus();
  await wheel.press("ArrowRight");
  await expect(slope).not.toHaveValue("1");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(slope).toHaveValue("1");
  await page.getByRole("button", { name: "Add Contrast", exact: true }).click();
  const contrast = page.getByRole("spinbutton", {
    name: "Contrast amount",
    exact: true,
  });
  await contrast.fill("2");
  await contrast.press("Enter");
  await contrast.dblclick();
  await expect(contrast).toHaveValue("1");
  await page
    .getByRole("button", { name: "Add Saturation", exact: true })
    .click();
  const vibrance = page.getByRole("slider", {
    name: "Scrub Vibrance",
    exact: true,
  });
  await vibrance.focus();
  await vibrance.press("ArrowRight");
  await expect(
    page.getByRole("spinbutton", { name: "Vibrance", exact: true }),
  ).toHaveValue("0.01");
  await page
    .getByRole("button", { name: "Reset Saturation", exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "Vibrance", exact: true }),
  ).toHaveValue("0");
});

test("all adjustment parameters reject invalid values and numeric edits reuse programs", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const original = WebGL2RenderingContext.prototype.compileShader;
    let compiles = 0;
    WebGL2RenderingContext.prototype.compileShader = function (shader) {
      compiles++;
      original.call(this, shader);
    };
    const engine = new GradingEngine(document.createElement("canvas"));
    engine.setImage({
      width: 1,
      height: 1,
      data: new Float32Array([0.25, 0.5, 0.75, 1]),
    });
    const graph = createGraph();
    for (const key of ["input", "working", "output"])
      graph.colour[key] = { transfer: "linear", primaries: "rec709" };
    graph.nodes[2].data.clamp = "unbounded";
    const errors: (string | null)[] = [],
      deltas: number[] = [],
      roundTrips: number[][] = [];
    const cases = [
      {
        type: "cdl",
        data: {
          slope: [1, 1, 1],
          offset: [0, 0, 0],
          power: [1, 1, 1],
          saturation: 1,
        },
      },
      { type: "contrast", data: { contrast: 1, pivot: 0.18 } },
      { type: "saturation", data: { saturation: 1, vibrance: 0 } },
    ];
    try {
      for (const adjustment of cases) {
        Object.assign(graph.nodes[1], structuredClone(adjustment));
        engine.render(graph);
        const initial = compiles;
        for (const [key, value] of Object.entries(adjustment.data)) {
          for (const invalid of [NaN, Infinity, -Infinity, 1e40]) {
            graph.nodes[1].data[key] = Array.isArray(value)
              ? [value[0], invalid, value[2]]
              : invalid;
            errors.push(GradingEngine.validate(graph));
          }
          graph.nodes[1].data[key] = Array.isArray(value)
            ? value.map((v) => v + 0.1)
            : value + 0.1;
          engine.render(graph);
        }
        const before = Array.from(engine.readPixels()) as number[];
        engine.render(JSON.parse(JSON.stringify(graph)));
        roundTrips.push(before.map((v, i) => v - engine.readPixels()[i]));
        deltas.push(compiles - initial);
      }
      graph.nodes[1].type = "contrast";
      for (const pivot of [0, -1, 1e-50]) {
        graph.nodes[1].data = { contrast: 1, pivot };
        errors.push(GradingEngine.validate(graph));
      }
      graph.nodes[1].type = "cdl";
      graph.nodes[1].data = { ...cases[0].data, power: [1, 0, 1] };
      errors.push(GradingEngine.validate(graph));
    } finally {
      engine.dispose();
      WebGL2RenderingContext.prototype.compileShader = original;
    }
    return { errors, deltas, roundTrips };
  });
  expect(result.errors.every(Boolean)).toBe(true);
  expect(result.deltas).toEqual([0, 0, 0]);
  expect(result.roundTrips).toEqual([
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
});
