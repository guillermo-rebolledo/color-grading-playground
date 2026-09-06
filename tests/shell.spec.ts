import { openNeutralGraph } from "./fixtures";
import { test, expect, type Page } from "@playwright/test";

async function openImage(page: Page) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 20;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#804020";
    context.fillRect(0, 0, 40, 20);
    return canvas.toDataURL().split(",")[1];
  });
  await page.getByLabel("Choose image").setInputFiles({
    name: "stage.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.getByLabel("Graded image preview")).toBeVisible();
}

const graphPanel = (page: Page) =>
  page.getByRole("region", { name: "Grading graph" });
const scopesPanel = (page: Page) =>
  page.getByRole("region", { name: "Image scopes" });
const dockDivider = (page: Page) =>
  page.getByRole("separator", { name: "Resize viewer and dock" });
const splitDivider = (page: Page) =>
  page.getByRole("separator", { name: "Resize graph and scopes" });

async function box(page: Page, locator: ReturnType<Page["locator"]>) {
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error("Element is not laid out");
  return bounds;
}

test("the image and the graph are both fully visible without scrolling", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await openImage(page);
  const viewport = page.viewportSize()!;
  const scroll = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    client: document.documentElement.clientHeight,
  }));
  expect(scroll.height).toBeLessThanOrEqual(scroll.client);
  for (const region of [
    page.getByLabel("Graded image preview"),
    graphPanel(page),
  ]) {
    const bounds = await box(page, region);
    expect(bounds.height).toBeGreaterThan(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
  }
});

test("the viewer spans the stage above the dock and the inspector holds its rail", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await openImage(page);
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const rail = await box(page, inspector);
  expect(rail.width).toBe(328);
  const viewer = await box(page, page.getByRole("region", { name: "Viewer" }));
  const graph = await box(page, graphPanel(page));
  const scopes = await box(page, scopesPanel(page));
  // The viewer owns the top of the stage at the full width of the main column.
  expect(viewer.y + viewer.height).toBeLessThanOrEqual(graph.y + 1);
  expect(Math.abs(viewer.width - (graph.width + scopes.width))).toBeLessThan(
    12,
  );
  // Graph and scopes share the dock side by side, clear of the rail.
  expect(graph.x + graph.width).toBeLessThanOrEqual(scopes.x + 1);
  expect(scopes.x + scopes.width).toBeLessThanOrEqual(rail.x + 1);
});

test("the inspector keeps its width and its order across node types", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await openImage(page);
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  // The panel's fixed sections, in the order a colourist learns them.
  const order = async () => {
    const anchors = [
      inspector.getByRole("heading", { name: "Inspector" }),
      inspector.getByText("COLOUR PIPELINE"),
      inspector.getByRole("button", { name: "Export .cube", exact: true }),
    ];
    const tops = [];
    for (const anchor of anchors) tops.push((await box(page, anchor)).y);
    return tops;
  };
  const before = await box(page, inspector);
  const first = await order();
  await page.getByRole("button", { name: "Add Curves", exact: true }).click();
  await expect(
    inspector.getByRole("heading", { name: "Curves" }).first(),
  ).toBeVisible();
  const after = await box(page, inspector);
  expect(after.width).toBe(before.width);
  expect(after.x).toBe(before.x);
  const second = await order();
  expect(second[0]).toBe(first[0]);
  for (let step = 1; step < second.length; step++)
    expect(second[step]).toBeGreaterThan(second[step - 1]);
});

test("either dock panel collapses to a title strip and re-expands from it", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await openImage(page);
  const preview = page.getByLabel("Graded image preview");
  const parade = scopesPanel(page).getByRole("img", { name: "RGB parade" });
  await expect(parade).toBeVisible();
  const viewerBefore = await box(page, preview);
  const graphBefore = await box(page, graphPanel(page));

  await page.getByRole("button", { name: "Collapse scopes panel" }).click();
  await expect(parade).toBeHidden();
  const strip = await box(page, scopesPanel(page));
  expect(strip.height).toBe(24);
  // The graph takes the full dock width; the viewer does not move.
  expect((await box(page, graphPanel(page))).width).toBeGreaterThan(
    graphBefore.width + 100,
  );
  expect(await box(page, preview)).toEqual(viewerBefore);

  await page.getByRole("button", { name: "Expand scopes panel" }).click();
  await expect(parade).toBeVisible();
  expect((await box(page, graphPanel(page))).width).toBeCloseTo(
    graphBefore.width,
    0,
  );

  await page.getByRole("button", { name: "Collapse graph panel" }).click();
  await expect(page.locator(".react-flow__node").first()).toBeHidden();
  expect((await box(page, graphPanel(page))).height).toBe(24);
  await page.getByRole("button", { name: "Expand graph panel" }).click();
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  // The image keeps its rendered size through every collapse.
  await expect(preview).toHaveAttribute("width", "40");
});

