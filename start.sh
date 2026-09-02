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
  echo "[Project4] 首次 Docker 启动，正在生成私有化配置并构建核心服务..."
  bash scripts/init-private.sh
else
  echo "[Project4] 正在构建并启动核心 Docker 服务..."
  docker compose --env-file .env.private -f docker-compose.private.yml up -d --build
fi

echo "[Project4] 正在启动低资源 Infinity（BGE-M3 + BGE-Reranker）；失败不会影响主站..."
if ! docker compose --env-file .env.private -f docker-compose.private.yml --profile infinity up -d embedding; then
  echo "[Project4] Infinity 暂未启动成功；KnowFlow 核心服务保持运行，可稍后单独重试 embedding。"
fi

echo
echo "[Project4] 当前核心容器状态："
docker compose --env-file .env.private -f docker-compose.private.yml ps || true

echo
echo "[Project4] 应用本机地址：  http://127.0.0.1:3000"
echo "[Project4] 新公网地址：    http://186.244.245.177:28441"
echo "[Project4] 首次设置：      http://186.244.245.177:28441/setup"
echo "[Project4] 平台后台：      http://186.244.245.177:28441/platform"
echo "[Project4] 内部管理后台：  http://186.244.245.177:28441/admin"
echo "[Project4] 企业工作台：    http://186.244.245.177:28441/workspace"
echo
echo "[Project4] 当前默认启动：KnowFlow + Qdrant + Email Relay + Operations Sweeper + Infinity"
echo "[Project4] Infinity 使用 CPU 低批量模式加载 BGE-M3 与 BGE-Reranker；模型缓存会持久化。"
echo "[Project4] Docling / RapidOCR 保持独立，不会被普通部署构建；确需启用时单独执行："
echo "docker compose --env-file .env.private -f docker-compose.private.yml --profile parser up -d --build document-parser"
echo
echo "[Project4] 宝塔/Nginx 请将 186.244.245.177:28441 反向代理到 http://127.0.0.1:3000"
echo "[Project4] 查看日志：docker compose --env-file .env.private -f docker-compose.private.yml logs -f"
