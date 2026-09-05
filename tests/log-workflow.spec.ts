import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

for (const profile of [
  {
    transfer: "logc3",
    primaries: "arri-wide-gamut3",
    name: "ARRI LogC3 EI 800",
  },
  { transfer: "slog3", primaries: "sgamut3-cine", name: "Sony S-Log3" },
]) {
  test(`${profile.name} precision chart grades live and keeps log output display managed`, async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByLabel("Load precision chart")
      .selectOption(profile.transfer);
    await expect(
      page.getByLabel("Input transfer", { exact: true }),
    ).toHaveValue(profile.transfer);
    await expect(
      page.getByLabel("Input primaries", { exact: true }),
    ).toHaveValue(profile.primaries);
    await expect(
      page.getByText(`${profile.name} · synthetic precision chart`, {
        exact: true,
      }),
    ).toBeVisible();
    const canvas = page.getByLabel("Graded image preview");
    async function grey() {
      const png = PNG.sync.read(await canvas.screenshot());
      return png.data[
        (Math.floor(png.height / 4) * png.width +
          Math.floor((png.width * 2.5) / 6)) *
          4
      ];
    }
    // Third top patch: 18% linear grey -> 118 sRGB CV, then +1 stop -> 162.
    await expect.poll(grey).toBeGreaterThanOrEqual(117);
    expect(await grey()).toBeLessThanOrEqual(119);
    const exposure = page.getByLabel("Exposure in stops", { exact: true });
    await exposure.fill("1");
    await exposure.press("Enter");
    await expect.poll(grey).toBeGreaterThanOrEqual(161);
    expect(await grey()).toBeLessThanOrEqual(163);
    await page
      .getByLabel("Output transfer", { exact: true })
      .selectOption(profile.transfer);
    await page
      .getByLabel("Output primaries", { exact: true })
      .selectOption(profile.primaries);
    await expect.poll(grey).toBeGreaterThanOrEqual(161);
    expect(await grey()).toBeLessThanOrEqual(163);
    await page.getByRole("button", { name: "Add CST", exact: true }).click();
    await page
      .getByLabel("CST to transfer", { exact: true })
      .selectOption(profile.transfer);
    await page
      .getByLabel("CST to primaries", { exact: true })
      .selectOption(profile.primaries);
    await expect(
      page.getByLabel("CST to transfer", { exact: true }),
    ).toHaveValue(profile.transfer);
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
