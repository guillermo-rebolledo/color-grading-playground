import { openLutExport } from "./fixtures";
import { test, expect, type Download, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import {
  applyCube,
  applyTetrahedral,
  parseCube,
  type Cube,
} from "./cube-tools";

// MEM-220 release verification. These tests are the integrated acceptance pass:
// they exercise the whole workflow in one session and write the evidence that
// scripts/verify-lut-hosts.mjs and docs/release-verification.md refer to.
// Per-feature behaviour keeps its own focused spec; nothing here replaces it.
const evidence = join(process.cwd(), "release-evidence");
mkdirSync(evidence, { recursive: true });

function record(name: string, value: unknown) {
  writeFileSync(join(evidence, name), `${JSON.stringify(value, null, 2)}\n`);
}

async function save(download: Download, name: string) {
  const path = join(evidence, name);
  await download.saveAs(path);
  return path;
}

/** The eleven node types wired into one reachable graph, plus its parameters. */
async function buildElevenNodeGraph(page: Page) {
  for (const type of [
    "Add CST",
    "Add White Balance",
    "Add Contrast",
    "Add Curves",
    "Add Saturation",
  ])
    await page.getByRole("button", { name: type, exact: true }).click();
  return page.evaluate(async () => {
    const { useGraph } = await import(
      /* @vite-ignore */ "/src/graphStore.ts" as string
    );
    const state = useGraph.getState();
    const graph = structuredClone(state.graph);
    const idOf = (type: string) =>
      graph.nodes.find((node: { type: string }) => node.type === type)!.id;
    const chain = [
      "exposure",
      idOf("cst"),
      idOf("whiteBalance"),
      idOf("contrast"),
      idOf("curves"),
      idOf("saturation"),
    ];
    const edge = (source: string, target: string, targetHandle = "rgb") => ({
      id: `${source}-${target}-${targetHandle}`,
      source,
      target,
      sourceHandle: "rgb",
      targetHandle,
    });
    // Insert the chain between Exposure and the starter's branching keyed blend.
    graph.edges = graph.edges.filter(
      (e: { source: string }) => e.source !== "exposure",
    );
    for (let i = 1; i < chain.length; i++)
      graph.edges.push(edge(chain[i - 1], chain[i]));
    for (const branch of ["cool", "warm", "qualifier"])
      graph.edges.push(edge(chain[chain.length - 1], branch));
    // Added nodes stack at one default position; lay the chain out so the
    // canvas stays clickable.
    chain.slice(1).forEach((id, i) => {
      graph.nodes.find((node: { id: string }) => node.id === id)!.position = {
        x: i * 260,
        y: 288,
      };
    });
    // Curve control points are exercised by tests/curves.spec.ts; this pass only
    // needs a non-identity master curve inside the integrated graph.
    graph.nodes.find(
      (node: { id: string }) => node.id === chain[4],
    )!.data.curves.master = [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.18 },
      { x: 0.75, y: 0.82 },
      { x: 1, y: 1 },
    ];
    useGraph.getState().edit(graph);
    return {
      cst: chain[1],
      whiteBalance: chain[2],
      contrast: chain[3],
      curves: chain[4],
      saturation: chain[5],
    };
  });
}

/**
 * Pixels that differ between two element screenshots, ignoring a one-pixel
 * border: a canvas laid out on a fractional offset is captured one row taller
 * than it is, and that edge row blends with the page behind it. Comparing the
 * decoded interior also avoids expect's element-by-element diff of a large
 * buffer, which does not finish.
 */
function differingPixels(a: Buffer, b: Buffer, margin = 1) {
  const [left, right] = [a, b].map((bytes) => PNG.sync.read(bytes));
  if (left.width !== right.width || left.height !== right.height)
    throw new Error(
      `Screenshot sizes differ: ${left.width}×${left.height} and ${right.width}×${right.height}.`,
    );
  let differing = 0;
  for (let y = margin; y < left.height - margin; y++)
    for (let x = margin; x < left.width - margin; x++) {
      const i = (y * left.width + x) * 4;
      for (let c = 0; c < 4; c++)
        if (left.data[i + c] !== right.data[i + c]) {
          differing++;
          break;
        }
    }
  return differing;
}

