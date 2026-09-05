import { test, expect, type Page } from "@playwright/test";
import { applyCube, parseCube } from "./cube-tools";

// Asymmetric off-grid probes plus the domain endpoints and the eight corners.
const probes: [number, number, number][] = [
  [0, 0, 0],
  [1, 1, 1],
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 1, 0],
  [1, 0, 1],
  [0, 1, 1],
  [0.137, 0.611, 0.283],
  [0.92, 0.05, 0.47],
  [0.501, 0.499, 0.503],
  [0.031, 0.977, 0.014],
  [0.75, 0.25, 0.999],
];

/** A moderately non-linear look: sRGB in/out with exposure, CDL and contrast. */
const lookGraph = `(() => {
  const graph = createGraph();
  graph.nodes[1].data.stops = 0.5;
  graph.nodes.push(
    { id: "cdl", type: "cdl", position: { x: 0, y: 0 }, data: { slope: [1.1, 0.95, 0.9], offset: [0.02, 0, -0.01], power: [0.9, 1, 1.2], saturation: 1.2 } },
    { id: "contrast", type: "contrast", position: { x: 0, y: 0 }, data: { contrast: 1.15, pivot: 0.18 } },
  );
  graph.edges = [
    { id: "a", source: "source", target: "exposure", sourceHandle: "rgb", targetHandle: "rgb" },
    { id: "b", source: "exposure", target: "cdl", sourceHandle: "rgb", targetHandle: "rgb" },
    { id: "c", source: "cdl", target: "contrast", sourceHandle: "rgb", targetHandle: "rgb" },
    { id: "d", source: "contrast", target: "output", sourceHandle: "rgb", targetHandle: "rgb" },
  ];
  return graph;
})()`;

/** Evaluate probe colours through the engine's float image path. */
async function evaluate(
  page: Page,
  graphSource: string,
  colours: [number, number, number][],
) {
  return page.evaluate(
    async ({ graphSource, colours }) => {
      const { GradingEngine, createGraph, createStarterGraph } = (await import(
        /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
      )) as typeof import("../src/engine/GradingEngine");
      // The graph source may call either factory.
      const graph = eval(graphSource) as ReturnType<
        typeof createGraph | typeof createStarterGraph
      >;
      const engine = new GradingEngine(document.createElement("canvas"));
      try {
        engine.setImage({
          width: colours.length,
          height: 1,
          data: new Float32Array(colours.flatMap((c) => [...c, 1])),
        });
        engine.render(graph);
        const pixels = engine.readPixels();
        return colours.map((_, i) => [
          pixels[i * 4],
          pixels[i * 4 + 1],
          pixels[i * 4 + 2],
        ]);
      } finally {
        engine.dispose();
      }
    },
    { graphSource, colours },
  );
}

