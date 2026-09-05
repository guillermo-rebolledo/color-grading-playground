import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const inventory: typeof import("../public/samples/inventory.json") = JSON.parse(
  readFileSync("public/samples/inventory.json", "utf8"),
);

test("browse all bundled samples with verified tags and keep the grade", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Browse samples" }).click();
  const gallery = page.getByRole("region", { name: "Bundled log samples" });
  await expect(gallery.getByRole("button")).toHaveCount(9);
  await page.getByLabel("Exposure in stops").fill("-2");
  let previous: Buffer | undefined;
  for (const sample of inventory.assets) {
    const choice = gallery.getByRole("button", {
      name: sample.title,
      exact: true,
    });
    await expect(choice.locator("img")).toBeVisible();
    await expect
      .poll(() =>
        choice
          .locator("img")
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    await choice.focus();
    await page.keyboard.press("Enter");
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByLabel("Input transfer", { exact: true }),
    ).toHaveValue(sample.encoding.transfer);
    await expect(
      page.getByLabel("Input primaries", { exact: true }),
    ).toHaveValue(sample.encoding.primaries);
    await expect(page.getByLabel("Exposure in stops")).toHaveValue("-2.00");
    await expect(page.getByLabel("Sample provenance")).toContainText(
      "16-bit · full range",
    );
    await expect(
      page
        .getByLabel("Sample provenance")
        .getByRole("link", { name: "Original source" }),
    ).toHaveAttribute("href", sample.sourceUrl);
    const rendered = await page.getByLabel("Graded image preview").screenshot();
    if (previous) expect(rendered.equals(previous)).toBe(false);
    previous = rendered;
  }
});

test("failed sample requests preserve the image, source tags and edits, then allow retry", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Browse samples" }).click();
  const gallery = page.getByRole("region", { name: "Bundled log samples" });
  const desk = gallery.getByRole("button", {
    name: "Desk by stained-glass window",
    exact: true,
  });
  const tree = gallery.getByRole("button", {
    name: "Sunlit tree",
    exact: true,
  });
  await desk.click();
  await expect(desk).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Exposure in stops").fill("-2");
  await page.getByLabel("Exposure in stops").press("Tab");
  const canvas = page.getByLabel("Graded image preview");
  const before = await canvas.screenshot();
  for (const failure of ["http", "decode", "network"]) {
    await page.route("**/samples/tree.png", (route) =>
      failure === "network"
        ? route.abort()
        : route.fulfill({
            status: failure === "http" ? 503 : 200,
            body: "broken image",
          }),
    );
    await tree.click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(desk).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByLabel("Input transfer", { exact: true }),
    ).toHaveValue("logc3");
    await expect(page.getByLabel("Exposure in stops")).toHaveValue("-2.00");
    expect((await canvas.screenshot()).equals(before)).toBe(true);
    await page.unroute("**/samples/tree.png");
  }
  await tree.click();
  await expect(tree).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(async () => (await canvas.screenshot()).equals(before))
    .toBe(false);
});

test("a slow sample cannot replace a newer chart selection or its provenance", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Browse samples" }).click();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/samples/desk.png", async (route) => {
    await pending;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Desk by stained-glass window", exact: true })
    .click();
  await expect(page.getByText("Opening image…", { exact: true })).toBeVisible();
  await page.getByLabel("Load precision chart").selectOption("slog3");
  const canvas = page.getByLabel("Graded image preview");
  const before = await canvas.screenshot();
  const response = page.waitForResponse("**/samples/desk.png");
  release();
  await (await response).finished();
  await expect(page.getByLabel("Input transfer", { exact: true })).toHaveValue(
    "slog3",
  );
  await expect(page.getByLabel("Sample provenance")).toHaveCount(0);
  expect((await canvas.screenshot()).equals(before)).toBe(true);
});
