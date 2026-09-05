import { defineConfig, env } from "prisma/config";

// Prisma 7 does not read .env.local on its own. Locally we load it here; on
// Vercel the variables are already present in process.env and this is a no-op.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (CI, Vercel) — fall through to the real environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --env-file=.env.local prisma/seed.ts",
  },
  datasource: { url: env("DIRECT_URL") },
});
