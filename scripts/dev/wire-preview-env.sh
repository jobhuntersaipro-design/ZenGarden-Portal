#!/usr/bin/env bash
# Pull Vercel Preview env and write a local .env.local that points at the
# development Neon branch and the loving-hands-portal-dev R2 bucket.
#
# Never prints secret values. Refuses if Preview's DATABASE_URL is production
# (ep-polished-wildflower) or shares a host with Production. Does not migrate
# or seed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "VERCEL_TOKEN is not set. Add it as a Cloud Agent secret named VERCEL_TOKEN," >&2
  echo "or export it locally, then re-run this script." >&2
  exit 1
fi

# Vercel CLI reads VERCEL_TOKEN from the environment — do not pass --token
# (it would show up in the process list).
VERCEL=(npx --yes vercel@latest)

echo "==> Checking Vercel auth"
if ! "${VERCEL[@]}" whoami >/dev/null; then
  echo "Vercel auth failed. Check that VERCEL_TOKEN is a valid account token." >&2
  exit 1
fi

link_project() {
  if [ -f .vercel/project.json ]; then
    echo "==> Already linked (.vercel/project.json)"
    return 0
  fi

  mkdir -p .vercel
  if [ -n "${VERCEL_ORG_ID:-}" ] && [ -n "${VERCEL_PROJECT_ID:-}" ]; then
    printf '{"orgId":"%s","projectId":"%s"}\n' "$VERCEL_ORG_ID" "$VERCEL_PROJECT_ID" > .vercel/project.json
    echo "==> Linked from VERCEL_ORG_ID / VERCEL_PROJECT_ID"
    return 0
  fi

  local scope_args=()
  if [ -n "${VERCEL_ORG_ID:-}" ]; then
    scope_args+=(--scope "$VERCEL_ORG_ID")
  fi

  local candidates=(zen-garden-portal loving-hands-portal ZenGarden-Portal)
  if [ -n "${VERCEL_PROJECT_NAME:-}" ]; then
    candidates=("$VERCEL_PROJECT_NAME" "${candidates[@]}")
  fi

  local name
  for name in "${candidates[@]}"; do
    echo "==> Linking Vercel project ${name}"
    if "${VERCEL[@]}" link --yes --project "$name" "${scope_args[@]+"${scope_args[@]}"}"; then
      return 0
    fi
  done

  echo "Could not link a Vercel project. Set VERCEL_ORG_ID and VERCEL_PROJECT_ID, or VERCEL_PROJECT_NAME." >&2
  exit 1
}

link_project

echo "==> Pulling Preview environment (vercel pull --environment=preview)"
"${VERCEL[@]}" pull --yes --environment=preview

PREVIEW_FILE=".vercel/.env.preview.local"
if [ ! -f "$PREVIEW_FILE" ]; then
  echo "vercel pull did not write ${PREVIEW_FILE}" >&2
  exit 1
fi

PROD_FILE="$(mktemp)"
cleanup() {
  rm -f "$PROD_FILE"
}
trap cleanup EXIT

echo "==> Pulling Production env to a temp file for a host-only safety compare"
if ! "${VERCEL[@]}" env pull "$PROD_FILE" --yes --environment=production >/dev/null; then
  echo "    production compare skipped (env pull failed); will still refuse known production Neon hosts"
  rm -f "$PROD_FILE"
  PROD_FILE=""
fi

echo "==> Applying local overrides and production-safety checks"
node --input-type=module - "$PREVIEW_FILE" "$PROD_FILE" .env.local .env.example <<'JS'
import { readFileSync, writeFileSync } from "node:fs";
import {
  applyLocalOverrides,
  assertSafeForLocalDev,
  missingRequiredKeys,
  parseEnv,
  requiredKeysFromExample,
  serializeEnv,
} from "./scripts/dev/preview-env.mjs";

const [previewPath, prodPath, destPath, examplePath] = process.argv.slice(2);
const preview = parseEnv(readFileSync(previewPath, "utf8"));
const production =
  prodPath && prodPath !== ""
    ? parseEnv(readFileSync(prodPath, "utf8"))
    : null;

const safety = assertSafeForLocalDev(preview, production);
const wired = applyLocalOverrides(preview);
const required = requiredKeysFromExample(readFileSync(examplePath, "utf8"));
const missing = missingRequiredKeys(wired, required);

writeFileSync(destPath, serializeEnv(wired), { mode: 0o600 });

const pulledKeys = Object.keys(preview).sort().join(", ");
const missingReport = missing.length ? missing.join(", ") : "(none)";
console.log(`    Preview keys: ${pulledKeys}`);
console.log(`    Neon endpoint: ${safety.databaseEndpoint}`);
console.log(
  `    Known development branch: ${safety.isKnownDevelopment ? "yes" : "not the documented ep-mute-frog (still not production)"}`,
);
console.log("    R2_BUCKET: loving-hands-portal-dev");
console.log(`    Missing required keys: ${missingReport}`);
if (!safety.isKnownDevelopment) {
  console.warn(
    "    Warning: Preview Neon is not the documented development branch (ep-mute-frog). Migrations and seed stay skipped.",
  );
}
JS

echo "==> Wired .env.local from Preview (gitignored). No migrate/seed was run."
