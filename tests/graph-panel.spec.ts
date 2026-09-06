import { test, expect } from "@playwright/test";
import { openNeutralGraph } from "./fixtures";

test("graph instructions remain visible while the preview is paused", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await page.locator('.react-flow__node[data-id="exposure"]').click();
  await page
    .getByRole("button", { name: "Delete selection", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Preview paused");
  for (const instruction of [
    "RGB: solid",
    "Mask: dashed",
    "Double-click a node to solo",
    "Drag ports to connect",
    "Shift-drag to box select",
  ]) {
    await expect(page.getByText(instruction, { exact: true })).toBeVisible();
  }
});

test("graph toolbar reports zoom changes and fits the graph", async ({
  page,
}) => {
  await openNeutralGraph(page);
  const zoom = page.getByLabel("Graph zoom", { exact: true });
  await expect(zoom).toHaveText(/^\d+%$/);
  const initial = await zoom.textContent();
  await page.getByRole("button", { name: "Zoom In", exact: true }).click();
  await expect(zoom).not.toHaveText(initial!);
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  await expect(zoom).toHaveText(initial!);
});
