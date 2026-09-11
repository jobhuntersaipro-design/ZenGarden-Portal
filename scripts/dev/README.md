# Local / Cloud Agent development environment

The portal is built for [Neon](https://neon.tech) — Postgres accessed through
Neon's **serverless WebSocket driver** (`@neondatabase/serverless` +
`@prisma/adapter-neon`). There is no Neon in a local or Cloud Agent VM, so this
folder provides an offline-friendly stand-in for the database. R2, Resend,
Anthropic and Google are left as placeholders; the app boots without them and
those features light up only when you supply real keys.

## How it works

`@neondatabase/serverless` does not open a TCP connection to Postgres — it tunnels
the Postgres wire protocol over a WebSocket to Neon's `wsproxy`. To run against a
plain local Postgres we recreate that one piece:

- **`neon-local-proxy.mjs`** — a ~40-line WebSocket ⇄ TCP proxy. Each WebSocket
  connection carries `?address=host:port`; the proxy opens that TCP socket to the
  local Postgres and pipes bytes both ways. This is exactly the contract Neon's
  own `wsproxy` implements.
- **`neon-local-preload.mjs`** — preloaded with `node --import` into every process
  that talks to the database (the Next.js dev server and `prisma db seed`). It
  points `neonConfig` at the proxy (plain `ws://`, no TLS) instead of Neon.
  It is a no-op unless `NEON_LOCAL=1`, so it can never affect production.

Two details make this reliable:

1. `@neondatabase/serverless` ships **both** a CommonJS and an ESM build, each with
   its own `neonConfig` singleton. `@prisma/adapter-neon` `require`s the CJS copy
   while `import` resolves the ESM copy, so the preload configures **both**.
2. `next.config.ts` lists the driver in `serverExternalPackages` so Turbopack does
   not bundle a *third* copy of `neonConfig` that the preload could not reach.

## Files

| File | Role |
| --- | --- |
| `cloud-agent-install.sh` | Idempotent bootstrap: install Postgres, create the role/db, `npm install`, generate the Prisma client, `migrate deploy`, seed. Wired as `install` in `.cursor/environment.json`. |
| `cloud-agent-start.sh` | Per-boot: start the Postgres cluster. Wired as `start`. |
| `neon-local-proxy.mjs` | The WebSocket ⇄ TCP proxy. Runs as the `neon-proxy` terminal. |
| `neon-local-preload.mjs` | Points the Neon driver at the proxy when `NEON_LOCAL=1`. |
| `env.local.example` | Template copied to `.env.local` when none exists. |

## Running by hand

```bash
bash scripts/dev/cloud-agent-install.sh          # one-time setup + seed
bash scripts/dev/cloud-agent-start.sh            # ensure Postgres is up
node scripts/dev/neon-local-proxy.mjs &          # WebSocket proxy on :5433
NEON_LOCAL=1 NODE_OPTIONS="--import ./scripts/dev/neon-local-preload.mjs" npm run dev
```

Then sign in at http://localhost:3000/signin. The seed creates
`aisha@lovinghandsportal.com` (password `Password123!`, forced to change on first
login) and a super admin at the `SEED_SUPER_ADMIN_EMAIL` address (Google-only by
default — give it a password in the DB if you want to sign in without Google).