test("dragging the dividers trades viewer height and dock width", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await openImage(page);
  const graphBefore = await box(page, graphPanel(page));
  const divider = await box(page, dockDivider(page));
  await page.mouse.move(
    divider.x + divider.width / 2,
    divider.y + divider.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(divider.x + divider.width / 2, divider.y - 90, {
    steps: 10,
  });
  await page.mouse.up();
  const taller = await box(page, graphPanel(page));
  expect(taller.height).toBeGreaterThan(graphBefore.height + 60);

  const split = await box(page, splitDivider(page));
  await page.mouse.move(split.x + split.width / 2, split.y + split.height / 2);
  await page.mouse.down();
  await page.mouse.move(split.x + split.width / 2 + 120, split.y + 20, {
    steps: 10,
  });
  await page.mouse.up();
  const wider = await box(page, graphPanel(page));
  expect(wider.width).toBeGreaterThan(taller.width + 80);
  expect((await box(page, scopesPanel(page))).width).toBeLessThan(
    graphBefore.width,
  );
});

test("dividers and collapse toggles are operable from the keyboard", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await openImage(page);
  for (const divider of [dockDivider(page), splitDivider(page)]) {
    expect(await divider.evaluate((element) => element.tabIndex)).toBe(0);
    await expect(divider).toHaveAttribute("aria-valuenow", /\d/);
  }
  const graphBefore = await box(page, graphPanel(page));
  const divider = dockDivider(page);
  await divider.focus();
  await expect(divider).toBeFocused();
  for (let step = 0; step < 4; step++) await divider.press("ArrowUp");
  const taller = await box(page, graphPanel(page));
  expect(taller.height).toBeGreaterThan(graphBefore.height + 32);
  await divider.press("ArrowDown");
  expect((await box(page, graphPanel(page))).height).toBeLessThan(
    taller.height,
  );

  const split = splitDivider(page);
  await split.focus();
  const beforeSplit = await box(page, graphPanel(page));
  for (let step = 0; step < 4; step++) await split.press("ArrowRight");
  expect((await box(page, graphPanel(page))).width).toBeGreaterThan(
    beforeSplit.width + 32,
  );

  const toggle = page.getByRole("button", { name: "Collapse scopes panel" });
  await toggle.focus();
  await toggle.press("Enter");
  await expect(
    page.getByRole("button", { name: "Expand scopes panel" }),
  ).toBeFocused();
});

test("dock sizes and collapse states survive a reload and stay out of projects", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await openImage(page);
  const divider = dockDivider(page);
  await divider.focus();
  for (let step = 0; step < 4; step++) await divider.press("ArrowUp");
  await page.getByRole("button", { name: "Collapse scopes panel" }).click();
  const graph = await box(page, graphPanel(page));

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByLabel("Project status")).toContainText(
    "Saved on this device",
  );
  await page.getByRole("button", { name: "Share grade", exact: true }).click();
  const link = await page.getByLabel("Share link").inputValue();
  const shared = await page.evaluate(async (value) => {
    const { readSharedProject } = await import(
      /* @vite-ignore */ "/src/sharedProject.ts" as string
    );
    return readSharedProject(new URL(value).hash);
  }, link);
  expect(Object.keys(shared as object).sort()).toEqual([
    "graph",
    "source",
    "version",
  ]);
  expect(JSON.stringify(shared)).not.toContain("dock");

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand scopes panel" }),
  ).toBeVisible();
  const restored = await box(page, graphPanel(page));
  expect(restored.height).toBeCloseTo(graph.height, 0);
});

test("a window narrower than 1280px gets the unsupported screen, and widening restores the workspace", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await openImage(page);
  await page.setViewportSize({ width: 1279, height: 900 });
  const screen = page.getByRole("heading", {
    name: "This window is too narrow to grade in",
  });
  await expect(screen).toBeVisible();
  await expect(page.getByText("1280", { exact: false }).first()).toBeVisible();
  await expect(page.getByLabel("Graded image preview")).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(screen).toBeHidden();
  const preview = page.getByLabel("Graded image preview");
  await expect(preview).toBeVisible();
  // Restored without a reload: the open image is still the one that was loaded.
  await expect(page.getByText("stage.png", { exact: true })).toBeVisible();

  const rail = await box(
    page,
    page.getByRole("complementary", { name: "Inspector" }),
  );
  expect(rail.width).toBe(328);
  const scopes = await box(page, scopesPanel(page));
  expect(scopes.x + scopes.width).toBeLessThanOrEqual(rail.x + 1);
  // The parade drops to a second row rather than overlapping the histogram.
  const histogram = await box(
    page,
    scopesPanel(page).getByRole("img", { name: "RGB histogram" }),
  );
  const parade = await box(
    page,
    scopesPanel(page).getByRole("img", { name: "RGB parade" }),
  );
  expect(parade.y).toBeGreaterThanOrEqual(histogram.y + histogram.height);
});

test("a browser without WebGL2 is told what grading requires, in the viewer", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    Reflect.set(
      HTMLCanvasElement.prototype,
      "getContext",
      function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === "webgl2") return null;
        return Reflect.apply(getContext, this, [type, ...rest]);
      },
    );
  });
  await page.goto("/");
  // The same explanation the narrow-window screen gives, stated where the
  // preview would have been: the graph is still editable, so the workspace is
  // not replaced.
  const explanation = page.getByRole("alert");
  await expect(explanation).toContainText("WebGL2 is unavailable");
  await expect(explanation).toContainText("32-bit float rendering");
  await expect(explanation).toContainText("1280 pixels wide");
  await expect(
    page.getByRole("button", { name: "Retry graphics recovery" }),
  ).toBeVisible();
  await expect(graphPanel(page)).toBeVisible();
});
