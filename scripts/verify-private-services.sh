#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT4_DIR:-/www/wwwroot/project4}"
ENV_FILE="${PROJECT_DIR}/.env.private"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[verify] 缺少 $ENV_FILE"
  exit 1
fi

read_env() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}

PARSER_KEY="$(read_env PARSER_API_KEY)"
QDRANT_KEY="$(read_env QDRANT_API_KEY)"

if [[ -z "$PARSER_KEY" ]]; then
  echo "[verify] PARSER_API_KEY 未配置"
  exit 1
fi

curl -fsS --max-time 8 http://127.0.0.1:3000/ >/dev/null
echo "[verify] KnowFlow: OK"

OCR_HEALTH="$(curl -fsS --max-time 10 -H "Authorization: Bearer ${PARSER_KEY}" http://127.0.0.1:8002/health)"
if [[ "$OCR_HEALTH" != *'"ok":true'* ]]; then
  echo "[verify] PaddleOCR 健康检查返回异常"
  exit 1
fi
echo "[verify] PaddleOCR: OK"

if [[ -n "$QDRANT_KEY" ]]; then
  curl -fsS --max-time 8 -H "api-key: ${QDRANT_KEY}" http://127.0.0.1:6333/collections >/dev/null
else
  curl -fsS --max-time 8 http://127.0.0.1:6333/collections >/dev/null
fi
echo "[verify] Qdrant: OK"

echo "[verify] 私有化核心服务检查通过"
