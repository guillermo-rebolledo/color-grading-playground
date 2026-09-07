import { test, expect } from "@playwright/test";
import { openNeutralGraph } from "./fixtures";

test("inspector reports selection scope and resets the selected node", async ({
  page,
}) => {
  await openNeutralGraph(page);
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(
    inspector.getByText("1 / 3 selected", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add CDL", exact: true }).click();
  await expect(
    inspector.getByText("1 / 4 selected", { exact: true }),
  ).toBeVisible();
  const slope = inspector.getByRole("spinbutton", {
    name: "Slope R",
    exact: true,
  });
  await slope.fill("1.5");
  await slope.press("Enter");
  await inspector
    .getByRole("button", { name: "Reset CDL", exact: true })
    .click();
  await expect(slope).toHaveValue("1");
});

test("pipeline and export collapse independently and retain their settings", async ({
  page,
}) => {
  await openNeutralGraph(page);
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const pipeline = inspector.getByRole("button", {
    name: "Colour pipeline",
    exact: true,
  });
  const lut = inspector.getByRole("button", {
    name: /LUT export.*33³.*Trilinear/i,
  });
  await expect(pipeline).toHaveAttribute("aria-expanded", "false");
  await expect(lut).toHaveAttribute("aria-expanded", "false");
  await expect(inspector.getByLabel("LUT size")).toBeHidden();
  await expect(
    inspector.getByLabel("Input transfer", { exact: true }),
  ).toBeHidden();
  await lut.click();
  await inspector.getByLabel("LUT size").selectOption("17");
  await inspector.getByLabel("LUT interpolation").selectOption("tetrahedral");
  const updated = inspector.getByRole("button", {
    name: /LUT export.*17³.*Tetrahedral/i,
  });
  await updated.click();
  await expect(updated).toHaveAttribute("aria-expanded", "false");
  await updated.click();
  await expect(inspector.getByLabel("LUT size")).toHaveValue("17");
  await pipeline.click();
  await expect(
    inspector.getByText(/Input describes how the source/),
  ).toBeVisible();
});

test("encoding advisory names both branches without applying a conversion", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { useGraph } = await import(
      /* @vite-ignore */ "/src/graphStore.ts" as string
    );
    const { createStarterGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const graph = createStarterGraph();
    const warm = graph.nodes.find((node: { id: string }) => node.id === "warm");
    warm.type = "cst";
    warm.data = {
      from: { transfer: "linear", primaries: "rec709" },
      to: { transfer: "srgb", primaries: "rec709" },
    };
    useGraph.setState({ graph, past: [], future: [], solo: null });
  });
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(
    inspector.getByText("Branch A: Linear / Rec.709 · D65", { exact: true }),
  ).toBeVisible();
  await expect(
    inspector.getByText("Branch B: sRGB / Rec.709 · D65", { exact: true }),
  ).toBeVisible();
  await expect(
    inspector.getByText(/Nothing is inserted implicitly/),
  ).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
});
