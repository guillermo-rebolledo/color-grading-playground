import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { offlinePlugin } from "./scripts/offline-plugin.ts";
export default defineConfig({
  plugins: [react(), tailwindcss(), offlinePlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
