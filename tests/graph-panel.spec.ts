import { test, expect } from "@playwright/test";
import { openNeutralGraph } from "./fixtures";

test("graph help remains available while the preview is paused", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await page.locator('.react-flow__node[data-id="exposure"]').click();
  await page
    .getByRole("button", { name: "Delete selection", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Preview paused");
  await page.locator("summary").filter({ hasText: "Graph help" }).click();
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
  // The fixture replaces the starter graph; let its measured nodes fit before
  // recording the viewport that the toolbar should restore.
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  const initial = await zoom.textContent();
  await page.getByRole("button", { name: "Zoom In", exact: true }).click();
  await expect(zoom).not.toHaveText(initial!);
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  await expect(zoom).toHaveText(initial!);
});

test("graph navigation preserves zoom limits and the interaction lock", async ({
  page,
}) => {
  await openNeutralGraph(page);
  const zoom = page.getByLabel("Graph zoom", { exact: true });
  const zoomIn = page.getByRole("button", { name: "Zoom In", exact: true });
  const zoomOut = page.getByRole("button", { name: "Zoom Out", exact: true });
  for (let step = 0; step < 20 && (await zoomIn.isEnabled()); step++)
    await zoomIn.click();
  await expect(zoom).toHaveText("200%");
  await expect(zoomIn).toBeDisabled();
  for (let step = 0; step < 20 && (await zoomOut.isEnabled()); step++)
    await zoomOut.click();
  await expect(zoom).toHaveText("25%");
  await expect(zoomOut).toBeDisabled();
  await page.getByRole("button", { name: "Fit View", exact: true }).click();

  // Fit is scheduled by React Flow; wait for its viewport update before measuring.
  await expect(zoom).not.toHaveText("25%");
  const node = page.locator('.react-flow__node[data-id="exposure"]');
  const before = (await node.boundingBox())!;
  const drag = async () => {
    await page.mouse.move(
      before.x + before.width / 2,
      before.y + before.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      before.x + before.width / 2 + 48,
      before.y + before.height / 2,
      { steps: 6 },
    );
    await page.mouse.up();
  };
  const lock = page.getByRole("button", {
    name: "Toggle Interactivity",
    exact: true,
  });
  await lock.click();
  await drag();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  // Locked nodes allow canvas panning; fitting again distinguishes that from a node edit.
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  await expect
    .poll(async () => (await node.boundingBox())!.x)
    .toBeCloseTo(before.x, 0);
  await lock.click();
  await drag();
  expect((await node.boundingBox())!.x).toBeGreaterThan(before.x + 20);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await node.boundingBox())!.x).toBeCloseTo(before.x, 0);
});
