import { revealInspector } from "./fixtures";
import { openNeutralGraph } from "./fixtures";
import { test, expect } from "@playwright/test";

test("load a private image, adjust exposure, reset, and recover from a bad file", async ({
  page,
}) => {
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH"].includes(request.method()))
      uploads.push(request.url());
  });
  await openNeutralGraph(page);
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 20;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#804020";
    ctx.fillRect(0, 0, 40, 20);
    return canvas.toDataURL().split(",")[1];
  });
  await page.getByLabel("Choose image").setInputFiles({
    name: "private.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.getByText("private.png", { exact: true })).toBeVisible();
  const canvas = page.getByLabel("Graded image preview");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("width", "40");
  const exposure = page.getByRole("spinbutton", { name: "Exposure in stops" });
  await exposure.fill("2");
  await exposure.press("Enter");
  await expect(exposure).toHaveValue("2.00");
  await page.getByRole("button", { name: "Reset exposure" }).click();
  await expect(exposure).toHaveValue("0.00");
  await page.getByLabel("Choose image").setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("alert")).toContainText("could not be read");
  await expect(page.getByText("private.png", { exact: true })).toBeVisible();
  expect(uploads).toEqual([]);
});

test("numeric entry supports signed decimals and scrubbing resets on double click", async ({
  page,
}) => {
  await openNeutralGraph(page);
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    return canvas.toDataURL().split(",")[1];
  });
  await page.getByLabel("Choose image").setInputFiles({
    name: "image.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  const exposure = page.getByRole("spinbutton", { name: "Exposure in stops" });
  await expect(exposure).toBeEnabled();
  await exposure.fill("");
  await exposure.pressSequentially("-1.25");
  await exposure.press("Enter");
  await expect(exposure).toHaveValue("-1.25");
  const slider = page.getByRole("slider", { name: "Scrub exposure" });
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(exposure).toHaveValue("-1.24");
  await slider.dblclick();
  await expect(exposure).toHaveValue("0.00");
  await exposure.fill("3");
  await exposure.dblclick();
  await expect(exposure).toHaveValue("0.00");
});

test("honors JPEG EXIF orientation in the visible preview", async ({
  page,
}) => {
  await openNeutralGraph(page);
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 20;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 20, 20);
    ctx.fillStyle = "#0000ff";
    ctx.fillRect(20, 0, 20, 20);
    return canvas.toDataURL("image/jpeg", 1).split(",")[1];
  });
  // EXIF orientation 6: rotate the stored 40×20 red/blue image 90° clockwise.
  const exif = Buffer.from(
    "ffe100224578696600004d4d002a00000008000101120003000000010006000000000000",
    "hex",
  );
  const bytes = Buffer.from(jpeg, "base64");
  await page.getByLabel("Choose image").setInputFiles({
    name: "rotated.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.concat([bytes.subarray(0, 2), exif, bytes.subarray(2)]),
  });
  const canvas = page.getByLabel("Graded image preview");
  await expect(canvas).toHaveAttribute("width", "20");
  await expect(canvas).toHaveAttribute("height", "40");
  const { PNG } = await import("pngjs");
  const screenshot = PNG.sync.read(await canvas.screenshot());
  const top = (5 * screenshot.width + 10) * 4;
  const bottom = (35 * screenshot.width + 10) * 4;
  expect(screenshot.data[top]).toBeGreaterThan(240);
  expect(screenshot.data[top + 2]).toBeLessThan(10);
  expect(screenshot.data[bottom + 2]).toBeGreaterThan(240);
});

test("renders PNG transparency without premultiplying the grade twice", async ({
  page,
}) => {
  const { PNG } = await import("pngjs");
  const source = new PNG({ width: 40, height: 40 });
  for (let i = 0; i < source.data.length; i += 4) {
    source.data[i] = 200;
    source.data[i + 1] = 80;
    source.data[i + 2] = 20;
    source.data[i + 3] = 128;
  }
  await openNeutralGraph(page);
  await page.getByLabel("Choose image").setInputFiles({
    name: "alpha.png",
    mimeType: "image/png",
    buffer: PNG.sync.write(source),
  });
  const canvas = page.getByLabel("Graded image preview");
  await expect(canvas).toBeVisible();
  const screenshot = PNG.sync.read(await canvas.screenshot());
  // Sample inside the canvas: its CSS position can fall between device pixels.
  const center =
    (Math.floor(screenshot.height / 2) * screenshot.width +
      Math.floor(screenshot.width / 2)) *
    4;
  const pixel = Array.from(screenshot.data.subarray(center, center + 3));
  // Half-transparent source over the viewer's dark checker, with browser compositing once.
  expect(pixel[0]).toBeGreaterThan(105);
  expect(pixel[0]).toBeLessThan(116);
  expect(pixel[1]).toBeGreaterThan(47);
  expect(pixel[1]).toBeLessThan(55);
});