/** Evaluate colours through the store's current graph, on the engine's float path. */
const evaluateCurrentGraph = (
  page: Page,
  colours: [number, number, number][],
) =>
  page.evaluate(async (probes) => {
    const { useGraph } = await import(
      /* @vite-ignore */ "/src/graphStore.ts" as string
    );
    const { GradingEngine } = (await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    )) as typeof import("../src/engine/GradingEngine");
    const engine = new GradingEngine(document.createElement("canvas"));
    try {
      engine.setImage({
        width: probes.length,
        height: 1,
        data: new Float32Array(probes.flatMap((c) => [...c, 1])),
      });
      engine.render(useGraph.getState().graph);
      const pixels = engine.readPixels();
      return probes.map((_, i) => [
        pixels[i * 4],
        pixels[i * 4 + 1],
        pixels[i * 4 + 2],
      ]);
    } finally {
      engine.dispose();
    }
  }, colours);

const graphOf = (page: Page) =>
  page.evaluate(async () => {
    const { useGraph } = await import(
      /* @vite-ignore */ "/src/graphStore.ts" as string
    );
    return useGraph.getState().graph;
  });

test("integrated acceptance: bundled sample, eleven node types, editing, viewer, scopes, persistence, sharing and a measured export", async ({
  page,
}) => {
  // One session covers the whole workflow on a full-size sample, including a
  // 33³ fidelity measurement over the full capped preview.
  test.setTimeout(180_000);
  await page.goto("/");

  // A genuine high-bit-depth log sample, with its verified tags applied.
  await page.getByRole("button", { name: "Browse samples" }).click();
  await page
    .getByRole("region", { name: "Bundled log samples" })
    .getByRole("button", { name: "Oil-lamp still life", exact: true })
    .click();
  await expect(page.getByLabel("Sample provenance")).toContainText(
    "DaVinci Intermediate / DaVinci Wide Gamut · D65 · 16-bit · full range",
  );
  await expect(page.getByLabel("Input transfer")).toHaveValue(
    "davinci-intermediate",
  );
  await expect(page.getByLabel("Input primaries")).toHaveValue(
    "davinci-wide-gamut",
  );
  await expect(page.getByText("Preview 1240 × 846")).toBeVisible();

  const ids = await buildElevenNodeGraph(page);
  const preview = page.getByLabel("Graded image preview");
  await expect(preview).toHaveAttribute("width", "1240");

  // Parameters through the real inspector, one node at a time.
  await page.locator('.react-flow__node[data-id="exposure"]').click();
  const stops = page.getByRole("spinbutton", { name: "Exposure in stops" });
  await stops.fill("1.5");
  await stops.press("Enter");
  await page.locator(`.react-flow__node[data-id="${ids.cst}"]`).click();
  await page.getByLabel("CST to primaries").selectOption("rec2020");
  await page
    .locator(`.react-flow__node[data-id="${ids.whiteBalance}"]`)
    .click();
  const temperature = page.getByRole("spinbutton", {
    name: "Temperature (K)",
  });
  await temperature.fill("5200");
  await temperature.press("Enter");
  await page.locator(`.react-flow__node[data-id="${ids.contrast}"]`).click();
  const contrast = page.getByRole("spinbutton", { name: "Contrast amount" });
  await contrast.fill("1.2");
  await contrast.press("Enter");
  await page.locator(`.react-flow__node[data-id="${ids.saturation}"]`).click();
  const vibrance = page.getByRole("spinbutton", { name: "Vibrance" });
  await vibrance.fill("0.35");
  await vibrance.press("Enter");

  // Output encoding covers a second transfer and gamut through the pipeline.
  await page.getByLabel("Output transfer").selectOption("gamma24");
  await page.getByLabel("Output primaries").selectOption("rec2020");
  await expect(page.getByRole("alert")).toHaveCount(0);

  const graded = await graphOf(page);
  expect(
    new Set(graded.nodes.map((node: { type: string }) => node.type)),
  ).toEqual(
    new Set([
      "source",
      "exposure",
      "cst",
      "whiteBalance",
      "contrast",
      "curves",
      "saturation",
      "cdl",
      "qualifier",
      "blend",
      "output",
    ]),
  );

  // Editing stays reversible across the assembled graph.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await graphOf(page)).colour.output.primaries).toBe("rec709");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await graphOf(page)).colour.output.primaries).toBe("rec2020");

  // Viewer diagnostics: snapshot comparison, wipe, out-of-range and solo.
  await page.getByRole("button", { name: "Capture A", exact: true }).click();
  await page.getByLabel("Compare view").selectOption("A");
  await expect(page.getByLabel("Comparison wipe")).toBeVisible();
  await page.getByRole("button", { name: "Out-of-range" }).click();
  await expect(page.getByText("Blue: below 0 · Orange: above 1")).toBeVisible();
  await page.getByRole("button", { name: "Out-of-range" }).click();
  await page.getByRole("button", { name: "100%", exact: true }).click();
  await expect(page.getByLabel("Viewer zoom")).toHaveText("100%");
  await page
    .locator(`.react-flow__node[data-id="${ids.contrast}"]`)
    .dblclick({ delay: 100 });
  await expect(page.getByText("Solo: Contrast")).toBeVisible();
  await page.getByRole("button", { name: "Exit solo", exact: true }).click();
  await page.getByLabel("Compare view").selectOption("off");

  // Scopes measure the graded output without blocking the editor.
  const scopes = page.getByRole("region", { name: "Image scopes" });
  await expect(
    scopes.getByRole("img", { name: "RGB histogram" }),
  ).toBeVisible();
  await expect(scopes.getByRole("img", { name: "RGB parade" })).toBeVisible();
  await expect(page.getByLabel("Scope status")).toContainText(
    "measured pixels",
  );

  // Local persistence and image-free sharing.
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByLabel("Project status")).toContainText(
    "Saved on this device",
  );
  await page.getByRole("button", { name: "Share grade", exact: true }).click();
  const link = await page.getByLabel("Share link").inputValue();
  expect(link).toContain("#");
  expect(link.length).toBeLessThan(4000);

  // Measured export: the report and the downloaded artifact come from one grade.
  await openLutExport(page);
  await page.getByLabel("LUT title").fill("Release check");
  await page.getByLabel("LUT size").selectOption("33");
  await page
    .getByRole("button", { name: "Measure LUT fidelity", exact: true })
    .click();
  const report = page.getByRole("region", { name: "LUT fidelity report" });
  await expect(report).toContainText("RGBA32F");
  await expect(report).toContainText("full capped preview");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export .cube", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("Release-check.cube");
  const artifact = parseCube(
    readFileSync(await save(download, "acceptance-grade.cube"), "utf8"),
  );
  expect(artifact.title).toBe("Release check");
  expect(artifact.size).toBe(33);

  // The report says Export .cube downloads the measured artifact. Check the
  // downloaded rows really carry this grade: at exact lattice coordinates the
  // independent parser must agree with the engine's own evaluation.
  const lattice: [number, number, number][] = [
    [0, 0, 0],
    [1, 1, 1],
    [8 / 32, 16 / 32, 24 / 32],
    [1, 4 / 32, 0],
    [12 / 32, 0, 31 / 32],
  ];
  const evaluated = await evaluateCurrentGraph(page, lattice);
  lattice.forEach((probe, i) =>
    applyCube(artifact, probe).forEach((value, channel) =>
      expect(value).toBeCloseTo(evaluated[i][channel], 4),
    ),
  );

  const current = await graphOf(page);
  const measurement = {
    nodes: current.nodes.length,
    edges: current.edges.length,
  };
  const reportText = await report.innerText();

  // The remedy the report suggests must actually reduce the measured error.
  await page.getByLabel("LUT size").selectOption("65");
  await expect(
    page.getByText("Settings changed. Measure again."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Measure LUT fidelity", exact: true })
    .click();
  await expect(report).toContainText("65³");
  const larger = await report.innerText();
  const maximumOf = (text: string) =>
    Number(/Overall maximum: ([\d.]+)/.exec(text)![1]);
  expect(maximumOf(larger)).toBeLessThan(maximumOf(reportText));
  record("acceptance.json", {
    generated: new Date().toISOString(),
    sample: "still-life (DaVinci Intermediate / DaVinci Wide Gamut, PNG16)",
    graph: { ...measurement, nodeTypes: 11 },
    output: "Gamma 2.4 / Rec.2020 · D65",
    downloadedArtifact:
      "acceptance-grade.cube — the 33³ artifact measured by fidelityReport",
    fidelityReport: reportText.split("\n"),
    fidelityReportAt65: larger.split("\n"),
    shareLinkCharacters: link.length,
  });

  // The saved project and its restored grade survive a reload.
  await page.reload();
  await expect(page.getByLabel("Project status")).toContainText(
    "Restored from this device",
  );
  await expect(page.getByLabel("Graded image preview")).toHaveAttribute(
    "width",
    "1240",
  );
  expect((await graphOf(page)).nodes.length).toBe(measurement.nodes);
});

test("records browser, GPU, precision and interactive preview evidence", async ({
  page,
  browserName,
}) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const capability = await page.evaluate(async () => {
    const { GradingEngine, createStarterGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const gl = document.createElement("canvas").getContext("webgl2")!;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const engine = new GradingEngine(document.createElement("canvas"));
    try {
      // A full 2048-long-edge preview, the app's cap, with structured content.
      const image = {
        width: 2048,
        height: 1080,
        data: new Float32Array(2048 * 1080 * 4),
      };
      for (let i = 0; i < image.data.length; i += 4) {
        const x = (i / 4) % 2048;
        image.data.set([x / 2047, ((i / 4) % 97) / 97, 1 - x / 2047, 1], i);
      }
      engine.setImage(image);
      const graph = createStarterGraph();
      const time = (interactive: boolean) => {
        const start = performance.now();
        engine.renderViewer(graph, { interactive });
        // readPixels() waits for the GPU, so the sample is not queue time.
        engine.readPixels();
        return Number((performance.now() - start).toFixed(1));
      };
      time(false);
      return {
        userAgent: navigator.userAgent,
        renderer: info
          ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        vendor: info
          ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL)
          : gl.getParameter(gl.VENDOR),
        shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        webglVersion: gl.getParameter(gl.VERSION),
        colorBufferFloat: !!gl.getExtension("EXT_color_buffer_float"),
        fragmentHighFloatBits: gl.getShaderPrecisionFormat(
          gl.FRAGMENT_SHADER,
          gl.HIGH_FLOAT,
        )!.precision,
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        maxViewport: Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS)),
        fragmentTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
        latticeFormat: engine.latticeSupport().format,
        compatibilityWarnings: engine.compatibilityWarnings(),
        fullPreviewMs: time(false),
        interactivePreviewMs: time(true),
      };
    } finally {
      engine.dispose();
    }
  });
  // Release evidence must show the tested route, not an assumed one.
  expect(capability.colorBufferFloat).toBe(true);
  expect(capability.latticeFormat).toBe("RGBA32F");
  expect(capability.fragmentHighFloatBits).toBeGreaterThanOrEqual(23);
  expect(capability.interactivePreviewMs).toBeLessThanOrEqual(
    capability.fullPreviewMs,
  );
  record("capability.json", {
    generated: new Date().toISOString(),
    browser: browserName,
    platform: `${process.platform} ${process.arch}`,
    launchArgs: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    note: "SwiftShader is a deterministic WebGL2 regression configuration, not a physical GPU or driver benchmark.",
    ...capability,
  });
});

