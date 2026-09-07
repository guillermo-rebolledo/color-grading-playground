import { test, expect } from "@playwright/test";

test("sample browsing preserves viewer space and returns keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  const viewer = page.getByRole("region", {
    name: "Viewer",
    exact: true,
    includeHidden: true,
  });
  const before = await viewer.boundingBox();
  const browse = page.getByRole("button", { name: "Browse samples" });
  await browse.click();
  expect(await viewer.boundingBox()).toEqual(before);
  await page
    .getByRole("button", { name: "Mount Tamalpais west", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(browse).toBeFocused();
  await expect(page.getByLabel("Sample provenance")).not.toHaveAttribute(
    "open",
  );
  const image = await page.getByLabel("Graded image preview").boundingBox();
  expect(image!.height).toBeGreaterThan(350);
  await browse.click();
  await page.keyboard.press("Escape");
  await expect(browse).toBeFocused();
});

test("beginners can reveal help and experts can reach colour setup and export by keyboard", async ({
  page,
}) => {
  await page.goto("/");
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const pipeline = inspector.getByRole("button", {
    name: "Colour pipeline",
    exact: true,
  });
  const input = page.getByLabel("Input transfer", { exact: true });
  await expect(input).toBeHidden();
  await pipeline.focus();
  await pipeline.press("Enter");
  await expect(input).toBeVisible();
  await input.selectOption("slog3");
  await pipeline.click();
  await expect(pipeline).toContainText("S-Log3");
  const exportSection = inspector.getByRole("button", { name: /^LUT EXPORT/ });
  await exportSection.focus();
  await exportSection.press("Enter");
  await expect(
    page.getByRole("button", { name: "Export .cube", exact: true }),
  ).toBeVisible();
  await exportSection.click();
  await inspector
    .locator("summary")
    .filter({ hasText: "Getting started" })
    .click();
  await expect(
    inspector.getByText(
      "Select a node in the graph and adjust its controls here. Start with Exposure.",
    ),
  ).toBeVisible();
});
