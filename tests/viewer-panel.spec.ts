import { test, expect } from "@playwright/test";
import { openNeutralGraph } from "./fixtures";

test("viewer marks solo output and clears the indicator on exit", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await page.getByLabel("Load precision chart").selectOption("slog3");
  const viewer = page.getByRole("region", { name: "Viewer", exact: true });
  await expect(viewer.getByText("SOLO", { exact: true })).toHaveCount(0);
  const source = page.getByRole("heading", { name: "Source", exact: true });
  await source.click();
  await expect(
    page
      .getByRole("complementary", { name: "Inspector" })
      .getByRole("heading", { name: "Source", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Grading graph" })
    .getByRole("heading", { name: "Source", exact: true })
    .dblclick({ delay: 100 });
  await expect(viewer.getByText("SOLO", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Exit solo", exact: true }).click();
  await expect(viewer.getByText("SOLO", { exact: true })).toHaveCount(0);
});

test("opening progress is text in the viewer chrome, clear of the image", async ({
  page,
}) => {
  await openNeutralGraph(page);
  const inventory = await (
    await page.request.get("/samples/inventory.json")
  ).json();
  const sample = inventory.assets[0];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/samples/${sample.file}`, async (route) => {
    await pending;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Browse samples", exact: true })
    .click();
  await page.getByRole("button", { name: sample.title, exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const viewer = page.getByRole("region", { name: "Viewer", exact: true });
  const status = viewer
    .getByRole("status")
    .filter({ hasText: "Opening image…" });
  try {
    await expect(status).toBeVisible();
    await expect(viewer.getByRole("progressbar")).toHaveCount(0);
    const progress = await status.boundingBox();
    const frame = await viewer
      .getByLabel("Pan image with arrow keys")
      .boundingBox();
    expect(progress!.y + progress!.height).toBeLessThanOrEqual(frame!.y);
  } finally {
    release();
  }
  await expect(status).toHaveCount(0);
  await expect(viewer.getByLabel("Graded image preview")).toBeVisible();
});