/**
 * Probe codes in three bands: exact 33³ lattice coordinates, cell centres, and
 * pseudo-random off-grid values. The lattice band catches axis ordering and
 * domain handling; cell centres are furthest from every lattice point, which is
 * where trilinear and tetrahedral interpolation disagree most, so a host using
 * the wrong method cannot pass.
 */
function probePng(size = 64) {
  const samples = new Uint16Array(size * size * 3);
  const centre = (n: number) => ((n % 32) + 0.5) / 32;
  const scattered = (n: number, prime: number) => ((n * prime) % 1000) / 999;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      const rgb =
        y < 16
          ? [(x % 33) / 32, (y % 33) / 32, ((x + y) % 33) / 32]
          : y < 40
            ? [centre(x), centre(y + x), centre(x * 3 + y)]
            : [scattered(x, 7919), scattered(y, 6271), scattered(x + y, 4093)];
      samples.set(
        rgb.map((v) => Math.round(v * 65535)),
        i,
      );
    }
  return PNG.sync.write(
    {
      width: size,
      height: size,
      data: Buffer.from(samples.buffer),
    } as unknown as PNG,
    {
      bitDepth: 16,
      colorType: 2,
      inputColorType: 2,
      inputHasAlpha: false,
    },
  );
}

/** 16-bit codes as written to disk, so expectations use the host's actual input. */
function readCodes(bytes: Buffer) {
  const png = PNG.sync.read(bytes, { skipRescale: true });
  return {
    png,
    codes: png.data as unknown as Uint16Array & { length: number },
  };
}

