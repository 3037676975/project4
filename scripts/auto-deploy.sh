#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT4_DIR:-/www/wwwroot/project4}"
BRANCH="${PROJECT4_BRANCH:-main}"
LOCK_DIR="/tmp/project4-auto-deploy.lock"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[Project4] 已有部署任务正在执行，本次跳过。"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

cd "$PROJECT_DIR"

echo "[Project4] $(date '+%F %T') 开始自动部署 ${BRANCH}"

git fetch origin "$BRANCH"
TARGET_SHA="$(git rev-parse "origin/$BRANCH")"
CURRENT_SHA="$(git rev-parse HEAD)"

if [[ "$CURRENT_SHA" == "$TARGET_SHA" && "${PROJECT4_FORCE_DEPLOY:-0}" != "1" ]]; then
  echo "[Project4] 已是最新版本 ${TARGET_SHA:0:7}，无需重复构建。"
  exit 0
fi

# .env.private 为 Git 忽略文件；hard reset 只同步受 Git 管理的源码，不删除私有配置和 Docker 数据卷。
git reset --hard "origin/$BRANCH"

echo "[Project4] 已同步到 $(git log -1 --oneline)"

bash "$PROJECT_DIR/start.sh"

echo "[Project4] 自动部署完成：$(git rev-parse --short HEAD)"
docker compose --env-file "$PROJECT_DIR/.env.private" -f "$PROJECT_DIR/docker-compose.private.yml" ps || true
