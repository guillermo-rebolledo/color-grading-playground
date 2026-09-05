import { test, expect, type Locator } from "@playwright/test";
import { openNeutralGraph } from "./fixtures";

function previewScreenshot(canvas: Locator) {
  return canvas.screenshot({ style: ".wipe-handle { visibility: hidden }" });
}

test("RGB solo respects intermediate encoding and restores active output", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const graph = createGraph();
    graph.colour.input = graph.colour.output = {
      transfer: "linear",
      primaries: "rec709",
    };
    graph.nodes[1].data.stops = 1;
    const canvas = document.createElement("canvas");
    const engine = new GradingEngine(canvas);
    engine.setImage({
      width: 1,
      height: 1,
      data: new Float32Array([0.2, 0.2, 0.2, 1]),
    });
    const display = () => {
      const gl = canvas.getContext("webgl2")!;
      const bytes = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      return bytes[0];
    };
    try {
      engine.renderViewer(graph, { solo: "source" });
      const solo = display();
      const active = Array.from(engine.readPixels()) as number[];
      engine.renderViewer(graph, {});
      return { solo, active, restored: display() };
    } finally {
      engine.dispose();
    }
  });
  expect(result.solo).toBeCloseTo(124, 0);
  expect(result.active[0]).toBeCloseTo(0.4, 5);
  expect(result.restored).toBeCloseTo(170, 0);
});

test("wipe shares source coordinates and before uses project transforms without altering output", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const graph = createGraph();
    graph.colour.input = { transfer: "linear", primaries: "rec709" };
    graph.colour.output = { transfer: "gamma24", primaries: "rec709" };
    graph.nodes[1].data.stops = 1;
    const canvas = document.createElement("canvas");
    const engine = new GradingEngine(canvas);
    engine.setImage({
      width: 2,
      height: 2,
      data: new Float32Array([
        0.1, 0.1, 0.1, 1, 0.2, 0.2, 0.2, 1, 0.3, 0.3, 0.3, 1, 0.4, 0.4, 0.4, 1,
      ]),
    });
    try {
      engine.render(graph);
      const original = Array.from(engine.readPixels());
      engine.renderViewer(graph, { before: true, wipe: 0.5 });
      const gl = canvas.getContext("webgl2")!;
      const bytes = new Uint8Array(16);
      gl.readPixels(0, 0, 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      return {
        displayed: [bytes[8], bytes[12], bytes[0], bytes[4]],
        original,
        active: Array.from(engine.readPixels()),
      };
    } finally {
      engine.dispose();
    }
  });
  // sRGB display of linear .1, .4, .3, .8; top-left then top-right, bottom-left then bottom-right.
  result.displayed.forEach((v, i) =>
    expect(Math.abs(v - [89, 170, 149, 231][i])).toBeLessThanOrEqual(1),
  );
  expect(result.active).toEqual(result.original);
});

test("range warnings detect pre-clamp output values and preserve numeric grade", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const graph = createGraph();
    graph.colour.input = graph.colour.output = {
      transfer: "linear",
      primaries: "rec709",
    };
    const serialized = JSON.stringify(graph);
    const canvas = document.createElement("canvas");
    const engine = new GradingEngine(canvas);
    engine.setImage({
      width: 4,
      height: 1,
      data: new Float32Array([
        -0.1, 0.2, 0.2, 1, 1.2, 0.2, 0.2, 1, -0.1, 1.2, 0.2, 1, 0.2, 0.2, 0.2,
        1,
      ]),
    });
    try {
      engine.renderViewer(graph, { outOfRange: true });
      const gl = canvas.getContext("webgl2")!;
      const bytes = new Uint8Array(16);
      gl.readPixels(0, 0, 4, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      return {
        bytes: Array.from(bytes),
        pixels: Array.from(engine.readPixels()),
        unchanged: serialized === JSON.stringify(graph),
      };
    } finally {
      engine.dispose();
    }
  });
  expect(result.bytes.slice(0, 12)).toEqual([
    0, 102, 255, 255, 255, 51, 0, 255, 255, 0, 255, 255,
  ]);
  expect(result.bytes[12]).toBeCloseTo(124, 0);
  expect(result.pixels[0]).toBe(0);
  expect(result.pixels[4]).toBe(1);
  expect(result.unchanged).toBe(true);
});