function expectedPng(
  probe: { width: number; height: number; codes: Uint16Array },
  cube: Cube,
  apply: typeof applyCube,
) {
  const out = new Uint16Array(probe.width * probe.height * 3);
  for (let i = 0, j = 0; i < probe.codes.length; i += 4, j += 3) {
    const rgb = apply(cube, [
      probe.codes[i] / 65535,
      probe.codes[i + 1] / 65535,
      probe.codes[i + 2] / 65535,
    ]);
    for (let c = 0; c < 3; c++)
      out[j + c] = Math.round(Math.min(1, Math.max(0, rgb[c])) * 65535);
  }
  return PNG.sync.write(
    {
      width: probe.width,
      height: probe.height,
      data: Buffer.from(out.buffer),
    } as unknown as PNG,
    { bitDepth: 16, colorType: 2, inputColorType: 2, inputHasAlpha: false },
  );
}

test("emits identity and graded artifacts with independent expectations for host verification", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const probeBytes = probePng();
  writeFileSync(join(evidence, "host-probe.png"), probeBytes);
  const stored = readCodes(readFileSync(join(evidence, "host-probe.png")));
  const probe = {
    width: stored.png.width,
    height: stored.png.height,
    codes: new Uint16Array(
      stored.png.data.buffer,
      stored.png.data.byteOffset,
      stored.png.data.byteLength / 2,
    ),
  };

  const artifacts = [];
  for (const kind of ["identity", "grade"] as const) {
    await page.evaluate(async (which) => {
      const { useGraph } = await import(
        /* @vite-ignore */ "/src/graphStore.ts" as string
      );
      const { createGraph, createStarterGraph } = await import(
        /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
      );
      const graph = which === "identity" ? createGraph() : createStarterGraph();
      if (which === "identity")
        for (const boundary of ["input", "working", "output"] as const)
          graph.colour[boundary] = { transfer: "linear", primaries: "rec709" };
      else
        graph.nodes.find(
          (n: { id: string }) => n.id === "exposure",
        )!.data.stops = 0.5;
      useGraph.getState().restore(graph);
    }, kind);
    await openLutExport(page);
    await page
      .getByLabel("LUT title")
      .fill(kind === "identity" ? "Identity" : "Release grade");
    await page.getByLabel("LUT size").selectOption("33");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export .cube", exact: true }).click(),
    ]);
    const file = `host-${kind}.cube`;
    const cube = parseCube(readFileSync(await save(download, file), "utf8"));
    expect(cube.size).toBe(33);
    artifacts.push({
      name: kind,
      cube: file,
      size: cube.size,
      grade:
        kind === "identity"
          ? "Neutral graph with linear Rec.709 input, working and output"
          : "Branching starter grade at +0.5 stops, sRGB / Rec.709 in and out",
      expected: {
        trilinear: `host-${kind}-trilinear.png`,
        tetrahedral: `host-${kind}-tetrahedral.png`,
      },
    });
    writeFileSync(
      join(evidence, `host-${kind}-trilinear.png`),
      expectedPng(probe, cube, applyCube),
    );
    writeFileSync(
      join(evidence, `host-${kind}-tetrahedral.png`),
      expectedPng(probe, cube, applyTetrahedral),
    );
    // The identity artifact must round-trip; a swapped axis would not.
    const centre = applyCube(cube, [0.25, 0.5, 0.75]);
    if (kind === "identity")
      [0.25, 0.5, 0.75].forEach((v, c) => expect(centre[c]).toBeCloseTo(v, 4));
    else expect(centre[0]).toBeGreaterThan(0.25);
  }
  record("host-inputs.json", {
    generated: new Date().toISOString(),
    probe: "host-probe.png",
    probeDescription:
      "64 × 64 RGB16 codes: exact 33³ lattice coordinates and off-grid values.",
    interpolations: ["trilinear", "tetrahedral"],
    range: "full range, 0–1 domain, values clamped by the Output policy",
    artifacts,
  });
});

