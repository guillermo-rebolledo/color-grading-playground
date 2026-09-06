import { test, expect } from "@playwright/test";
import { openNeutralGraph } from "./fixtures";

test("holding a button shows feedback distinct from hover", async ({
  page,
}) => {
  await openNeutralGraph(page);
  const button = page.getByRole("button", {
    name: "Browse samples",
    exact: true,
  });
  await button.hover();
  await page.waitForTimeout(100);
  const fill = () =>
    button.evaluate((element) => getComputedStyle(element).backgroundColor);
  const hovered = await fill();
  await page.mouse.down();
  await expect.poll(fill).not.toBe(hovered);
  await page.mouse.up();
  await expect(button).toHaveAttribute("aria-expanded", "true");
});
