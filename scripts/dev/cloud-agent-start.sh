#!/usr/bin/env bash
# Per-boot runtime initialization for local / Cloud Agent development.
# Brings PostgreSQL back up on every start (its process does not survive a
# reboot or a snapshot restore, even though its data directory does). The
# WebSocket proxy and the Next.js dev server run as `terminals` in
# .cursor/environment.json so their logs stay visible and restartable.
set -euo pipefail

PG_VER="$(ls /usr/lib/postgresql/ 2>/dev/null | sort -n | tail -1)"
if [ -z "${PG_VER}" ]; then
  echo "PostgreSQL is not installed; run scripts/dev/cloud-agent-install.sh first." >&2
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
