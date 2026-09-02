#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT4_DIR:-/www/wwwroot/project4}"
BRANCH="${PROJECT4_BRANCH:-main}"
LOCK_FILE="/tmp/project4-auto-deploy.lock"
LAST_DEPLOYED_FILE="${PROJECT_DIR}/.git/project4-last-deployed"

cd "$PROJECT_DIR"

# Use kernel-backed flock instead of a mkdir lock. If two webhook deliveries arrive
# together, the second waits for the first and then exits if that SHA was already
# deployed. A killed process cannot leave a permanent stale lock behind.
exec 9>"$LOCK_FILE"
if ! flock -w 900 9; then
  echo "[Project4] 等待其他部署超过 15 分钟，停止本次部署。"
  exit 1
fi

echo "[Project4] $(date '+%F %T') 开始自动部署 ${BRANCH}"

git fetch origin "$BRANCH"
TARGET_SHA="$(git rev-parse "origin/$BRANCH")"
CURRENT_SHA="$(git rev-parse HEAD)"
LAST_DEPLOYED="$(cat "$LAST_DEPLOYED_FILE" 2>/dev/null || true)"

# BaoTa pulls the repository before running this script, so HEAD being current does
# not mean Docker was rebuilt. The success marker records the SHA that start.sh
# actually finished deploying. PROJECT4_FORCE_DEPLOY=2 is reserved for a deliberate
# rebuild of the exact same SHA; the existing BaoTa FORCE_DEPLOY=1 remains safe.
if [[ "$LAST_DEPLOYED" == "$TARGET_SHA" && "${PROJECT4_FORCE_DEPLOY:-0}" != "2" ]]; then
  echo "[Project4] ${TARGET_SHA:0:7} 已成功部署过，无需重复构建。"
  exit 0
fi

# .env.private is ignored by Git. Hard reset only synchronizes tracked source files;
# it does not remove private configuration or Docker data volumes.
if [[ "$CURRENT_SHA" != "$TARGET_SHA" ]]; then
  git reset --hard "origin/$BRANCH"
fi

echo "[Project4] 准备部署 $(git log -1 --oneline)"

bash "$PROJECT_DIR/start.sh"

mkdir -p "$(dirname "$LAST_DEPLOYED_FILE")"
printf '%s\n' "$TARGET_SHA" > "${LAST_DEPLOYED_FILE}.tmp"
mv "${LAST_DEPLOYED_FILE}.tmp" "$LAST_DEPLOYED_FILE"

echo "[Project4] 自动部署完成：$(git rev-parse --short HEAD)"
docker compose --env-file "$PROJECT_DIR/.env.private" -f "$PROJECT_DIR/docker-compose.private.yml" ps || true
