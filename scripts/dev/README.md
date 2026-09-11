# Local / Cloud Agent development environment

Local `.env.local` is wired from **Vercel Preview** so Cloud Agents and laptops
hit the same places Preview deployments do: the Neon **development** branch
and the `loving-hands-portal-dev` R2 bucket. Production (`ep-polished-wildflower`,
bucket `loving-hands-portal`) is never written into `.env.local`, and these
scripts never run `migrate` or `seed` against a remote database.

## Preview path (default)

Needs a Vercel account token in `VERCEL_TOKEN` (Cloud Agent secret, or export
it locally). The CLI reads that variable; do not pass `--token` on the command
line.

```bash
bash scripts/dev/wire-preview-env.sh
npm run dev
```

What that does:

1. `vercel pull --environment=preview` (project settings + Preview env).
2. Host-only compare against Production's `DATABASE_URL`. If Preview is
   production Neon, the script refuses to write `.env.local`.
3. Writes gitignored `.env.local` with `APP_URL=http://localhost:3000`, blank
   `SHOP_HOST` / `SHOP_URL`, and `R2_BUCKET=loving-hands-portal-dev`.
4. Prints key names and the Neon `ep-…` prefix only. Never prints secret values.

`.env.local` is gitignored. Re-run the wire script when Preview env vars or the
OIDC token change (OIDC lasts ~12 hours).

## Offline fallback

When there is no Vercel token, a local Postgres plus a small WebSocket proxy
can stand in for Neon (`USE_LOCAL_NEON_PROXY=1`). That path is the only one
that migrates and seeds, and it only ever talks to `127.0.0.1`.

`@neondatabase/serverless` tunnels the Postgres wire protocol over a WebSocket
to Neon's `wsproxy`. The fallback recreates that one piece:

- **`neon-local-proxy.mjs`** — WebSocket ⇄ TCP proxy. Each connection carries
  `?address=host:port`; the proxy opens that TCP socket to local Postgres.
- **`neon-local-preload.mjs`** — preloaded with `node --import`; points
  `neonConfig` at the proxy when `NEON_LOCAL=1`, otherwise a no-op.

Two details make the fallback reliable:

1. `@neondatabase/serverless` ships **both** a CommonJS and an ESM build, each
   with its own `neonConfig` singleton. `@prisma/adapter-neon` `require`s the
   CJS copy while `import` resolves the ESM copy, so the preload configures
   **both**.
2. `next.config.ts` lists the driver in `serverExternalPackages` so Turbopack
   does not bundle a *third* copy of `neonConfig` that the preload could not
   reach.

```bash
USE_LOCAL_NEON_PROXY=1 bash scripts/dev/cloud-agent-install.sh
USE_LOCAL_NEON_PROXY=1 bash scripts/dev/cloud-agent-start.sh
node scripts/dev/neon-local-proxy.mjs &
NEON_LOCAL=1 NODE_OPTIONS="--import ./scripts/dev/neon-local-preload.mjs" npm run dev
```

The seed (fallback only) creates `aisha@lovinghandsportal.com` (password
`Password123!`, forced to change on first login) and a super admin at
`SEED_SUPER_ADMIN_EMAIL`.

## Files

| File | Role |
| --- | --- |
| `wire-preview-env.sh` | `vercel pull --environment=preview`, safety checks, write `.env.local`. |
| `preview-env.mjs` | Parse/serialize env, Neon host checks, local overrides. |
| `cloud-agent-install.sh` | `npm install`, `prisma generate`, Preview wire (or local Postgres if `USE_LOCAL_NEON_PROXY=1`). |
| `cloud-agent-start.sh` | Refresh Preview `.env.local`, or start local Postgres. |
| `setup-local-postgres.sh` | Offline Postgres install/start + migrate/seed. |
| `neon-local-proxy.mjs` | WebSocket ⇄ TCP proxy for the fallback. |
| `neon-local-preload.mjs` | Points the Neon driver at the proxy when `NEON_LOCAL=1`. |
| `env.local.example` | Placeholder template for the offline fallback only. |
