import { test, expect } from "@playwright/test";

test("Blend endpoints and disconnected mask use two RGB branches", async ({
  page,
}) => {
  await page.goto("/");
  const values = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const graph = createGraph();
    for (const key of ["input", "working", "output"])
      graph.colour[key] = { transfer: "linear", primaries: "rec709" };
    graph.nodes.push({
      id: "blend",
      type: "blend",
      position: { x: 0, y: 0 },
      data: { amount: 0 },
    });
    graph.nodes[1].data.stops = 1;
    graph.edges = [
      graph.edges[0],
      {
        id: "a",
        source: "source",
        target: "blend",
        sourceHandle: "rgb",
        targetHandle: "a",
      },
      {
        id: "b",
        source: "exposure",
        target: "blend",
        sourceHandle: "rgb",
        targetHandle: "b",
      },
      {
        id: "out",
        source: "blend",
        target: "output",
        sourceHandle: "rgb",
        targetHandle: "rgb",
      },
    ];
    const engine = new GradingEngine(document.createElement("canvas"));
    engine.setImage({
      width: 1,
      height: 1,
      data: new Float32Array([0.2, 0.3, 0.4, 0.5]),
    });
    try {
      return [0, 1, 0.5].map((amount) => {
        graph.nodes[3].data.amount = amount;
        engine.render(JSON.parse(JSON.stringify(graph)));
        return Array.from(engine.readPixels());
      });
    } finally {
      engine.dispose();
    }
  });
  [
    [0.2, 0.3, 0.4, 0.5],
    [0.4, 0.6, 0.8, 0.5],
    [0.3, 0.45, 0.6, 0.5],
  ].forEach((pixel, i) =>
    pixel.forEach((v, j) => expect(values[i][j]).toBeCloseTo(v, 5)),
  );
});

test("qualifier mask solo wraps hue, treats gray explicitly and handles soft/hard value bands", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const graph = createGraph();
    for (const key of ["input", "working", "output"])
      graph.colour[key] = { transfer: "linear", primaries: "rec709" };
    const qualifier = {
      id: "key",
      type: "qualifier",
      position: { x: 0, y: 0 },
      data: { hue: [350, 10, 0], sat: [0, 1, 0], value: [0, 1, 0] },
    };
    graph.nodes.push(qualifier);
    graph.edges.push({
      id: "key-in",
      source: "source",
      target: "key",
      sourceHandle: "rgb",
      targetHandle: "rgb",
    });
    const engine = new GradingEngine(document.createElement("canvas"));
    const render = (pixels: number[]) => {
      engine.setImage({
        width: pixels.length / 4,
        height: 1,
        data: new Float32Array(pixels),
      });
      engine.render(graph, "key");
      return Array.from(engine.readPixels()).filter((_, i) => i % 4 === 0);
    };
    try {
      const hue = render([
        1, 0, 0, 1, 1, 0, 0.1, 1, 1, 0.1, 0, 1, 0, 1, 0, 1, 0.5, 0.5, 0.5, 1,
      ]);
      qualifier.data.hue = [350, 10, 20];
      const softWrap = render([1, 0, 1 / 3, 1, 1, 1 / 3, 0, 1]);
      qualifier.data.hue = [0, 360, 0];
      qualifier.data.value = [0.4, 0.6, 0.2];
      const soft = render([
        0.3, 0.3, 0.3, 1, 0.5, 0.5, 0.5, 1, 0.7, 0.7, 0.7, 1, -1, -1, -1, 1, 2,
        2, 2, 1,
      ]);
      qualifier.data.value = [0.4, 0.6, 0];
      const hard = render([
        0.3, 0.3, 0.3, 1, 0.4, 0.4, 0.4, 1, 0.6, 0.6, 0.6, 1, 0.7, 0.7, 0.7, 1,
      ]);
      return { hue, softWrap, soft, hard };
    } finally {
      engine.dispose();
    }
  });
  expect(result.hue).toEqual([1, 1, 1, 0, 0]);
  result.softWrap.forEach((v) => expect(v).toBeCloseTo(0.5, 5));
  result.soft.forEach((v, i) =>
    expect(v).toBeCloseTo([0.5, 1, 0.5, 0, 0][i], 5),
  );
  expect(result.hard).toEqual([0, 1, 1, 0]);
});

