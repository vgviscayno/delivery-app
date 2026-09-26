import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  // One .env.local at the repo root, so the console and the db scripts are configured
  // in the same place.
  envDir: repoRoot,
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
