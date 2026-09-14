// Local-dev only. Preloaded with `node --import` into any process that uses the
// Neon serverless driver (the Next.js dev server and `prisma db seed`). It points
// the driver at the local WebSocket proxy (scripts/dev/neon-local-proxy.mjs) and
// a plain, unencrypted Postgres, instead of Neon over TLS, so no application
// source needs to change. A no-op unless NEON_LOCAL=1 is set.
//
// `@neondatabase/serverless` ships both a CommonJS build (index.js) and an ESM
// build (index.mjs), each with its own `neonConfig` singleton. `@prisma/adapter-neon`
// pulls in the CJS copy via `require`, while `import` resolves the ESM copy — so
// both instances must be configured or the adapter silently keeps the Neon defaults
// (secure wss:// to :443) and fails against a local database.
import { createRequire } from "node:module";

if (process.env.NEON_LOCAL === "1") {
  const require = createRequire(import.meta.url);
  const ws = (await import("ws")).default;
  const port = process.env.NEON_LOCAL_PROXY_PORT ?? "5433";

  const apply = (neonConfig) => {
    if (!neonConfig) return;
    neonConfig.webSocketConstructor = ws;
    neonConfig.wsProxy = (host, dbPort) =>
      `127.0.0.1:${port}/v1?address=${host}:${dbPort}`;
    neonConfig.useSecureWebSocket = false; // plain ws:// to the local proxy
    neonConfig.forceDisablePgSSL = true; // local Postgres speaks no TLS
    neonConfig.pipelineConnect = false; // local auth is not cleartext password
  };

  try {
    apply((await import("@neondatabase/serverless")).neonConfig);
  } catch {
    // ESM build unavailable; the CJS copy below is what the adapter uses.
  }
  try {
    apply(require("@neondatabase/serverless").neonConfig);
  } catch {
    // CJS build unavailable in this resolution context.
  }
}