test("lattice samples come from the preview program, match image evaluation, and tile identically", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async (graphSource) => {
    const { GradingEngine, createGraph } = (await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    )) as typeof import("../src/engine/GradingEngine");
    const graph = eval(graphSource) as ReturnType<typeof createGraph>;
    const engine = new GradingEngine(document.createElement("canvas"));
    const original = WebGL2RenderingContext.prototype.compileShader;
    let compiles = 0;
    WebGL2RenderingContext.prototype.compileShader = function (shader) {
      compiles++;
      original.call(this, shader);
    };
    try {
      engine.setImage({
        width: 1,
        height: 1,
        data: new Float32Array([0.3, 0.6, 0.9, 1]),
      });
      // The support probe compiles its own identity program once.
      const support = engine.latticeSupport();
      engine.render(graph);
      const compiled = compiles;
      const lattice = Array.from(engine.renderLattice(graph, 17));
      const tiled = Array.from(engine.renderLattice(graph, 17, 5));
      const latticeCompiles = compiles - compiled;
      // The identity ordering graph below is a different topology and may compile.
      const identity = createGraph();
      identity.colour.input = identity.colour.output = {
        transfer: "linear",
        primaries: "rec709",
      };
      const ordering = Array.from(engine.renderLattice(identity, 17));
      // The preview target is untouched by lattice rendering.
      engine.render(graph);
      const preview = Array.from(engine.readPixels());
      engine.renderLattice(graph, 33);
      const afterLattice = Array.from(engine.readPixels());
      let invalid = "";
      try {
        engine.renderLattice(graph, 16);
      } catch (error) {
        invalid = (error as Error).message;
      }
      return {
        support,
        latticeCompiles,
        lattice,
        tiled,
        ordering,
        preview,
        afterLattice,
        invalid,
      };
    } finally {
      WebGL2RenderingContext.prototype.compileShader = original;
      engine.dispose();
    }
  }, lookGraph);
  expect(result.support).toEqual({ format: "RGBA32F" });
  expect(result.latticeCompiles).toBe(0);
  expect(result.lattice).toEqual(result.tiled);
  expect(result.lattice.length).toBe(17 ** 3 * 4);
  expect(result.afterLattice).toEqual(result.preview);
  expect(result.invalid).toContain("17³");
  // Red is fastest, then green, then blue; alpha is one.
  const index = (r: number, g: number, b: number) =>
    (r + g * 17 + b * 17 * 17) * 4;
  expect(result.ordering.slice(index(3, 0, 0), index(3, 0, 0) + 4)).toEqual([
    3 / 16,
    0,
    0,
    1,
  ]);
  expect(result.ordering.slice(index(0, 5, 0), index(0, 5, 0) + 4)).toEqual([
    0,
    5 / 16,
    0,
    1,
  ]);
  expect(result.ordering.slice(index(0, 0, 7), index(0, 0, 7) + 4)).toEqual([
    0,
    0,
    7 / 16,
    1,
  ]);
  expect(result.ordering.slice(index(16, 16, 16))).toEqual([1, 1, 1, 1]);
  // Lattice points equal the same graph evaluated on image pixels.
  const points: [number, number, number][] = [
    [0, 0, 0],
    [16, 16, 16],
    [3, 9, 14],
    [16, 0, 2],
  ];
  const evaluated = await evaluate(
    page,
    lookGraph,
    points.map((p) => p.map((v) => v / 16) as [number, number, number]),
  );
  points.forEach((p, i) =>
    [0, 1, 2].forEach((channel) =>
      expect(result.lattice[index(...p) + channel]).toBeCloseTo(
        evaluated[i][channel],
        5,
      ),
    ),
  );
});

test("serialized LUTs reproduce the graph at every offered size within stated tolerances", async ({
  page,
}) => {
  await page.goto("/");
  const expected = await evaluate(page, lookGraph, probes);
  // Trilinear interpolation error of the look above, measured per lattice size.
  const tolerances = { 17: 0.015, 33: 0.005, 65: 0.002 };
  for (const [size, tolerance] of Object.entries(tolerances)) {
    const text = await page.evaluate(
      async ({ graphSource, size }) => {
        const { GradingEngine, serializeCube, createGraph } = (await import(
          /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
        )) as typeof import("../src/engine/GradingEngine");
        const graph = eval(graphSource) as ReturnType<typeof createGraph>;
        const engine = new GradingEngine(document.createElement("canvas"));
        try {
          return serializeCube({
            title: `Look ${size}`,
            size,
            samples: engine.renderLattice(graph, size),
          });
        } finally {
          engine.dispose();
        }
      },
      { graphSource: lookGraph, size: Number(size) },
    );
    const cube = parseCube(text);
    expect(cube.size).toBe(Number(size));
    expect(cube.title).toBe(`Look ${size}`);
    let worst = 0;
    probes.forEach((probe, i) => {
      const applied = applyCube(cube, probe);
      applied.forEach((value, channel) => {
        worst = Math.max(worst, Math.abs(value - expected[i][channel]));
      });
    });
    expect(worst, `${size}³ worst probe error`).toBeLessThanOrEqual(tolerance);
    // Endpoints are exact lattice samples.
    [0, 1].forEach((v, i) =>
      applyCube(cube, [v, v, v]).forEach((value, channel) =>
        expect(value).toBeCloseTo(expected[i][channel], 5),
      ),
    );
  }
});

