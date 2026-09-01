#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${project_dir}/.env.private"
generated_password=""

if [[ ! -f "${env_file}" ]]; then
  encryption_key="$(openssl rand -base64 32 | tr -d '\n')"
  parser_key="$(openssl rand -hex 32)"
  embedding_key="$(openssl rand -hex 32)"
  qdrant_key="$(openssl rand -hex 32)"
  payment_key="$(openssl rand -hex 32)"
  sweep_key="$(openssl rand -hex 32)"
  mail_relay_key="$(openssl rand -hex 32)"
  generated_password="Kf$(openssl rand -hex 9)9"
  session_key="$(openssl rand -hex 32)"
  umask 077
  {
    echo "CONFIG_ENCRYPTION_KEY=${encryption_key}"
    echo "LOCAL_AUTH_EMAIL=admin@local.test"
    echo "LOCAL_AUTH_NAME=本地管理员"
    echo "LOCAL_ADMIN_PASSWORD=${generated_password}"
    echo "LOCAL_AUTH_SESSION_SECRET=${session_key}"
    echo "PARSER_API_KEY=${parser_key}"
    echo "INFINITY_API_KEY=${embedding_key}"
    echo "DEEPSEEK_API_KEY="
    echo "QDRANT_API_KEY=${qdrant_key}"
    echo "PAYMENT_CALLBACK_SECRET=${payment_key}"
    echo "OPERATIONS_SWEEP_SECRET=${sweep_key}"
    echo "MAIL_RELAY_TOKEN=${mail_relay_key}"
    echo "SMTP_ENABLED=true"
    echo "SMTP_HOST=smtp.qq.com"
    echo "SMTP_PORT=465"
    echo "SMTP_USERNAME="
    echo "SMTP_PASSWORD="
    echo "SMTP_FROM_EMAIL="
    echo "SMTP_FROM_NAME=KnowFlow"
    echo "SMTP_USE_SSL=true"
    echo "SMTP_USE_STARTTLS=false"
    echo "EMAIL_CODE_EXPIRY_MINUTES=10"
    echo "EMAIL_CODE_RESEND_SECONDS=60"
    echo "EMAIL_CODE_MAX_ATTEMPTS=5"
    echo "EMAIL_CODE_LENGTH=6"
  } > "${env_file}"
  echo "已生成 ${env_file}，请随备份保存。"
fi

if ! grep -q '^LOCAL_ADMIN_PASSWORD=' "${env_file}"; then
  generated_password="Kf$(openssl rand -hex 9)9"
  echo "LOCAL_ADMIN_PASSWORD=${generated_password}" >> "${env_file}"
  echo "已为旧配置补充本地超级管理员密码。"
fi
if ! grep -q '^LOCAL_AUTH_SESSION_SECRET=' "${env_file}"; then
  echo "LOCAL_AUTH_SESSION_SECRET=$(openssl rand -hex 32)" >> "${env_file}"
fi
if ! grep -q '^MAIL_RELAY_TOKEN=' "${env_file}"; then
  echo "MAIL_RELAY_TOKEN=$(openssl rand -hex 32)" >> "${env_file}"
fi

docker compose --env-file "${env_file}" -f "${project_dir}/docker-compose.private.yml" up -d --build
echo "KnowFlow 已启动：http://localhost:3000"
if [[ -n "${generated_password}" ]]; then
  echo "超级管理员：admin@local.test"
  echo "初始密码：${generated_password}"
  echo "密码已保存到 ${env_file}"
fi
