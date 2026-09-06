import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { transformWithOxc, type Plugin, type ResolvedConfig } from "vite";
import {
  appCachePrefix,
  isFullSizeSample,
  sampleCachePrefix,
  samplePrefix,
} from "../src/offline/contract.ts";

function walk(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? walk(path, root)
      : ["/" + relative(root, path).split("\\").join("/")];
  });
}

/** Emits a versioned /sw.js after the build. Precache covers the app shell,
 * bundled assets and the small sample metadata, previews and licenses; the
 * full-size sample PNGs are cached on first request instead of at install. */
export function offlinePlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "color-grading-offline",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    async closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      const precache = walk(outDir)
        // Full-size samples are large; the worker caches them on first request.
        .filter((path) => path !== "/sw.js" && !isFullSizeSample(path))
        .sort();
      const digest = (paths: string[]) => {
        const hash = createHash("sha256");
        for (const path of paths) {
          hash.update(path);
          hash.update(readFileSync(join(outDir, path)));
        }
        return hash.digest("hex").slice(0, 16);
      };
      const manifest = {
        version: digest(precache),
        samplesVersion: digest(["/samples/inventory.json"]),
        precache,
        appCachePrefix,
        sampleCachePrefix,
        samplePrefix,
      };
      const source = readFileSync(
        resolve(config.root, "src/offline/sw.ts"),
        "utf8",
      );
      const { code } = await transformWithOxc(
        source.replace(
          /declare const __OFFLINE__: \{[^}]*\};/,
          () => `const __OFFLINE__ = ${JSON.stringify(manifest)};`,
        ),
        "sw.ts",
        { lang: "ts" },
      );
      writeFileSync(
        join(outDir, "sw.js"),
        code.replace(/^export \{\};?\s*$/m, ""),
      );
      config.logger.info(
        `offline: sw.js version ${manifest.version} precaching ${precache.length} files`,
      );
    },
  };
}
