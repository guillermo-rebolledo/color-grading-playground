import { test, expect } from "@playwright/test";
import { openNeutralGraph, openLutExport } from "./fixtures";

test("measure, overlay, download the measured artifact, and invalidate changed settings", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await openLutExport(page);
  await expect(
    page.getByRole("button", { name: "Measure LUT fidelity", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Load precision chart").selectOption("slog3");
  await page
    .getByRole("button", { name: "Measure LUT fidelity", exact: true })
    .click();
  const report = page.getByRole("region", { name: "LUT fidelity report" });
  await expect(report).toContainText("RGBA32F");
  await expect(report).toContainText("Trilinear");
  await expect(report).toContainText("P95");
  await page.getByRole("checkbox", { name: "Show LUT error overlay" }).check();
  await expect(
    page.getByLabel("LUT error overlay", { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export .cube", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("Grade.cube");
  await page.getByLabel("LUT interpolation").selectOption("tetrahedral");
  await expect(report).toHaveCount(0);
  await expect(
    page.getByLabel("LUT error overlay", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Settings changed. Measure again."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Measure LUT fidelity", exact: true })
    .click();
  await expect(report).toContainText("Tetrahedral");
  await page.getByLabel("LUT output range").selectOption("unbounded");
  await expect(report).toHaveCount(0);
});
