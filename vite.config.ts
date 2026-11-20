import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

/**
 * Vite rejects any Host header it does not know, which also blocks a temporary
 * tunnel (`cloudflared tunnel --url http://localhost:3000`). `VITE_ALLOWED_HOSTS`
 * adds the hostnames to trust, comma separated, only for the dev server.
 */
const tunnelHosts = (process.env["VITE_ALLOWED_HOSTS"] ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [
    tailwindcss(),
    // Points TanStack Start's server entry at src/server.ts (the SSR error wrapper).
    tanstackStart({ server: { entry: "server" } }),
    // Local Node server. The previous wrapper forced the Cloudflare Workers preset.
    // `inlineDynamicImports` keeps the SSR bundle in one file: splitting it per
    // package produced a cycle where the CJS helper (`__commonJSMin`) was still
    // uninitialized when a radix chunk used it, so the server 500ed at boot.
    nitro({ preset: "node-server", rollupConfig: { output: { inlineDynamicImports: true } } }),
    viteReact(),
  ],
  // The "@/*" alias comes from tsconfig.json paths.
  resolve: { tsconfigPaths: true },
  ...(tunnelHosts.length > 0 ? { server: { allowedHosts: tunnelHosts } } : {}),
});
