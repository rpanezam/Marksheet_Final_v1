import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    // SPA mode: no SSR, browser renders everything. Outputs dist/client/ with
    // _shell.html as the SPA entry point.
    spa: {
      enabled: true,
    },
  },
  // nitro disabled: plain Vite build to dist/client/ — served by nginx on Cloud Run.
  nitro: false,
});