test("clamped exports stay within 0–1 while unbounded exports keep out-of-range values", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph, serializeCube } = (await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    )) as typeof import("../src/engine/GradingEngine");
    const graph = createGraph();
    graph.colour.input = graph.colour.output = {
      transfer: "linear",
      primaries: "rec709",
    };
    graph.nodes[1].data.stops = 1;
    graph.nodes.push({
      id: "saturation",
      type: "saturation",
      position: { x: 0, y: 0 },
      data: { saturation: 2, vibrance: 0 },
    });
    graph.edges = [
      {
        id: "a",
        source: "source",
        target: "exposure",
        sourceHandle: "rgb",
        targetHandle: "rgb",
      },
      {
        id: "b",
        source: "exposure",
        target: "saturation",
        sourceHandle: "rgb",
        targetHandle: "rgb",
      },
      {
        id: "c",
        source: "saturation",
        target: "output",
        sourceHandle: "rgb",
        targetHandle: "rgb",
      },
    ];
    const engine = new GradingEngine(document.createElement("canvas"));
    try {
      const clamped = serializeCube({
        title: "Clamped",
        size: 17,
        samples: engine.renderLattice(graph, 17),
      });
      graph.nodes.find((n) => n.type === "output")!.data.clamp = "unbounded";
      const unbounded = serializeCube({
        title: "Unbounded",
        size: 17,
        samples: engine.renderLattice(graph, 17),
      });
      return { clamped, unbounded };
    } finally {
      engine.dispose();
    }
  });
  const clamped = parseCube(result.clamped);
  const unbounded = parseCube(result.unbounded);
  expect(Math.min(...clamped.table)).toBe(0);
  expect(Math.max(...clamped.table)).toBe(1);
  // Linear 2x exposure then saturation 2 about Rec.709 luma: red (2,0,0) has
  // luma 0.4252, so channels reach 3.5748 and -0.4252; grey doubles to 2.
  const near = (actual: number[], expected: number[]) =>
    actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 4));
  near(applyCube(unbounded, [1, 0, 0]), [3.5748, -0.4252, -0.4252]);
  near(applyCube(unbounded, [1, 1, 1]), [2, 2, 2]);
  near(applyCube(unbounded, [0.5, 0.25, 0.75]), [1.3215, 0.3215, 2.3215]);
  near(applyCube(clamped, [1, 0, 0]), [1, 0, 0]);
  near(applyCube(clamped, [1, 1, 1]), [1, 1, 1]);
  near(applyCube(clamped, [0.5, 0.25, 0.75]), [1, 0.3215, 1]);
});

test("half-float is accepted only after its own precision check, otherwise export is refused with a reason", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = (await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    )) as typeof import("../src/engine/GradingEngine");
    // Instrument the WebGL boundary so framebuffers over chosen float formats fail.
    const proto = WebGL2RenderingContext.prototype;
    const originals = {
      bindTexture: proto.bindTexture,
      texImage2D: proto.texImage2D,
      framebufferTexture2D: proto.framebufferTexture2D,
      checkFramebufferStatus: proto.checkFramebufferStatus,
    };
    const formats = new WeakMap<WebGLTexture, number>();
    let bound: WebGLTexture | null = null;
    let attached: WebGLTexture | null = null;
    let failing: number[] = [];
    proto.bindTexture = function (target, texture) {
      bound = texture;
      originals.bindTexture.call(this, target, texture);
    };
    proto.texImage2D = function (
      this: WebGL2RenderingContext,
      ...args: unknown[]
    ) {
      if (bound && args.length >= 9) formats.set(bound, args[2] as number);
      (originals.texImage2D as (...a: unknown[]) => void).apply(this, args);
    } as typeof proto.texImage2D;
    proto.framebufferTexture2D = function (
      target,
      attachment,
      textarget,
      texture,
      level,
    ) {
      attached = texture;
      originals.framebufferTexture2D.call(
        this,
        target,
        attachment,
        textarget,
        texture,
        level,
      );
    };
    proto.checkFramebufferStatus = function (target) {
      if (attached && failing.includes(formats.get(attached) ?? -1))
        return this.FRAMEBUFFER_UNSUPPORTED;
      return originals.checkFramebufferStatus.call(this, target);
    };
    const graph = createGraph();
    graph.colour.input = graph.colour.output = {
      transfer: "linear",
      primaries: "rec709",
    };
    const probe = () => {
      const engine = new GradingEngine(document.createElement("canvas"));
      try {
        const support = engine.latticeSupport();
        const samples = engine.renderLattice(graph, 17);
        return { ...support, sample: samples[(5 + 3 * 17 + 2 * 289) * 4 + 1] };
      } catch (error) {
        return { error: (error as Error).message };
      } finally {
        engine.dispose();
      }
    };
    try {
      const full = probe();
      failing = [WebGL2RenderingContext.RGBA32F];
      const half = probe();
      failing = [
        WebGL2RenderingContext.RGBA32F,
        WebGL2RenderingContext.RGBA16F,
      ];
      const none = probe();
      return { full, half, none };
    } finally {
      Object.assign(proto, originals);
    }
  });
  expect(result.full).toEqual({ format: "RGBA32F", sample: 3 / 16 });
  expect(result.half).toMatchObject({ format: "RGBA16F" });
  const halfSample = "sample" in result.half ? result.half.sample : Number.NaN;
  expect(Math.abs(halfSample - 3 / 16)).toBeLessThan(1e-3);
  expect(result.none.error).toContain("LUT export is unavailable");
  expect(result.none.error).toContain("RGBA32F");
  expect(result.none.error).toContain("RGBA16F");
});

