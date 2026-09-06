import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
    },
    {
      // Offline caching only exists in the production build (tests/offline.spec.ts).
      command:
        "npx vite build --outDir dist-test --logLevel warn && npx vite preview --outDir dist-test --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      // Never test against a stale preview build.
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
