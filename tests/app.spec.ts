import { test, expect } from "@playwright/test";

test("load a private image, adjust exposure, reset, and recover from a bad file", async ({
  page,
}) => {
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH"].includes(request.method()))
      uploads.push(request.url());
  });
  await page.goto("/");
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
  await page.goto("/");
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
  await page.goto("/");
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
  await page.goto("/");
  await page.getByLabel("Choose image").setInputFiles({
    name: "alpha.png",
    mimeType: "image/png",
    buffer: PNG.sync.write(source),
  });
  const canvas = page.getByLabel("Graded image preview");
  await expect(canvas).toBeVisible();
  const screenshot = PNG.sync.read(await canvas.screenshot());
  const pixel = Array.from(screenshot.data.subarray(0, 3));
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
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("WebGL2 is unavailable");
  await expect(page.getByRole("button", { name: "Open image" })).toBeDisabled();
  await expect(page.getByRole("slider")).toBeDisabled();
});

test("caps uploaded preview dimensions while keeping original size visible", async ({
  page,
}) => {
  const { PNG } = await import("pngjs");
  const source = new PNG({ width: 4096, height: 16 });
  source.data.fill(255);
  await page.goto("/");
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
  await page.goto("/");
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
