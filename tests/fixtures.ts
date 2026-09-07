import type { Page } from "@playwright/test";

// These import/editor workflows intentionally start with the neutral three-node fixture.
// The user-facing branching starter is exercised in blend.spec.ts.
export async function openNeutralGraph(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    const { useGraph } = await import(
      /* @vite-ignore */ "/src/graphStore.ts" as string
    );
    const { createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    useGraph.setState({
      graph: createGraph(),
      past: [],
      future: [],
      solo: null,
    });
  });
}

/** Open a disclosed workspace section through its actual UI. */
export async function revealInspector(
  page: Page,
  section: "Colour pipeline" | "Export LUT",
) {
  const summary = page
    .locator(".inspector summary")
    .filter({ hasText: section });
  if (
    !(await summary
      .locator("..")
      .evaluate((element) => element.hasAttribute("open")))
  )
    await summary.click();
}