test("explains missing GPU capability instead of enabling a broken preview", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: function (
        this: HTMLCanvasElement,
        ...args: Parameters<typeof getContext>
      ) {
        if (String(args[0]) === "webgl2") return null;
        return getContext.apply(this, args);
      },
    });
  });
  await openNeutralGraph(page);
  await expect(page.getByRole("alert")).toContainText("WebGL2 is unavailable");
  await expect(page.getByRole("button", { name: "Open image" })).toBeDisabled();
  // Graph edits stay available while GPU preview and image loading are paused.
  await expect(page.getByRole("slider")).toBeEnabled();
});

test("caps uploaded preview dimensions while keeping original size visible", async ({
  page,
}) => {
  const { PNG } = await import("pngjs");
  const source = new PNG({ width: 4096, height: 16 });
  source.data.fill(255);
  await openNeutralGraph(page);
  await page.getByLabel("Choose image").setInputFiles({
    name: "wide.png",
    mimeType: "image/png",
    buffer: PNG.sync.write(source),
  });
  await expect(page.getByLabel("Graded image preview")).toHaveAttribute(
    "width",
    "2048",
  );
  await expect(page.getByLabel("Graded image preview")).toHaveAttribute(
    "height",
    "8",
  );
  await expect(page.getByText("4096 × 16", { exact: true })).toBeVisible();
});

test("a tall image fits the viewer instead of stretching the workspace", async ({
  page,
}) => {
  const { PNG } = await import("pngjs");
  const source = new PNG({ width: 400, height: 1600 });
  source.data.fill(128);
  await openNeutralGraph(page);
  await page.getByLabel("Choose image").setInputFiles({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: PNG.sync.write(source),
  });
  const canvas = page.getByLabel("Graded image preview");
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  expect(bounds!.height).toBeLessThan(700);
});

test("copy and paste selected adjustments and undo graph and parameter edits", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await page.getByRole("button", { name: "Add Exposure", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  const value = page.getByRole("spinbutton", { name: "Exposure in stops" });
  await value.fill("2");
  await value.press("Enter");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(value).toHaveValue("0.00");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(value).toHaveValue("2.00");
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await expect(value).toHaveValue("2.00");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Delete selection", exact: true })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
});

test("connect branches, reject occupied ports, and copy internal edges with keyboard history", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await page.getByRole("button", { name: "Add Exposure", exact: true }).click();
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  const nodes = page.locator(".react-flow__node");
  const original = page.locator('.react-flow__node[data-id="exposure"]');
  const added = nodes
    .filter({
      has: page.getByRole("heading", { name: "Exposure", exact: true }),
    })
    .last();
  const dragPort = async (
    from: import("@playwright/test").Locator,
    to: import("@playwright/test").Locator,
  ) => {
    const a = (await from.boundingBox())!,
      b = (await to.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    await page.mouse.up();
  };
  await dragPort(
    original.getByLabel("Exposure RGB output"),
    added.getByLabel("Exposure RGB input"),
  );
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  await dragPort(
    added.getByLabel("Exposure RGB output"),
    page.getByLabel("Output RGB input"),
  );
  await expect(page.getByRole("status")).toContainText(
    "already has a connection",
  );
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  await original.click();
  await added.click({ modifiers: ["Shift"] });
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(nodes).toHaveCount(6);
  await expect(page.locator(".react-flow__edge")).toHaveCount(4);
  const nodeIds = await nodes.evaluateAll((elements) =>
    elements.map((e) => e.getAttribute("data-id")),
  );
  expect(new Set(nodeIds).size).toBe(6);
  await page.keyboard.press("Control+z");
  await expect(nodes).toHaveCount(4);
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  await page.keyboard.press("Control+Shift+z");
  await expect(nodes).toHaveCount(6);
  expect(
    await nodes.evaluateAll((elements) =>
      elements.map((e) => e.getAttribute("data-id")),
    ),
  ).toEqual(nodeIds);
});

test("one scrub is one undo step and node moves snap and undo", async ({
  page,
}) => {
  await openNeutralGraph(page);
  const slider = page.getByRole("slider", { name: "Scrub exposure" });
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, {
    steps: 20,
  });
  await page.mouse.up();
  const value = page.getByRole("spinbutton", { name: "Exposure in stops" });
  const changed = await value.inputValue();
  expect(Number(changed)).toBeGreaterThan(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(value).toHaveValue("0.00");
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(value).toHaveValue(changed);
  const node = page.locator('.react-flow__node[data-id="exposure"]');
  await page.locator(".flow-canvas").scrollIntoViewIfNeeded();
  const before = await node.getAttribute("style");
  const n = (await node.boundingBox())!;
  await page.mouse.move(n.x + 50, n.y + 20);
  await page.mouse.down();
  await page.mouse.move(n.x + 89, n.y + 89, { steps: 10 });
  await page.mouse.up();
  const after = await node.getAttribute("style");
  expect(after).not.toBe(before);
  const position = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(after!)!;
  expect(Number(position[1]) % 16).toBe(0);
  expect(Number(position[2]) % 16).toBe(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(node).toHaveAttribute("style", before!);
});

test("box selection and endpoint deletion are reversible, and incomplete output pauses preview", async ({
  page,
}) => {
  await openNeutralGraph(page);
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    return canvas.toDataURL().split(",")[1];
  });
  await page.getByLabel("Choose image").setInputFiles({
    name: "graph.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  const flow = page.locator(".flow-canvas");
  await flow.scrollIntoViewIfNeeded();
  const nodes = page.locator(".react-flow__node");
  const source = (await nodes.first().boundingBox())!,
    output = (await nodes.last().boundingBox())!;
  await page.keyboard.down("Shift");
  await page.mouse.move(source.x - 20, source.y - 20);
  await page.mouse.down();
  await page.mouse.move(
    output.x + output.width + 20,
    output.y + output.height + 20,
    { steps: 10 },
  );
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(3);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "duplicate Source or Output",
  );
  await page
    .getByRole("button", { name: "Delete selection", exact: true })
    .click();
  await expect(nodes).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("Preview paused");
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(nodes).toHaveCount(3);
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(nodes).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.locator('.react-flow__node[data-id="source"]'),
  ).toBeVisible();
});

