// Run against the local Vite dev server. Only display thumbnails are quantized
// to 8-bit sRGB; original grading assets and inventory remain untouched.
import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const { assets } = JSON.parse(
  await readFile(new URL("public/samples/inventory.json", root), "utf8"),
);
await mkdir(new URL("public/samples/previews/", root), { recursive: true });
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5173");
  for (const asset of assets) {
    const png = await page.evaluate(async (asset) => {
      const { loadImage } = await import("/src/engine/loadImage.ts");
      const { GradingEngine, createGraph } =
        await import("/src/engine/GradingEngine.ts");
      const response = await fetch(`/samples/${asset.file}`);
      if (!response.ok) throw new Error(`Missing ${asset.file}`);
      const loaded = await loadImage(
        new File([await response.blob()], asset.file),
      );
      const canvas = document.createElement("canvas");
      const engine = new GradingEngine(canvas);
      try {
        const graph = createGraph();
        graph.colour.input = asset.encoding;
        engine.setImage(loaded.bitmap);
        engine.render(graph);
        const preview = document.createElement("canvas");
        const scale = Math.min(240 / canvas.width, 150 / canvas.height);
        preview.width = Math.round(canvas.width * scale);
        preview.height = Math.round(canvas.height * scale);
        preview
          .getContext("2d")
          .drawImage(canvas, 0, 0, preview.width, preview.height);
        return preview.toDataURL("image/png").split(",")[1];
      } finally {
        engine.dispose();
        if ("close" in loaded.bitmap) loaded.bitmap.close();
      }
    }, asset);
    await writeFile(
      new URL(`public/samples/previews/${asset.id}.png`, root),
      Buffer.from(png, "base64"),
    );
  }
} finally {
  await browser.close();
}
