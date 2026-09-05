import { test, expect } from "@playwright/test";
import type { Encoding } from "../src/engine/colour";

test("bundled HDR stills decode and preserve their measured scene values through the engine", async ({
  page,
}) => {
  await page.goto("/");
  const response = await page.request.get("/samples/inventory.json");
  expect(response.headers()["content-type"]).toContain("application/json");
  const inventory = await response.json();
  expect(inventory.releaseReady).toBe(true);
  expect(inventory.releaseBlockers).toEqual([]);
  for (const scene of ["skin-tones", "tungsten-interior", "neutral-chart"])
    expect(
      inventory.assets.some(
        (asset: { scene: string }) => asset.scene === scene,
      ),
    ).toBe(true);
  expect(inventory.assets.length).toBeGreaterThanOrEqual(6);
  expect(inventory.assets.length).toBeLessThanOrEqual(10);
  for (const asset of inventory.assets) {
    const result = await page.evaluate(
      async (sample: {
        file: string;
        width: number;
        height: number;
        encoding: Encoding;
        probes: { x: number; y: number; linearRec709: number[] }[];
      }) => {
        const { loadImage } = (await import(
          /* @vite-ignore */ "/src/engine/loadImage.ts" as string
        )) as typeof import("../src/engine/loadImage");
        const { GradingEngine, createGraph } = (await import(
          /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
        )) as typeof import("../src/engine/GradingEngine");
        const blob = await (await fetch(`/samples/${sample.file}`)).blob();
        const loaded = await loadImage(new File([blob], sample.file));
        const engine = new GradingEngine(document.createElement("canvas"));
        try {
          const graph = createGraph();
          graph.colour.input = sample.encoding;
          graph.colour.output = { transfer: "linear", primaries: "rec709" };
          graph.nodes[2].data.clamp = "unbounded";
          engine.setImage(loaded.bitmap);
          engine.render(graph);
          const pixels = engine.readPixels();
          return {
            width: loaded.originalWidth,
            height: loaded.originalHeight,
            values: sample.probes.map(({ x, y }) =>
              Array.from(
                pixels.slice(
                  (y * sample.width + x) * 4,
                  (y * sample.width + x) * 4 + 4,
                ),
              ),
            ),
          };
        } finally {
          engine.dispose();
        }
      },
      asset,
    );
    expect(result.width).toBe(asset.width);
    expect(result.height).toBe(asset.height);
    asset.probes.forEach((probe: { linearRec709: number[] }, i: number) => {
      probe.linearRec709.forEach((value, c) => {
        // 16-bit log quantization plus float GPU transfer/gamut evaluation.
        expect(Math.abs(result.values[i][c] - value), asset.id).toBeLessThan(
          0.001 * Math.max(1, Math.abs(value)),
        );
      });
      expect(result.values[i][3]).toBe(1);
    });
    expect(Math.max(...result.values.flat())).toBeGreaterThan(1);
  }
});
