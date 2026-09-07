import { test, expect } from "@playwright/test";
import { openNeutralGraph } from "./fixtures";

test("both scopes can be read side by side at the default workspace width", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await page.getByLabel("Load precision chart").selectOption("slog3");
  const panel = page.getByRole("region", { name: "Image scopes" });
  await expect(panel.getByLabel("Scope status")).toContainText(
    "measured pixels",
  );
  const histogram = await panel
    .getByRole("img", { name: "RGB histogram" })
    .boundingBox();
  const parade = await panel
    .getByRole("img", { name: "RGB parade" })
    .boundingBox();
  expect(histogram).not.toBeNull();
  expect(parade).not.toBeNull();
  expect(Math.abs(histogram!.y - parade!.y)).toBeLessThan(1);
  expect(histogram!.x + histogram!.width).toBeLessThanOrEqual(parade!.x);
  const bounds = (await panel.boundingBox())!;
  expect(parade!.x + parade!.width).toBeLessThanOrEqual(
    bounds.x + bounds.width,
  );
});