test("viewer snapshots stay frozen through edits, with aligned zoom and solo restoration", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await page.getByLabel("Load precision chart").selectOption("slog3");
  const canvas = page.getByLabel("Graded image preview");
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Capture A", exact: true }).click();
  await page.getByLabel("Compare view").selectOption("A");
  const wipe = page.getByRole("slider", { name: "Comparison wipe" });
  await wipe.focus();
  await wipe.press("End");
  const frozen = await previewScreenshot(canvas);
  const exposure = page.getByRole("spinbutton", { name: "Exposure in stops" });
  await exposure.fill("2");
  await exposure.press("Enter");
  await expect
    .poll(async () => (await previewScreenshot(canvas)).equals(frozen))
    .toBe(true);
  await wipe.focus();
  await wipe.press("Home");
  await expect
    .poll(async () => (await previewScreenshot(canvas)).equals(frozen))
    .toBe(false);
  await page.getByLabel("Compare view").selectOption("off");
  const active = await previewScreenshot(canvas);
  await page
    .locator('.react-flow__node[data-id="source"]')
    .dblclick({ delay: 100 });
  await expect(
    page.getByRole("button", { name: "Exit solo", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await previewScreenshot(canvas)).equals(active))
    .toBe(false);
  await page.getByRole("button", { name: "Exit solo", exact: true }).click();
  await expect
    .poll(async () => (await previewScreenshot(canvas)).equals(active))
    .toBe(true);
  await page.getByRole("button", { name: "100%", exact: true }).click();
  const native = await canvas.boundingBox();
  expect(native!.width).toBe(Number(await canvas.getAttribute("width")));
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.getByRole("button", { name: "Out-of-range", exact: true }).click();
  await expect(page.getByText(/Blue: below 0/)).toBeVisible();
  await page.getByRole("button", { name: "Out-of-range", exact: true }).click();
  await page.locator('.react-flow__node[data-id="exposure"]').click();
  await expect(exposure).toHaveValue("2.00");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(exposure).toHaveValue("0.00");
});

test("A and B can be recaptured independently and the wipe follows zoom and pan", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await page.getByLabel("Load precision chart").selectOption("slog3");
  const canvas = page.getByLabel("Graded image preview");
  const exposure = page.getByRole("spinbutton", { name: "Exposure in stops" });
  await page.getByRole("button", { name: "Capture A", exact: true }).click();
  await exposure.fill("-2");
  await exposure.press("Enter");
  await page.getByRole("button", { name: "Capture B", exact: true }).click();
  await page.getByLabel("Compare view").selectOption("B");
  const wipe = page.getByRole("slider", { name: "Comparison wipe" });
  await wipe.focus();
  await wipe.press("End");
  const b = await previewScreenshot(canvas);
  await exposure.fill("1");
  await exposure.press("Enter");
  await page.getByRole("button", { name: "Capture A", exact: true }).click();
  expect((await previewScreenshot(canvas)).equals(b)).toBe(true);
  await page.getByLabel("Compare view").selectOption("A");
  await expect
    .poll(async () => (await previewScreenshot(canvas)).equals(b))
    .toBe(false);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const zoomed = await canvas.boundingBox();
  expect(zoomed!.width).toBe(720);
  await wipe.focus();
  await wipe.press("Home");
  await wipe.press("ArrowRight");
  await expect(wipe).toHaveValue("1");
  await wipe.press("End");
  await wipe.press("ArrowLeft");
  const surface = page.locator(".viewer-surface");
  const bounds = await surface.boundingBox();
  await page.mouse.move(bounds!.x + 100, bounds!.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 140, bounds!.y + 50);
  await page.mouse.up();
  expect((await canvas.boundingBox())!.x).toBeCloseTo(zoomed!.x + 40, 0);
  expect(await wipe.boundingBox()).toEqual(await canvas.boundingBox());
  // Drag the actual handle from 99% to the middle of the image.
  const moved = await canvas.boundingBox();
  await page.mouse.move(
    moved!.x + moved!.width - 15,
    moved!.y + moved!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    moved!.x + moved!.width / 2,
    moved!.y + moved!.height / 2,
  );
  await page.mouse.up();
  expect(Number(await wipe.inputValue())).toBeGreaterThan(45);
  expect(Number(await wipe.inputValue())).toBeLessThan(55);
});
