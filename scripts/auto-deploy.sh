#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT4_DIR:-/www/wwwroot/project4}"
BRANCH="${PROJECT4_BRANCH:-main}"
COMPOSE_PROJECT_NAME="${PROJECT4_COMPOSE_PROJECT_NAME:-project4}"
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
  echo "[Project4] 同步 GitHub ${BRANCH}"
  git reset --hard "origin/$BRANCH"
fi

COMMIT="$(git rev-parse --short HEAD)"
echo "[Project4] 当前版本: $COMMIT"
echo "[Project4] 部署源码目录: $PROJECT_DIR"

if [[ "${PROJECT4_DEPLOY_FROM_ARCHIVE:-0}" == "1" ]]; then
  echo "[Project4] 使用 GitHub archive 构建模式"
  bash "$PROJECT_DIR/scripts/build-from-github-archive.sh" "$TARGET_SHA"
else
  echo "[Project4] 使用当前 Git checkout 直接构建，确保页面与 main 完全一致"
  BUILD_SERVICES=(knowflow)
  if docker compose \
    -p "$COMPOSE_PROJECT_NAME" \
    --env-file "$PROJECT_DIR/.env.private" \
    -f "$PROJECT_DIR/docker-compose.private.yml" \
    config --services | grep -qx paddleocr; then
    BUILD_SERVICES+=(paddleocr)
    echo "[Project4] 检测到本地 PaddleOCR，加入构建队列"
  fi
  docker compose \
    -p "$COMPOSE_PROJECT_NAME" \
    --env-file "$PROJECT_DIR/.env.private" \
    -f "$PROJECT_DIR/docker-compose.private.yml" \
    build --pull "${BUILD_SERVICES[@]}"
fi

echo "[Project4] 使用新镜像重新创建 Docker 服务"
docker compose \
  -p "$COMPOSE_PROJECT_NAME" \
  --env-file "$PROJECT_DIR/.env.private" \
  -f "$PROJECT_DIR/docker-compose.private.yml" \
  up -d --force-recreate --no-build

echo "[Project4] 等待 KnowFlow 服务启动"
HEALTH_OK=0
for i in {1..40}; do
  if curl -fsS --max-time 5 http://127.0.0.1:3000 >/dev/null; then
    HEALTH_OK=1
    echo "[Project4] KnowFlow 健康检查通过 (${i}/40)"
    break
  fi
  echo "[Project4] 服务启动等待 ${i}/40"
  sleep 3
done

if [[ "$HEALTH_OK" != "1" ]]; then
  echo "[Project4] KnowFlow 健康检查失败"
  docker compose \
    -p "$COMPOSE_PROJECT_NAME" \
    --env-file "$PROJECT_DIR/.env.private" \
    -f "$PROJECT_DIR/docker-compose.private.yml" \
    logs --tail=150 knowflow || true
  exit 1
fi

echo "[Project4] 检查本地 OCR / Qdrant"
VERIFY_OK=0
for i in {1..20}; do
  if bash "$PROJECT_DIR/scripts/verify-private-services.sh"; then
    VERIFY_OK=1
    echo "[Project4] 私有化核心服务检查通过 (${i}/20)"
    break
  fi
  echo "[Project4] PaddleOCR / Qdrant 尚未就绪 ${i}/20"
  sleep 3
done

if [[ "$VERIFY_OK" != "1" ]]; then
  echo "[Project4] PaddleOCR 或 Qdrant 检查失败"
  docker compose \
    -p "$COMPOSE_PROJECT_NAME" \
    --env-file "$PROJECT_DIR/.env.private" \
    -f "$PROJECT_DIR/docker-compose.private.yml" \
    logs --tail=180 paddleocr qdrant || true
  exit 1
fi

printf '%s\n' "$TARGET_SHA" > "${LAST_DEPLOYED_FILE}.tmp"
mv "${LAST_DEPLOYED_FILE}.tmp" "$LAST_DEPLOYED_FILE"

echo "[Project4] 自动部署完成: $COMMIT"
docker compose \
  -p "$COMPOSE_PROJECT_NAME" \
  --env-file "$PROJECT_DIR/.env.private" \
  -f "$PROJECT_DIR/docker-compose.private.yml" \
  ps || true
