// Render every look's preview through the real grading engine, over one
// reference frame, and record each file's SHA-256 in the inventory.
//
// Rendering through the engine rather than exporting an image by hand is what
// makes the gallery trustworthy: a preview cannot drift from the definition it
// claims to show, and scripts/verify-looks.mjs proves it has not.
//
// Run against the local dev server (npm run dev), as with the sample previews.
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const inventoryPath = new URL("public/looks/inventory.json", root);
const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
const samples = JSON.parse(
  await readFile(new URL("public/samples/inventory.json", root), "utf8"),
);

/** Skin tones and a wide range of values: the frame a look is judged on. */
const referenceId = inventory.reference?.sample ?? "canal-actors";
const reference = samples.assets.find((asset) => asset.id === referenceId);
if (!reference) throw new Error(`Unknown reference sample: ${referenceId}`);

await mkdir(new URL("public/looks/previews/", root), { recursive: true });
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5173");
  for (const look of inventory.looks) {
    const png = await page.evaluate(
      async ({ look, reference }) => {
        const { loadImage } = await import("/src/engine/loadImage.ts");
        const { GradingEngine, createGraph } =
          await import("/src/engine/GradingEngine.ts");
        const { withLook, findLook } = await import("/src/looks.ts");
        const response = await fetch(`/samples/${reference.file}`);
        if (!response.ok) throw new Error(`Missing ${reference.file}`);
        const loaded = await loadImage(
          new File([await response.blob()], reference.file),
        );
        const canvas = document.createElement("canvas");
        const engine = new GradingEngine(canvas);
        try {
          const base = createGraph();
          base.colour.input = reference.encoding;
          const graph = withLook(base, findLook(look.id));
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
      },
      { look, reference },
    );
    const bytes = Buffer.from(png, "base64");
    await writeFile(
      new URL(`public/looks/previews/${look.id}.png`, root),
      bytes,
    );
    look.preview = {
      file: `previews/${look.id}.png`,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      // The definition this preview was rendered from. verify-looks.mjs fails
      // when a look is edited and its preview is not re-rendered.
      definitionHash: null,
    };
    console.log(`rendered ${look.id}`);
  }
} finally {
  await browser.close();
}

const { lookHash } = await import("../src/engine/lookHash.ts");
for (const look of inventory.looks)
  look.preview.definitionHash = lookHash(look.nodes);
inventory.reference = {
  sample: reference.id,
  title: reference.title,
  license: reference.license,
};
await writeFile(inventoryPath, JSON.stringify(inventory, null, 2) + "\n");
console.log(`recorded ${inventory.looks.length} previews`);
