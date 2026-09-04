#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT4_DIR:-/www/wwwroot/project4}"
REPOSITORY="${PROJECT4_REPOSITORY:-3037676975/project4}"
REF="${1:-$(git -C "$PROJECT_DIR" rev-parse HEAD)}"
COMPOSE_PROJECT_NAME="${PROJECT4_COMPOSE_PROJECT_NAME:-project4}"

if [[ ! -f "$PROJECT_DIR/.env.private" ]]; then
  echo "[Project4] 缺少 $PROJECT_DIR/.env.private，无法部署。"
  exit 1
fi

TMP_ROOT="$(mktemp -d /tmp/project4-github-archive.XXXXXX)"
ARCHIVE_FILE="$TMP_ROOT/project4-${REF}.tar.gz"
EXTRACT_DIR="$TMP_ROOT/extracted"
ARCHIVE_URL="https://github.com/${REPOSITORY}/archive/${REF}.tar.gz"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

mkdir -p "$EXTRACT_DIR"

echo "[Project4] 从 GitHub 下载发布压缩包"
echo "[Project4] ${ARCHIVE_URL}"
curl -fL \
  --retry 3 \
  --retry-delay 2 \
  --connect-timeout 20 \
  --max-time 180 \
  "$ARCHIVE_URL" \
  -o "$ARCHIVE_FILE"

echo "[Project4] GitHub 压缩包下载完成: $(du -h "$ARCHIVE_FILE" | awk '{print $1}')"
echo "[Project4] 解压发布包"
tar -xzf "$ARCHIVE_FILE" -C "$EXTRACT_DIR"

SOURCE_DIR="$(find "$EXTRACT_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
if [[ -z "$SOURCE_DIR" || ! -f "$SOURCE_DIR/package.json" || ! -f "$SOURCE_DIR/docker-compose.private.yml" ]]; then
  echo "[Project4] GitHub 发布包结构异常。"
  exit 1
fi

echo "[Project4] 发布包已解压: $SOURCE_DIR"
BUILD_SERVICES=(knowflow)
if docker compose \
  -p "$COMPOSE_PROJECT_NAME" \
  --env-file "$PROJECT_DIR/.env.private" \
  -f "$SOURCE_DIR/docker-compose.private.yml" \
  config --services | grep -qx paddleocr; then
  BUILD_SERVICES+=(paddleocr)
  echo "[Project4] GitHub 发布包包含 PaddleOCR，本次一并构建"
fi

echo "[Project4] 使用解压后的源码构建: ${BUILD_SERVICES[*]}"
docker compose \
  -p "$COMPOSE_PROJECT_NAME" \
  --env-file "$PROJECT_DIR/.env.private" \
  -f "$SOURCE_DIR/docker-compose.private.yml" \
  build "${BUILD_SERVICES[@]}"

echo "[Project4] GitHub 压缩包构建完成: ${REF:0:7}"