test("rebuild the active graph with Delete and resume live exposure rendering", async ({
  page,
}) => {
  const { PNG } = await import("pngjs");
  const fixture = new PNG({ width: 40, height: 40 });
  for (let i = 0; i < fixture.data.length; i += 4) {
    fixture.data[i] = 128;
    fixture.data[i + 1] = 128;
    fixture.data[i + 2] = 128;
    fixture.data[i + 3] = 255;
  }
  await openNeutralGraph(page);
  await page.getByLabel("Choose image").setInputFiles({
    name: "gray.png",
    mimeType: "image/png",
    buffer: PNG.sync.write(fixture),
  });
  await page.locator('.react-flow__node[data-id="exposure"]').click();
  await page.keyboard.press("Delete");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.getByRole("alert")).toContainText("Preview paused");
  await page.getByRole("button", { name: "Add Exposure", exact: true }).click();
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  const added = page.locator(".react-flow__node-exposure");
  const connect = async (
    from: import("@playwright/test").Locator,
    to: import("@playwright/test").Locator,
  ) => {
    const a = (await from.boundingBox())!,
      b = (await to.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    // A deliberate drop must not let edge auto-pan move the target port away.
    await page.waitForTimeout(300);
    const targetAfterHold = (await to.boundingBox())!;
    expect(targetAfterHold.x).toBeCloseTo(b.x, 1);
    expect(targetAfterHold.y).toBeCloseTo(b.y, 1);
    await page.mouse.up();
  };
  await connect(
    page.getByLabel("Source RGB output"),
    added.getByLabel("Exposure RGB input"),
  );
  await connect(
    added.getByLabel("Exposure RGB output"),
    page.getByLabel("Output RGB input"),
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await connect(
    added.getByLabel("Exposure RGB output"),
    added.getByLabel("Exposure RGB input"),
  );
  await expect(page.getByRole("status")).toContainText(
    "already has a connection",
  );
  const exposure = page.getByRole("spinbutton", { name: "Exposure in stops" });
  await exposure.fill("1");
  await exposure.press("Enter");
  const canvas = page.getByLabel("Graded image preview");
  await expect
    .poll(async () => {
      const shot = PNG.sync.read(await canvas.screenshot());
      return shot.data[(20 * shot.width + 20) * 4];
    })
    .toBe(176);
});

test("keyboard undo and redo work from the focused exposure slider", async ({
  page,
}) => {
  await openNeutralGraph(page);
  const slider = page.getByRole("slider", { name: "Scrub exposure" });
  const value = page.getByRole("spinbutton", { name: "Exposure in stops" });
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(value).toHaveValue("0.01");
  await slider.press("Control+z");
  await expect(value).toHaveValue("0.00");
  await slider.press("Control+Shift+z");
  await expect(value).toHaveValue("0.01");
});

test("project colour settings and CST edits share reversible graph history", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await expect(page.getByLabel("Input transfer", { exact: true })).toHaveValue(
    "srgb",
  );
  await expect(
    page.getByLabel("Working transfer", { exact: true }),
  ).toHaveValue("linear");
  await revealInspector(page, "Colour pipeline");
  await page
    .getByLabel("Input primaries", { exact: true })
    .selectOption("dci-p3");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Input primaries", { exact: true })).toHaveValue(
    "rec709",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByLabel("Input primaries", { exact: true })).toHaveValue(
    "dci-p3",
  );
  await revealInspector(page, "Colour pipeline");
  await page
    .getByLabel("Output transfer", { exact: true })
    .selectOption("gamma24");
  await page.getByRole("button", { name: "Add CST", exact: true }).click();
  await page
    .getByLabel("CST to transfer", { exact: true })
    .selectOption("gamma22");
  await page
    .getByLabel("CST to primaries", { exact: true })
    .selectOption("display-p3");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("CST to primaries", { exact: true }),
  ).toHaveValue("rec709");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.locator(".react-flow__node-cst")).toHaveCount(2);
  await expect(page.getByLabel("CST to transfer", { exact: true })).toHaveValue(
    "gamma22",
  );
  await expect(
    page.getByLabel("CST to primaries", { exact: true }),
  ).toHaveValue("display-p3");
  await expect(page.getByLabel("Output transfer", { exact: true })).toHaveValue(
    "gamma24",
  );
});
