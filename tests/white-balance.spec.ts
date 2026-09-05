import { test, expect } from "@playwright/test";

test("source-white white balance preserves saturated, negative and HDR pixels in every gamut", async ({
  page,
}) => {
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const { GradingEngine, createGraph, primaries } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    const graph = createGraph();
    graph.nodes[1].type = "whiteBalance";
    graph.nodes[1].data = { temperature: 6500, tint: 0 };
    graph.nodes[2].data.clamp = "unbounded";
    engine.setImage({
      width: 3,
      height: 1,
      data: new Float32Array([1, 1, 1, 0.5, 1, 0, 0, 1, -0.25, 0.5, 4, 1]),
    });
    try {
      return Object.keys(primaries).map((primaries) => {
        for (const key of ["input", "working", "output"])
          graph.colour[key] = { transfer: "linear", primaries };
        engine.render(JSON.parse(JSON.stringify(graph)));
        return Array.from(engine.readPixels()) as number[];
      });
    } finally {
      engine.dispose();
    }
  });
  for (const pixels of results)
    [1, 1, 1, 0.5, 1, 0, 0, 1, -0.25, 0.5, 4, 1].forEach((v, i) =>
      expect(Math.abs(pixels[i] - v)).toBeLessThan(0.002),
    );
});

test("CAT02 adapts known whites and saturated colours without RGB clipping", async ({
  page,
}) => {
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    const graph = createGraph();
    for (const key of ["input", "working", "output"])
      graph.colour[key] = { transfer: "linear", primaries: "rec709" };
    graph.nodes[1].type = "whiteBalance";
    graph.nodes[2].data.clamp = "unbounded";
    engine.setImage({
      width: 3,
      height: 1,
      data: new Float32Array([1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1]),
    });
    try {
      return [
        [3200, 0],
        [10000, 0],
        [6500, 20],
      ].map(([temperature, tint]) => {
        graph.nodes[1].data = { temperature, tint };
        engine.render(graph);
        return Array.from(engine.readPixels()) as number[];
      });
    } finally {
      engine.dispose();
    }
  });
  // Independent Colour 0.4.7 CAT02/Kang2002 vectors; absolute RGBA16F tolerance 0.002.
  const expected = [
    [
      1.6353624, 0.88193501, 0.29817399, 1, 1.216083, -0.02083543, -0.01743469,
      1, 0.01894431, -0.00063633, 0.39496816, 1,
    ],
    [
      0.82846624, 1.01153563, 1.39096746, 1, 0.93267742, 0.00490668, 0.00925551,
      1, -0.00930131, 0.00021231, 1.33453136, 1,
    ],
    [
      0.99971784, 1.00425311, 0.9586979, 1, 1.00175971, 0.00015763, -0.00093167,
      1, 0.00085628, -0.00000808, 0.96491357, 1,
    ],
  ];
  results.forEach((pixels, n) =>
    pixels.forEach((v, i) =>
      expect(Math.abs(v - expected[n][i])).toBeLessThan(0.002),
    ),
  );
});

