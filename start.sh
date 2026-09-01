#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

export HOST=0.0.0.0
export PORT=28440

if ! command -v node >/dev/null 2>&1; then
  echo "[Project4] Node.js 未安装，请安装 Node.js >= 22.13.0"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[Project4] 首次启动，正在安装依赖..."
  npm ci
fi

echo "[Project4] 正在构建并启动：http://0.0.0.0:28440"
exec npm start
