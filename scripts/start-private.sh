#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_dir}"

# Re-running is safe: only unapplied local D1 migrations are executed.
CI=1 npx wrangler d1 migrations apply DB \
  --local \
  --config "${project_dir}/wrangler.private.jsonc" \
  --persist-to "${project_dir}/.wrangler/state"

# The production bundle is generated during docker build, while private
# deployment secrets are only available when the container starts. Inject
# those runtime bindings into a container-local Wrangler config so Worker code
# can read them through `cloudflare:workers` env. Do not bake secrets into the
# image or commit them to Git.
runtime_config="${project_dir}/dist/server/wrangler.private-runtime.json"
RUNTIME_CONFIG="${runtime_config}" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const source = path.resolve("dist/server/wrangler.json");
const target = process.env.RUNTIME_CONFIG;
const config = JSON.parse(fs.readFileSync(source, "utf8"));
const keys = [
  "APP_ENV", "APP_BASE_URL", "LOCAL_OCR_MODE",
  "LOCAL_AUTH_EMAIL", "LOCAL_AUTH_NAME", "LOCAL_ADMIN_PASSWORD", "LOCAL_AUTH_SESSION_SECRET",
  "PLATFORM_ADMIN_EMAILS", "CONFIG_ENCRYPTION_KEY",
  "PARSER_API_KEY", "DEEPSEEK_API_KEY",
  "PAYMENT_MODE", "PAYMENT_PROVIDER", "PAYMENT_CHECKOUT_URL", "PAYMENT_REFUND_URL", "PAYMENT_CALLBACK_SECRET", "PAYMENT_MERCHANT_ID",
  "OPERATIONS_SWEEP_SECRET",
  "QDRANT_URL", "QDRANT_API_KEY", "QDRANT_COLLECTION", "QDRANT_VECTOR_SIZE",
  "SMTP_ENABLED", "SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_FROM_EMAIL", "SMTP_FROM_NAME", "SMTP_USE_SSL", "SMTP_USE_STARTTLS",
  "MAIL_RELAY_URL", "MAIL_RELAY_TOKEN",
  "EMAIL_CODE_EXPIRY_MINUTES", "EMAIL_CODE_RESEND_SECONDS", "EMAIL_CODE_MAX_ATTEMPTS", "EMAIL_CODE_LENGTH",
];

config.vars = { ...(config.vars || {}) };
for (const key of keys) {
  if (process.env[key] !== undefined && process.env[key] !== "") {
    config.vars[key] = process.env[key];
  }
}

fs.writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
NODE

# This project targets the Cloudflare Workers runtime. Serve the built worker
# with Wrangler/Miniflare and use the same persisted D1 directory as migrations.
exec npx wrangler dev \
  --config "${runtime_config}" \
  --ip 0.0.0.0 \
  --port 3000 \
  --persist-to "${project_dir}/.wrangler/state"
