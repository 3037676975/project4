#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_dir}"

# The D1 CLI and the Cloudflare Vite runtime share this persistent directory.
# Re-running the command is safe: only unapplied migrations are executed.
CI=1 npx wrangler d1 migrations apply DB \
  --local \
  --config "${project_dir}/wrangler.private.jsonc" \
  --persist-to "${project_dir}/.wrangler/state"

exec npm run start -- --hostname 0.0.0.0 --port 3000