// Offline caching exists only in the built application, so this part of the
// integrated pass runs against the production preview (see playwright.config.ts).
test.describe("production build", () => {
  test.use({ baseURL: "http://127.0.0.1:4173" });

  test("a graded sample project keeps working offline, including LUT export", async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const foreign: string[] = [];
    context.on(
      "request",
      (request) =>
        request.url().startsWith("http://127.0.0.1:4173") ||
        foreign.push(request.url()),
    );
    await page.goto("/");
    await expect(page.getByLabel("Offline status")).toContainText(
      "Stored for offline use",
      { timeout: 30_000 },
    );

    // Opening a sample online stores it for offline grading.
    await page.getByRole("button", { name: "Browse samples" }).click();
    await page
      .getByRole("region", { name: "Bundled log samples" })
      .getByRole("button", { name: "Red flower", exact: true })
      .click();
    await expect(page.getByText("Preview 610 × 406")).toBeVisible();
    // Close the gallery so the viewer has the same layout as it will after a
    // reload; an element screenshot captures the canvas at its displayed size.
    await page.getByRole("button", { name: "Browse samples" }).click();
    await page.locator('.react-flow__node[data-id="exposure"]').click();
    const stops = page.getByRole("spinbutton", { name: "Exposure in stops" });
    await stops.fill("-0.75");
    await stops.press("Enter");
    const preview = page.getByLabel("Graded image preview");
    const online = await preview.screenshot();
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(page.getByLabel("Project status")).toContainText(
      "Saved on this device",
    );

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByLabel("Offline status")).toContainText("Offline");
    await expect(page.getByLabel("Project status")).toContainText(
      "Restored from this device",
    );
    await expect(page.getByLabel("Sample provenance")).toContainText(
      "DaVinci Intermediate",
    );
    expect(
      differingPixels(await preview.screenshot(), online),
      "the restored offline grade must render the same pixels",
    ).toBe(0);

    // Grading, scopes and export all run locally, so none of them needs a network.
    await page.locator('.react-flow__node[data-id="exposure"]').click();
    await stops.fill("0.5");
    await stops.press("Enter");
    await expect(page.getByLabel("Scope status")).toContainText(
      "measured pixels",
    );
    await openLutExport(page);
    await page.getByLabel("LUT title").fill("Offline grade");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export .cube", exact: true }).click(),
    ]);
    const offlineCube = parseCube(
      readFileSync(await save(download, "offline-grade.cube"), "utf8"),
    );
    expect(offlineCube.size).toBe(33);
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(foreign).toEqual([]);
    record("offline.json", {
      generated: new Date().toISOString(),
      origin: "http://127.0.0.1:4173 (vite preview of the production build)",
      sample: "flower (stored on first online open)",
      offlineWorkflow: [
        "reload with the network disabled",
        "restore the saved project and its grade",
        "edit exposure and re-measure scopes",
        "export offline-grade.cube",
      ],
      requestsToOtherOrigins: foreign.length,
    });
  });
});
