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
  if (section === "Export LUT") return openLutExport(page);
  const toggle = page.getByRole("button", {
    name: "Colour pipeline",
    exact: true,
  });
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click();
}

export async function openLutExport(page: Page) {
  const toggle = page.getByRole("button", { name: /^LUT EXPORT/ });
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click();
}
