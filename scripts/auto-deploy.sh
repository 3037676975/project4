#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT4_DIR:-/www/wwwroot/project4}"
BRANCH="${PROJECT4_BRANCH:-main}"
LOCK_FILE="/tmp/project4-auto-deploy.flock"
LAST_DEPLOYED_FILE="${PROJECT_DIR}/.git/project4-last-deployed"
LOG_DIR="${PROJECT_DIR}/logs"
LOG_FILE="${LOG_DIR}/deploy.log"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

cd "$PROJECT_DIR"

exec 9>"$LOCK_FILE"
if ! flock -w 900 9; then
  echo "[Project4] 等待其他部署超过 15 分钟，停止本次部署。"
  exit 1
fi

echo "============================================================"
echo "[Project4] $(date '+%F %T') 自动部署开始 ${BRANCH}"
echo "============================================================"

git fetch origin "$BRANCH"
TARGET_SHA="$(git rev-parse "origin/$BRANCH")"
CURRENT_SHA="$(git rev-parse HEAD)"
LAST_DEPLOYED="$(cat "$LAST_DEPLOYED_FILE" 2>/dev/null || true)"

if [[ "$LAST_DEPLOYED" == "$TARGET_SHA" && "${PROJECT4_FORCE_DEPLOY:-0}" != "1" && "${PROJECT4_FORCE_DEPLOY:-0}" != "2" ]]; then
  echo "[Project4] ${TARGET_SHA:0:7} 已部署，跳过。"
  exit 0
fi

if [[ "$CURRENT_SHA" != "$TARGET_SHA" ]]; then
  echo "[Project4] 同步 GitHub main"
  git reset --hard "origin/$BRANCH"
fi

COMMIT="$(git rev-parse --short HEAD)"
echo "[Project4] 当前版本: $COMMIT"

echo "[Project4] 开始重新构建 Docker 服务"

# 强制重新构建前端服务，避免 Docker cache 导致页面不更新
docker compose --env-file "$PROJECT_DIR/.env.private" -f "$PROJECT_DIR/docker-compose.private.yml" build knowflow

docker compose --env-file "$PROJECT_DIR/.env.private" -f "$PROJECT_DIR/docker-compose.private.yml" up -d --force-recreate

sleep 5

if curl -fsS http://127.0.0.1:3000 >/dev/null; then
  echo "[Project4] 健康检查通过"
else
  echo "[Project4] 健康检查失败"
  docker compose --env-file "$PROJECT_DIR/.env.private" -f "$PROJECT_DIR/docker-compose.private.yml" logs --tail=80 knowflow || true
  exit 1
fi

printf '%s\n' "$TARGET_SHA" > "${LAST_DEPLOYED_FILE}.tmp"
mv "${LAST_DEPLOYED_FILE}.tmp" "$LAST_DEPLOYED_FILE"

echo "[Project4] 自动部署完成: $COMMIT"
docker compose --env-file "$PROJECT_DIR/.env.private" -f "$PROJECT_DIR/docker-compose.private.yml" ps || true
