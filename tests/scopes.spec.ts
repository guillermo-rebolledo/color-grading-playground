import { test, expect } from "@playwright/test";

test("scopes measure output channels and horizontal positions, excluding transparent pixels", async ({
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
        1, 0, 0.5, 1, 0, 1, 0.5, 1, 1, 0, 0.5, 1, 1, 1, 1, 0,
      ]),
    });
    const report = await engine.measureScopes(graph);
    engine.dispose();
    return {
      ...report,
      histogram: report.histogram.map((v: Uint32Array) => Array.from(v)),
      parade: report.parade.map((v: Uint32Array) => Array.from(v)),
    };
  });
  expect(result.sampleCount).toBe(3);
  expect(result.width).toBe(2);
  expect(result.height).toBe(2);
  expect(result.histogram[0][255]).toBe(2);
  expect(result.histogram[1][0]).toBe(2);
  expect(result.histogram[2][128]).toBe(3);
  expect(result.parade[0][255 * 2]).toBe(2);
  expect(result.parade[1][255 * 2 + 1]).toBe(1);
  expect(result.parade[2][128 * 2]).toBe(2);
});

test("bounds scope work, throttles readback, and cancels results across edits and source changes", async ({
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
      width: 1024,
      height: 256,
      data: new Float32Array(1024 * 256 * 4).fill(1),
    });
    const starts: number[] = [];
    let outstanding = 0,
      maximum = 0;
    // Instrument only the explicit worker performance contract; keep the real worker.
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      message: unknown,
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      starts.push(performance.now());
      maximum = Math.max(maximum, ++outstanding);
      this.addEventListener("message", () => outstanding--, { once: true });
      if (Array.isArray(options))
        return post.call(this, message, { transfer: options });
      return post.call(this, message, options);
    };
    try {
      const first = engine.measureScopes(graph);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const pending = Array.from({ length: 25 }, (_, i) => {
        graph.nodes[1].data.stops = -i;
        return engine.measureScopes(graph);
      });
      graph.nodes[1].data.stops = -1;
      const latest = await engine.measureScopes(graph);
      const obsolete = await Promise.all([first, ...pending]);
      const replaced = engine.measureScopes(graph);
      engine.setImage({
        width: 1,
        height: 1,
        data: new Float32Array([0, 0, 0, 1]),
      });
      const source = await engine.measureScopes(graph);
      const disposed = engine.measureScopes(graph);
      engine.dispose();
      return {
        maximum,
        intervals: starts.slice(1).map((t, i) => t - starts[i]),
        obsolete: obsolete.slice(1).every((v) => v === null),
        width: latest.width,
        height: latest.height,
        count: latest.histogram[0][128],
        replaced: await replaced,
        disposed: await disposed,
        black: source.histogram[0][0],
      };
    } finally {
      Worker.prototype.postMessage = post;
      engine.dispose();
    }
  });
  expect(result.maximum).toBe(1);
  expect(result.intervals.length).toBeGreaterThanOrEqual(1);
  expect(result.intervals.every((ms: number) => ms >= 60)).toBe(true);
  expect(result.obsolete).toBe(true);
  expect(result.width).toBe(512);
  expect(result.height).toBe(128);
  expect(result.count).toBe(65536);
  expect(result.replaced).toBeNull();
  expect(result.disposed).toBeNull();
  expect(result.black).toBe(1);
});

test("scope range counters preserve unbounded output and diagnostics do not alter viewer pixels or LUTs", async ({
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
    graph.nodes.find((n: { type: string }) => n.type === "output").data.clamp =
      "unbounded";
    engine.setImage({
      width: 1,
      height: 1,
      data: new Float32Array([-0.5, 2, 0.25, 1]),
    });
    engine.renderViewer(graph, {
      before: true,
      solo: "source",
      outOfRange: true,
    });
    const before = Array.from(engine.readPixels());
    const lut = Array.from(engine.renderLattice(graph, 17));
    const report = await engine.measureScopes(graph);
    const after = Array.from(engine.readPixels());
    const unchanged =
      JSON.stringify(lut) ===
      JSON.stringify(Array.from(engine.renderLattice(graph, 17)));
    engine.dispose();
    return {
      below: report.below,
      above: report.above,
      before,
      after,
      unchanged,
    };
  });
  expect(result.below).toEqual([1, 0, 0]);
  expect(result.above).toEqual([0, 1, 0]);
  expect(result.after).toEqual(result.before);
  expect(result.unchanged).toBe(true);
});

test("shows current output scopes while editing and hides measurements when the graph becomes invalid", async ({
  page,
}) => {
  const { openNeutralGraph } = await import("./fixtures");
  await openNeutralGraph(page);
  await expect(page.getByLabel("Scope status")).toHaveText(
    "Load an image to inspect scopes.",
  );
  await page.getByLabel("Load precision chart").selectOption("slog3");
  await expect(page.getByLabel("Scope status")).toContainText(
    "measured pixels",
  );
  await expect(page.getByRole("img", { name: "RGB histogram" })).toBeVisible();
  await expect(page.getByRole("img", { name: "RGB parade" })).toBeVisible();
  const input = page.getByLabel("Exposure in stops", { exact: true });
  for (const value of ["1", "2", "-1", "0.5"]) await input.fill(value);
  await expect(input).toHaveValue("0.5");
  await expect(page.getByLabel("Scope status")).toContainText(
    "measured pixels",
  );
  await page.evaluate(async () => {
    const { useGraph } = await import(
      /* @vite-ignore */ "/src/graphStore.ts" as string
    );
    const graph = useGraph.getState().graph;
    useGraph.setState({ graph: { ...graph, edges: [] } });
  });
  await expect(page.getByLabel("Scope status")).toContainText("Scopes paused");
  await expect(page.getByRole("img", { name: "RGB histogram" })).toHaveCount(0);
});
