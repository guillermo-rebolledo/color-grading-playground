import { test, expect, type Locator, type Page } from "@playwright/test";
import { openNeutralGraph } from "./fixtures";

/** The focus indicator is a border and a ring rather than an outline, so this
 * asks the question the way a keyboard user would: is there something drawn
 * around the control I just moved to that was not drawn before? It reads the
 * indicator's presence, never its colour — the colour is a decision recorded in
 * the token block, and a test that repeated it would only have to be rewritten
 * by the next palette change.
 *
 * Every read of it is polled. The border colour crosses the motion budget's
 * 80ms on its way to the indicator, so a single read can catch it mid-way and
 * see the resting colour it started from. */
function indicator(control: Locator) {
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    return { shadow: style.boxShadow, border: style.borderColor };
  });
}

const shadowOf = (control: Locator) => () =>
  indicator(control).then((state) => state.shadow);
const borderOf = (control: Locator) => () =>
  indicator(control).then((state) => state.border);

test("focus-visible draws a visible indicator on a control in every region", async ({
  page,
}) => {
  await openNeutralGraph(page);
  const controls = [
    page.getByRole("button", { name: "Open image", exact: true }),
    page.getByLabel("Load precision chart"),
    page.getByRole("button", { name: "Save project", exact: true }),
  ];
  for (const control of controls) {
    const resting = await indicator(control);
    expect(resting.shadow).toBe("none");
    await control.focus();
    await expect(control).toBeFocused();
    await expect.poll(shadowOf(control)).not.toBe("none");
    await expect.poll(borderOf(control)).not.toBe(resting.border);
  }
});

test("focus-visible survives on an accent surface and on a field", async ({
  page,
}) => {
  await openNeutralGraph(page);
  // The empty state's call to action is the one accent-filled control on
  // screen, and the share link is the one field in the project bar.
  const accent = page.getByRole("button", { name: "Choose an image" });
  const restingAccent = await indicator(accent);
  await accent.focus();
  await expect.poll(shadowOf(accent)).not.toBe("none");
  await expect.poll(borderOf(accent)).not.toBe(restingAccent.border);

  await page.getByRole("button", { name: "Share grade", exact: true }).click();
  const field = page.getByLabel("Share link", { exact: true });
  const restingField = await indicator(field);
  expect(restingField.shadow).toBe("none");
  await field.focus();
  await expect.poll(shadowOf(field)).not.toBe("none");
});

test("a pressed toggle is distinguishable from a hovered one and a focused one", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await page.getByLabel("Load precision chart").selectOption("slog3");
  const toggle = page.getByRole("button", { name: "Out-of-range" });
  await expect(toggle).toBeEnabled();
  const fill = () =>
    toggle.evaluate((element) => getComputedStyle(element).backgroundColor);

  const resting = await fill();
  await toggle.hover();
  await expect
    .poll(fill, { message: "hover changes the fill" })
    .not.toBe(resting);
  const hovered = await fill();

  await page.mouse.move(0, 0);
  await toggle.focus();
  await expect.poll(fill).toBe(resting);
  await expect.poll(shadowOf(toggle)).not.toBe("none");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(0, 0);
  await expect
    .poll(fill, { message: "pressed is its own fill" })
    .not.toBe(resting);
  expect(await fill()).not.toBe(hovered);
});

/** Every state the application reaches with motion enabled, it also reaches
 * with the preference set — the durations go to zero, nothing else changes. */
async function reachEveryState(page: Page) {
  await openNeutralGraph(page);
  const samples = page.getByRole("button", { name: "Browse samples" });
  await samples.click();
  await expect(samples).toHaveAttribute("aria-expanded", "true");
  await samples.click();
  await expect(samples).toHaveAttribute("aria-expanded", "false");

  await page.getByLabel("Load precision chart").selectOption("slog3");
  await expect(page.getByLabel("Graded image preview")).toBeVisible();

  const toggle = page.getByRole("button", { name: "Out-of-range" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByLabel("Project status")).toContainText(
    "Saved on this device",
  );
  await page.getByRole("button", { name: "Share grade", exact: true }).click();
  await expect(page.getByLabel("Share link", { exact: true })).toBeVisible();
}

test("the application reaches every state with motion enabled", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await reachEveryState(page);
});

test("the application reaches every state under a reduced-motion preference", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await reachEveryState(page);
  const duration = await page
    .getByRole("button", { name: "Save project", exact: true })
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(new Set(duration.split(", "))).toEqual(new Set(["0s"]));
});