test("white balance validates its domain, warns on encoded branches and reuses programs at range limits", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph, primaries } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    const graph = createGraph();
    graph.nodes[1].type = "whiteBalance";
    graph.nodes[1].data = { temperature: 6500, tint: 0 };
    graph.nodes[2].data.clamp = "unbounded";
    engine.setImage({
      width: 2,
      height: 1,
      data: new Float32Array([-0.25, 2, 4, 1, 1, 0, 0, 0.5]),
    });
    const original = WebGL2RenderingContext.prototype.compileShader;
    let compiles = 0;
    WebGL2RenderingContext.prototype.compileShader = function (shader) {
      compiles++;
      original.call(this, shader);
    };
    const errors = [],
      deltas = [],
      pixels: number[] = [];
    try {
      for (const primariesName of Object.keys(primaries)) {
        for (const key of ["input", "working", "output"])
          graph.colour[key] = { transfer: "linear", primaries: primariesName };
        engine.render(graph);
        const before = compiles;
        for (const temperature of [1667, 2222, 4000, 6500, 25000])
          for (const tint of [-100, 0, 100]) {
            graph.nodes[1].data = { temperature, tint };
            engine.render(JSON.parse(JSON.stringify(graph)));
            pixels.push(...engine.readPixels());
          }
        deltas.push(compiles - before);
      }
      for (const temperature of [1666, 25001, NaN, Infinity, undefined]) {
        graph.nodes[1].data = { temperature, tint: 0 };
        errors.push(GradingEngine.validate(graph));
      }
      for (const tint of [-101, 101, NaN, Infinity, undefined]) {
        graph.nodes[1].data = { temperature: 6500, tint };
        errors.push(GradingEngine.validate(graph));
      }
      graph.nodes[1].data = { temperature: 6500, tint: 0 };
      graph.colour.working.transfer = "srgb";
      return {
        errors,
        deltas,
        finite: pixels.every(Number.isFinite),
        warnings: GradingEngine.warnings(graph),
      };
    } finally {
      engine.dispose();
      WebGL2RenderingContext.prototype.compileShader = original;
    }
  });
  expect(result.errors.every(Boolean)).toBe(true);
  expect(result.deltas).toEqual([0, 0, 0, 0, 0, 0, 0]);
  expect(result.finite).toBe(true);
  expect(result.warnings.join(" ")).toContain(
    "White Balance expects linear light",
  );
});

test("white balance inspector supports typing, scrubbing, resets and undo/redo", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add White Balance", exact: true })
    .click();
  const temperature = page.getByRole("spinbutton", {
    name: "Temperature (K)",
    exact: true,
  });
  const tint = page.getByRole("spinbutton", { name: "Tint", exact: true });
  await expect(temperature).toHaveValue("6500");
  await temperature.fill("3200");
  await temperature.press("Enter");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(temperature).toHaveValue("6500");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(temperature).toHaveValue("3200");
  await temperature.dblclick();
  await expect(temperature).toHaveValue("6500");
  const scrub = page.getByRole("slider", { name: "Scrub Tint", exact: true });
  await scrub.focus();
  await scrub.press("ArrowRight");
  await expect(tint).toHaveValue("0.01");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(tint).toHaveValue("0");
  await tint.fill("20");
  await tint.press("Enter");
  await page
    .getByRole("button", { name: "Reset White Balance", exact: true })
    .click();
  await expect(tint).toHaveValue("0");
  await temperature.fill("25001");
  await temperature.press("Enter");
  await expect(temperature).toHaveValue("6500");
  await expect(
    page.getByText("White Balance requires temperature", { exact: false }),
  ).toBeVisible();
});

test("white balance follows a CST branch's gamut rather than project working primaries", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const engine = new GradingEngine(document.createElement("canvas"));
    const graph = createGraph();
    const rec709 = { transfer: "linear", primaries: "rec709" };
    const dci = { transfer: "linear", primaries: "dci-p3" };
    graph.colour = { input: rec709, working: rec709, output: rec709 };
    graph.nodes[1].type = "cst";
    graph.nodes[1].data = { from: rec709, to: dci };
    graph.nodes[2].data.clamp = "unbounded";
    graph.nodes.push({
      id: "wb",
      type: "whiteBalance",
      position: { x: 400, y: 0 },
      data: { temperature: 3200, tint: 15 },
    });
    graph.edges[1].target = "wb";
    graph.edges.push({
      id: "wb-out",
      source: "wb",
      target: "output",
      sourceHandle: "rgb",
      targetHandle: "rgb",
    });
    engine.setImage({
      width: 2,
      height: 1,
      data: new Float32Array([1, 0, 0, 1, 0.2, 0.5, 2, 1]),
    });
    try {
      engine.render(graph);
      const throughCst = Array.from(engine.readPixels());
      graph.colour.working = dci;
      graph.nodes = graph.nodes.filter(
        (n: { id: string }) => n.id !== "exposure",
      );
      graph.edges = graph.edges.filter(
        (e: { source: string }) => e.source !== "exposure",
      );
      graph.edges[0].target = "wb";
      engine.render(graph);
      return { throughCst, throughBoundary: Array.from(engine.readPixels()) };
    } finally {
      engine.dispose();
    }
  });
  expect(result.throughCst).toEqual(result.throughBoundary);
});
