#!/usr/bin/env bash
set -euo pipefail

node <<'NODE'
const fs = require('fs');

const path = 'app/page.tsx';
let text = fs.readFileSync(path, 'utf8');

const replacements = [
  ['["王先生 · 北京", "咨询私有化与报价", "18:42", "AI", "blue", "/brand/visitor-male-v3.jpg"]', '["王先生 · 北京", "咨询私有化与报价", "18:42", "AI", "blue", "/assets/avatar/wang-beijing.jpg"]'],
  ['["Mia · 上海", "网站客服接入报错", "18:39", "人工", "orange", "/brand/visitor-female-v3.jpg"]', '["Mia · 上海", "网站客服接入报错", "18:39", "人工", "orange", "/assets/avatar/mia-shanghai.jpg"]'],
  ['["陈女士 · 广州", "知识库支持哪些格式", "18:31", "AI", "blue", "/brand/visitor-female-v3.jpg"]', '["陈女士 · 广州", "知识库支持哪些格式", "18:31", "AI", "blue", "/assets/avatar/chen-guangzhou.jpg"]'],
  ['["李工 · 深圳", "转人工规则怎么配置", "18:27", "人工", "orange", "/brand/visitor-male-v3.jpg"]', '["李工 · 深圳", "转人工规则怎么配置", "18:27", "人工", "orange", "/assets/avatar/li-shenzhen.jpg"]'],
];

for (const [oldValue, newValue] of replacements) {
  if (!text.includes(oldValue)) {
    throw new Error(`avatar source row not found: ${oldValue}`);
  }
  text = text.replace(oldValue, newValue);
}

fs.writeFileSync(path, text, 'utf8');
console.log('[Project4] homepage customer avatars mapped: 王先生=男, Mia=女, 陈女士=女, 李工=男');
NODE