test("starter grade survives serialization, selects cool shadows and warm highlights, and rejects invalid typed edges", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createStarterGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const graph = JSON.parse(JSON.stringify(createStarterGraph()));
    for (const key of ["input", "working", "output"])
      graph.colour[key] = { transfer: "linear", primaries: "rec709" };
    const engine = new GradingEngine(document.createElement("canvas"));
    engine.setImage({
      width: 2,
      height: 1,
      data: new Float32Array([0.1, 0.1, 0.1, 1, 0.8, 0.8, 0.8, 1]),
    });
    try {
      engine.render(graph);
      const pixels = Array.from(engine.readPixels()) as number[];
      const invalid = structuredClone(graph);
      invalid.edges.find((e: any) => e.targetHandle === "mask").sourceHandle =
        "rgb";
      const wrongType = GradingEngine.validate(invalid);
      const missing = structuredClone(graph);
      missing.edges = missing.edges.filter((e: any) => e.targetHandle !== "b");
      const missingInput = GradingEngine.validate(missing);
      const cst = {
        id: "cst",
        type: "cst",
        position: { x: 0, y: 0 },
        data: {
          from: graph.colour.working,
          to: { transfer: "srgb", primaries: "rec709" },
        },
      };
      graph.nodes.push(cst);
      const b = graph.edges.find((e: any) => e.targetHandle === "b");
      graph.edges.push({
        id: "cst-in",
        source: b.source,
        target: "cst",
        sourceHandle: "rgb",
        targetHandle: "rgb",
      });
      b.source = "cst";
      return {
        pixels,
        wrongType,
        missingInput,
        warnings: GradingEngine.warnings(graph),
      };
    } finally {
      engine.dispose();
    }
  });
  expect(result.pixels[2]).toBeGreaterThan(result.pixels[0]);
  expect(result.pixels[4]).toBeGreaterThan(result.pixels[6]);
  expect(result.wrongType).toContain("mask");
  expect(result.missingInput).toContain("RGB input");
  expect(result.warnings.join(" ")).toContain("incompatible branch encodings");
});

test("soft memberships multiply, masked Blend uses that weight, and numeric edits reuse the program", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createStarterGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const graph = createStarterGraph();
    for (const key of ["input", "working", "output"])
      graph.colour[key] = { transfer: "linear", primaries: "rec709" };
    graph.nodes.find((n: any) => n.id === "cool").data.slope = [0, 0, 0];
    graph.nodes.find((n: any) => n.id === "warm").data = {
      slope: [0, 0, 0],
      offset: [1, 1, 1],
      power: [1, 1, 1],
      saturation: 1,
    };
    const key = graph.nodes.find((n: any) => n.type === "qualifier");
    // HSV = (30 degrees, .5, .3): halfway through each of three soft ramps.
    key.data = { hue: [40, 60, 20], sat: [0.6, 1, 0.2], value: [0.4, 1, 0.2] };
    const engine = new GradingEngine(document.createElement("canvas"));
    engine.setImage({
      width: 1,
      height: 1,
      data: new Float32Array([0.3, 0.225, 0.15, 0.25]),
    });
    engine.render(graph);
    const before = Array.from(engine.readPixels()) as number[];
    const original = WebGL2RenderingContext.prototype.compileShader;
    let compiles = 0;
    WebGL2RenderingContext.prototype.compileShader = function (shader) {
      compiles++;
      original.call(this, shader);
    };
    try {
      graph.nodes.find((n: any) => n.type === "blend").data.amount = 0.5;
      engine.render(graph);
      const after = Array.from(engine.readPixels()) as number[];
      key.data.hue = [350, 10, 20];
      engine.render(graph);
      return { before, after, compiles };
    } finally {
      WebGL2RenderingContext.prototype.compileShader = original;
      engine.dispose();
    }
  });
  [0.125, 0.125, 0.125, 0.25].forEach((v, i) =>
    expect(result.before[i]).toBeCloseTo(v, 5),
  );
  [0.0625, 0.0625, 0.0625, 0.25].forEach((v, i) =>
    expect(result.after[i]).toBeCloseTo(v, 5),
  );
  expect(result.compiles).toBe(0);
});

test("starter mask controls and graph edits are reversible and solo is clearly indicated", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await expect(page.locator(".mask-edge")).toHaveCount(1);
  await page.locator('.react-flow__node[data-id="qualifier"]').click();
  const min = page.getByRole("spinbutton", { name: "Value min", exact: true });
  await min.fill("0.6");
  await min.press("Enter");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(min).toHaveValue("0.45");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(min).toHaveValue("0.6");
  await page.getByRole("button", { name: "Solo mask", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Exit mask solo", exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Exit mask solo", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Delete selection", exact: true })
    .click();
  await expect(page.locator(".mask-edge")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".mask-edge")).toHaveCount(1);
  await page.locator('.react-flow__node[data-id="blend"]').click();
  const amount = page.getByRole("spinbutton", {
    name: "Blend amount",
    exact: true,
  });
  await amount.fill("0.25");
  await amount.press("Enter");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(amount).toHaveValue("1");
  await page
    .getByRole("button", { name: "Add HSV Qualifier", exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "Hue max", exact: true }),
  ).toHaveValue("360");
});
