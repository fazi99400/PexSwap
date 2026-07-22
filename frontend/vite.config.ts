import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// For GitHub Pages the site is served from https://<user>.github.io/<repo>/ ,
// so the asset base must be "/<repo>/". The Pages workflow sets VITE_BASE.
// Locally (npm run dev) it defaults to "/".
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: { port: 5173, host: true },
});
