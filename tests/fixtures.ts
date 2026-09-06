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

// Export is collapsed by default; workflows open it as a colourist would.
export async function openLutExport(page: Page) {
  const toggle = page.getByRole("button", { name: /^LUT EXPORT/ });
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click();
}
