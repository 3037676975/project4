#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_dir}"

# Re-running is safe: only unapplied local D1 migrations are executed.
CI=1 npx wrangler d1 migrations apply DB \
  --local \
  --config "${project_dir}/wrangler.private.jsonc" \
  --persist-to "${project_dir}/.wrangler/state"

# This project is built for the Cloudflare Workers runtime. The production
# build must be served by Wrangler/Miniflare locally; `vinext start` would run
# it as a plain Node server and cannot load the `cloudflare:` module scheme.
exec npm run start
