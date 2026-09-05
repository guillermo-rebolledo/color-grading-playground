import { openNeutralGraph } from "./fixtures";
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

for (const profile of [
  {
    transfer: "davinci-intermediate",
    primaries: "davinci-wide-gamut",
    code: 86,
  },
  { transfer: "apple-log", primaries: "rec2020", code: 125 },
]) {
  test(`${profile.transfer} source, working, output and CST selections retain separate primaries`, async ({
    page,
  }) => {
    await openNeutralGraph(page);
    // Independent full-range, near-18% neutral code fixtures (8-bit quantized).
    const png = new PNG({ width: 32, height: 32 });
    for (let i = 0; i < png.data.length; i += 4) {
      png.data.fill(profile.code, i, i + 3);
      png.data[i + 3] = 255;
    }
    await page.locator('input[type="file"]').setInputFiles({
      name: "neutral.png",
      mimeType: "image/png",
      buffer: PNG.sync.write(png),
    });
    for (const label of ["Input", "Working", "Output"]) {
      const transfer = page.getByLabel(`${label} transfer`, { exact: true });
      const primaries = page.getByLabel(`${label} primaries`, { exact: true });
      await primaries.selectOption("rec709");
      await transfer.selectOption(profile.transfer);
      await expect(primaries).toHaveValue("rec709");
      await primaries.selectOption(profile.primaries);
      await expect(transfer).toHaveValue(profile.transfer);
    }
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(
      page.getByLabel("Output primaries", { exact: true }),
    ).toHaveValue("rec709");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(
      page.getByLabel("Output primaries", { exact: true }),
    ).toHaveValue(profile.primaries);
    // Exposure expects linear working light. Source and output keep their log tags.
    await page
      .getByLabel("Working transfer", { exact: true })
      .selectOption("linear");
    const canvas = page.getByLabel("Graded image preview");
    async function grey() {
      const rendered = PNG.sync.read(await canvas.screenshot());
      return rendered.data[
        (Math.floor(rendered.height / 2) * rendered.width +
          Math.floor(rendered.width / 2)) *
          4
      ];
    }
    await expect.poll(grey).toBeGreaterThanOrEqual(117);
    expect(await grey()).toBeLessThanOrEqual(121);
    await page.getByRole("button", { name: "Add CST", exact: true }).click();
    for (const direction of ["from", "to"]) {
      const transfer = page.getByLabel(`CST ${direction} transfer`, {
        exact: true,
      });
      const primaries = page.getByLabel(`CST ${direction} primaries`, {
        exact: true,
      });
      await primaries.selectOption("rec709");
      await transfer.selectOption(profile.transfer);
      await expect(primaries).toHaveValue("rec709");
      await primaries.selectOption(profile.primaries);
      await expect(transfer).toHaveValue(profile.transfer);
    }
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(
      page.getByLabel("CST to primaries", { exact: true }),
    ).toHaveValue("rec709");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(
      page.getByLabel("CST to primaries", { exact: true }),
    ).toHaveValue(profile.primaries);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}
