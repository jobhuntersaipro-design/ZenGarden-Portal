#!/usr/bin/env bash
# Idempotent repository bootstrap for local / Cloud Agent development.
#
# The Loving Hands Portal is built for Neon (Postgres over Neon's serverless
# WebSocket driver) plus R2, Resend, Anthropic and Google. This script stands up
# a local, offline-friendly equivalent of the database half: a plain PostgreSQL
# reached through a tiny WebSocket proxy that emulates Neon's `wsproxy`
# (scripts/dev/neon-local-proxy.mjs). The other integrations run only when real
# keys are supplied; the app boots without them.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

DB_USER="lovinghands"
DB_PASSWORD="lovinghands"
DB_NAME="loving_hands_portal"

echo "==> Ensuring PostgreSQL is installed"
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
fi

# Discover the installed cluster version (e.g. 16) rather than hard-coding it.
PG_VER="$(ls /usr/lib/postgresql/ | sort -n | tail -1)"
echo "==> Using PostgreSQL ${PG_VER}"

echo "==> Starting PostgreSQL cluster"
sudo pg_ctlcluster "${PG_VER}" main start 2>/dev/null || true
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then break; fi
  sleep 1
done

echo "==> Ensuring role and database exist"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}' CREATEDB"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
fi

echo "==> Installing Node dependencies"
npm install

echo "==> Ensuring .env.local exists"
if [ ! -f .env.local ]; then
  cp scripts/dev/env.local.example .env.local
  echo "    wrote .env.local from scripts/dev/env.local.example"
fi

echo "==> Generating Prisma client and applying migrations"
npx prisma generate
npx prisma migrate deploy

echo "==> Seeding the database (via a temporary WebSocket proxy)"
# The seed uses the Neon driver, so the proxy must be up while it runs. Start it
# just for the seed, then stop it; the long-lived proxy is a terminal at runtime.
node scripts/dev/neon-local-proxy.mjs >/tmp/neon-proxy-install.log 2>&1 &
PROXY_PID=$!
trap 'kill "${PROXY_PID}" 2>/dev/null || true' EXIT
sleep 1
# seed.ts refuses to run against a database that already has purchase orders, so
# re-running install is safe; swallow that expected non-zero exit.
NEON_LOCAL=1 NODE_OPTIONS="--import ./scripts/dev/neon-local-preload.mjs" \
  npx tsx --env-file=.env.local prisma/seed.ts || \
  echo "    seed skipped (database already populated)"
kill "${PROXY_PID}" 2>/dev/null || true
trap - EXIT

echo "==> Install complete"
