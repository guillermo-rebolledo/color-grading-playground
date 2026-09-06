import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { offlinePlugin } from "./scripts/offline-plugin.ts";
export default defineConfig({ plugins: [react(), offlinePlugin()] });
