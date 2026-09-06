import { test, expect } from "@playwright/test";

// Fonts must ship in the build output: the offline service worker precaches
// build output only, and a third-party request would contradict the standing
// "nothing leaves your device" guarantee. The production build is the seam
// that proves it (see playwright.config.ts and tests/offline.spec.ts).
const origin = "http://127.0.0.1:4173";
test.use({ baseURL: origin });

test("serves its typefaces from its own build output", async ({
  page,
  context,
}) => {
  const foreign: string[] = [];
  context.on("request", (request) => {
    if (!request.url().startsWith(origin)) foreign.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByLabel("Project status")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  // A face only reaches "loaded" once the page renders text in it, so this
  // says both families are in use, without asserting any computed style.
  const loaded = await page.evaluate(() =>
    [...document.fonts]
      .filter((face) => face.status === "loaded")
      .map((face) => face.family),
  );
  expect(loaded).toContain("IBM Plex Sans");
  expect(loaded).toContain("IBM Plex Mono");

  const fontRequests = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => /\.(woff2?|ttf|otf|eot)(\?|$)/.test(entry.name))
      .map((entry) => entry.name),
  );
  expect(fontRequests.length).toBeGreaterThan(0);
  for (const url of fontRequests) expect(url.startsWith(origin)).toBe(true);
  expect(foreign).toEqual([]);
});