test("the inspector exports a titled cube that shares the Output range and warns about 65³", async ({
  page,
}) => {
  await page.goto("/");
  const exportButton = page.getByRole("button", { name: "Export .cube" });
  await expect(exportButton).toBeEnabled();
  await expect(
    page.getByText("Maps sRGB / Rec.709 · D65 codes 0–1"),
  ).toBeVisible();
  await page.getByLabel("LUT size").selectOption("65");
  await expect(page.getByText("65³ writes about 7 MB")).toBeVisible();
  await page.getByLabel("LUT size").selectOption("17");
  await expect(page.getByText("65³ writes about")).toHaveCount(0);
  await page.getByLabel("LUT output range").selectOption("unbounded");
  expect(
    await page.evaluate(async () => {
      const { useGraph } = await import(
        /* @vite-ignore */ "/src/graphStore.ts" as string
      );
      const nodes = useGraph.getState().graph.nodes as {
        type: string;
        data: { clamp?: string };
      }[];
      return nodes.find((n) => n.type === "output")!.data.clamp;
    }),
  ).toBe("unbounded");
  await expect(
    page.getByText("out-of-range values are preserved"),
  ).toBeVisible();
  await page.getByLabel("LUT title").fill('  Warm "Look" 1 ');
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportButton.click(),
  ]);
  expect(download.suggestedFilename()).toBe("Warm-Look-1.cube");
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream())
    chunks.push(chunk as Buffer);
  const cube = parseCube(Buffer.concat(chunks).toString("utf8"));
  expect(cube.title).toBe("Warm Look 1");
  expect(cube.size).toBe(17);
  expect(cube.table.length).toBe(17 ** 3 * 3);
  await expect(page.getByText("Saved Warm-Look-1.cube")).toBeVisible();
  // The downloaded rows reproduce the unbounded starter grade at lattice points.
  const lattice: [number, number, number][] = [
    [0, 0, 0],
    [1, 1, 1],
    [0.5, 0.25, 0.75],
    [1, 0.125, 0],
  ];
  const expected = await evaluate(
    page,
    `(() => { const g = createStarterGraph(); g.nodes.find((n) => n.type === "output").data.clamp = "unbounded"; return g; })()`,
    lattice,
  );
  lattice.forEach((probe, i) =>
    applyCube(cube, probe).forEach((value, channel) =>
      expect(value).toBeCloseTo(expected[i][channel], 5),
    ),
  );
  // Removing the Output node disables export with a reason instead of failing.
  await page.evaluate(async () => {
    const { useGraph } = await import(
      /* @vite-ignore */ "/src/graphStore.ts" as string
    );
    useGraph.getState().remove(["output"], []);
  });
  await expect(exportButton).toBeDisabled();
  await expect(
    page.getByText("Connect a valid graph to export."),
  ).toBeVisible();
});

test("export is disabled with a clear reason when float lattices are unsupported", async ({
  page,
}) => {
  // Fail framebuffer completeness for the 4×16 probe lattice targets only.
  await page.addInitScript(() => {
    const proto = WebGL2RenderingContext.prototype;
    const texImage2D = proto.texImage2D;
    const framebufferTexture2D = proto.framebufferTexture2D;
    const checkFramebufferStatus = proto.checkFramebufferStatus;
    const bindTexture = proto.bindTexture;
    const probes = new WeakSet<WebGLTexture>();
    let bound: WebGLTexture | null = null;
    let attached: WebGLTexture | null = null;
    proto.bindTexture = function (target, texture) {
      bound = texture;
      bindTexture.call(this, target, texture);
    };
    proto.texImage2D = function (
      this: WebGL2RenderingContext,
      ...args: unknown[]
    ) {
      if (bound && args.length >= 9 && args[3] === 4 && args[4] === 16)
        probes.add(bound);
      (texImage2D as (...a: unknown[]) => void).apply(this, args);
    } as typeof proto.texImage2D;
    proto.framebufferTexture2D = function (...args) {
      attached = args[3];
      framebufferTexture2D.apply(this, args);
    };
    proto.checkFramebufferStatus = function (target) {
      if (attached && probes.has(attached)) return this.FRAMEBUFFER_UNSUPPORTED;
      return checkFramebufferStatus.call(this, target);
    };
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Export .cube" }),
  ).toBeDisabled();
  await expect(page.getByText("LUT export is unavailable")).toBeVisible();
  await expect(
    page.getByText("RGBA16F: This device could not allocate"),
  ).toBeVisible();
});
