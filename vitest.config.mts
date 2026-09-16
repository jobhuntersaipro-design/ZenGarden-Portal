import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      /**
       * `server-only` throws by design under every export condition but
       * `react-server`, which is how it stops a client component importing a
       * server module (Phase 37 marks the PDF renderer with it). Vitest runs
       * under `default`, so a plain import throws before any test runs. This
       * points at the very file the `react-server` condition resolves to —
       * the package's own empty module — rather than stubbing it out, so the
       * marker still does its job in the build and is inert here.
       */
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
});
