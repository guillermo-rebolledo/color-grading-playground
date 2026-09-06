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

  const faces = await page.evaluate(() =>
    [...document.fonts].map((face) => face.family),
  );
  expect(faces).toContain("IBM Plex Sans");
  expect(faces).toContain("IBM Plex Mono");

  const rendered = await page.evaluate(() => ({
    body: getComputedStyle(document.body).fontFamily,
    loaded: [...document.fonts]
      .filter((face) => face.status === "loaded")
      .map((face) => face.family),
  }));
  expect(rendered.body).toContain("IBM Plex Sans");
  expect(rendered.loaded).toContain("IBM Plex Sans");

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
