#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
from pathlib import Path

path = Path("app/page.tsx")
text = path.read_text(encoding="utf-8")

replacements = [
    ('["王先生 · 北京", "咨询私有化与报价", "18:42", "AI", "blue", "/brand/visitor-male-v3.jpg"]', '["王先生 · 北京", "咨询私有化与报价", "18:42", "AI", "blue", "/assets/avatar/wang-beijing.jpg"]'),
    ('["Mia · 上海", "网站客服接入报错", "18:39", "人工", "orange", "/brand/visitor-female-v3.jpg"]', '["Mia · 上海", "网站客服接入报错", "18:39", "人工", "orange", "/assets/avatar/mia-shanghai.jpg"]'),
    ('["陈女士 · 广州", "知识库支持哪些格式", "18:31", "AI", "blue", "/brand/visitor-female-v3.jpg"]', '["陈女士 · 广州", "知识库支持哪些格式", "18:31", "AI", "blue", "/assets/avatar/chen-guangzhou.jpg"]'),
    ('["李工 · 深圳", "转人工规则怎么配置", "18:27", "人工", "orange", "/brand/visitor-male-v3.jpg"]', '["李工 · 深圳", "转人工规则怎么配置", "18:27", "人工", "orange", "/assets/avatar/li-shenzhen.jpg"]'),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"avatar source row not found: {old}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print("[Project4] homepage customer avatars mapped: 王先生=男, Mia=女, 陈女士=女, 李工=男")
PY
