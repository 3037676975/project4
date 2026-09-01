#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "[Project4] 未检测到 Docker，请先在宝塔安装 Docker。"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[Project4] 未检测到 Docker Compose v2，请先安装/启用 docker compose。"
  exit 1
fi

if [ ! -f .env.private ]; then
  echo "[Project4] 首次 Docker 启动，正在生成私有化配置并构建全部服务..."
  bash scripts/init-private.sh
else
  echo "[Project4] 正在构建并启动全部 Docker 服务..."
  docker compose --env-file .env.private -f docker-compose.private.yml up -d --build
fi

echo
echo "[Project4] 当前容器状态："
docker compose --env-file .env.private -f docker-compose.private.yml ps || true

echo
echo "[Project4] 主站地址：      http://43.172.76.33:28440"
echo "[Project4] 首次设置：      http://43.172.76.33:28440/setup"
echo "[Project4] 平台后台：      http://43.172.76.33:28440/platform"
echo "[Project4] 内部管理后台：  http://43.172.76.33:28440/admin"
echo "[Project4] 企业工作台：    http://43.172.76.33:28440/workspace"
echo
echo "[Project4] 内部服务（默认仅服务器本机可访问）："
echo "  Qdrant:             http://127.0.0.1:6333"
echo "  Document Parser:    http://127.0.0.1:8001"
echo "  Embedding / BGE-M3: http://127.0.0.1:7997/v1"
echo
echo "[Project4] 查看日志：docker compose --env-file .env.private -f docker-compose.private.yml logs -f"
