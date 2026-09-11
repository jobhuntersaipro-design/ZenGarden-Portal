#!/usr/bin/env bash
# Offline fallback: local PostgreSQL behind the Neon WebSocket proxy.
# Only used when USE_LOCAL_NEON_PROXY=1. Never talks to Neon or production.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

DB_USER="lovinghands"
DB_PASSWORD="lovinghands"
DB_NAME="loving_hands_portal"

cmd="${1:-install}"

ensure_postgres() {
  echo "==> Ensuring PostgreSQL is installed"
  if ! command -v pg_ctlcluster >/dev/null 2>&1; then
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
  fi
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
}

start_postgres() {
  PG_VER="$(ls /usr/lib/postgresql/ 2>/dev/null | sort -n | tail -1)"
  if [ -z "${PG_VER}" ]; then
    echo "PostgreSQL is not installed; run USE_LOCAL_NEON_PROXY=1 bash scripts/dev/cloud-agent-install.sh first." >&2
    exit 1
  fi
  echo "==> Starting PostgreSQL ${PG_VER}"
  sudo pg_ctlcluster "${PG_VER}" main start 2>/dev/null || true
  for _ in $(seq 1 30); do
    if sudo -u postgres pg_isready -q; then
      echo "==> PostgreSQL is ready"
      exit 0
    fi
    sleep 1
  done
  echo "PostgreSQL did not become ready in time." >&2
  exit 1
}

case "$cmd" in
  install)
    ensure_postgres
    if [ ! -f .env.local ]; then
      cp scripts/dev/env.local.example .env.local
      echo "    wrote .env.local from scripts/dev/env.local.example"
    fi
    npx prisma generate
    npx prisma migrate deploy
    echo "==> Seeding the local database (via a temporary WebSocket proxy)"
    node scripts/dev/neon-local-proxy.mjs >/tmp/neon-proxy-install.log 2>&1 &
    PROXY_PID=$!
    trap 'kill "${PROXY_PID}" 2>/dev/null || true' EXIT
    sleep 1
    NEON_LOCAL=1 NODE_OPTIONS="--import ./scripts/dev/neon-local-preload.mjs" \
      npx tsx --env-file=.env.local prisma/seed.ts || \
      echo "    seed skipped (database already populated)"
    kill "${PROXY_PID}" 2>/dev/null || true
    trap - EXIT
    ;;
  start)
    start_postgres
    ;;
  *)
    echo "Usage: $0 [install|start]" >&2
    exit 1
    ;;
esac
