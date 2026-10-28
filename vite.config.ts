import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    // Points TanStack Start's server entry at src/server.ts (the SSR error wrapper).
    tanstackStart({ server: { entry: "server" } }),
    // Local Node server. The previous wrapper forced the Cloudflare Workers preset.
    nitro({ preset: "node-server" }),
    viteReact(),
  ],
  // The "@/*" alias comes from tsconfig.json paths.
  resolve: { tsconfigPaths: true },
});
