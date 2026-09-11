#!/usr/bin/env bash
# Per-boot runtime initialization for local / Cloud Agent development.
#
# Default: refresh .env.local from Vercel Preview (OIDC + Preview secrets).
# Does not migrate or seed. Offline fallback: USE_LOCAL_NEON_PROXY=1.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [ "${USE_LOCAL_NEON_PROXY:-}" = "1" ]; then
  bash scripts/dev/setup-local-postgres.sh start
  exit 0
fi

if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "VERCEL_TOKEN is not set. Preview env cannot be pulled." >&2
  echo "Add a Cloud Agent secret named VERCEL_TOKEN, or run with USE_LOCAL_NEON_PROXY=1." >&2
  exit 1
fi

bash scripts/dev/wire-preview-env.sh
