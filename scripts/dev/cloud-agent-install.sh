#!/usr/bin/env bash
# Idempotent repository bootstrap for local / Cloud Agent development.
#
# Default path: npm install, generate the Prisma client, and — when
# VERCEL_TOKEN is set — pull Vercel Preview into .env.local (dev Neon +
# loving-hands-portal-dev). Never migrates or seeds a remote database.
#
# Offline fallback (local Postgres + Neon wsproxy): USE_LOCAL_NEON_PROXY=1
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> Installing Node dependencies"
npm install

if [ "${USE_LOCAL_NEON_PROXY:-}" = "1" ]; then
  echo "==> USE_LOCAL_NEON_PROXY=1 — installing local Postgres fallback"
  bash scripts/dev/setup-local-postgres.sh install
elif [ -n "${VERCEL_TOKEN:-}" ]; then
  echo "==> Wiring .env.local from Vercel Preview"
  bash scripts/dev/wire-preview-env.sh
  echo "==> Generating Prisma client"
  npx prisma generate
else
  echo "==> VERCEL_TOKEN is not set; skipping Preview env pull."
  echo "    Add a secret named VERCEL_TOKEN and re-run scripts/dev/wire-preview-env.sh"
  echo "    Offline fallback: USE_LOCAL_NEON_PROXY=1 bash scripts/dev/cloud-agent-install.sh"
  echo "==> Generating Prisma client (no .env.local yet; generate does not connect)"
  DIRECT_URL="${DIRECT_URL:-postgresql://127.0.0.1:5432/loving_hands_portal}" \
    npx prisma generate
fi

echo "==> Install complete"
