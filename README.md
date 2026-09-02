# KnowFlow — AI 客服知识库 SaaS

一个运行在 OpenAI Sites / Cloudflare 上的多租户 RAG 客服底座。超级管理员统一维护模型服务、支付与平台经营；企业管理自己的知识库、助手、客户 API Key、成员、账单和客服运营；Python 模型服务可独立部署。

## 商用能力

- 资料：PDF、DOCX、XLSX、PPTX、图片、TXT、Markdown、CSV、JSON 与粘贴文本。
- 解析：原生 PDF / XLSX 优先；图片、逐页扫描 PDF 与表格图片/PDF 可分别选择文字 OCR 或结构化表格 OCR；Office 复杂版式调用 Docling + RapidOCR。
- RAG：带重叠的分块、批量 Embedding、混合检索、独立 Rerank、最低可靠度门槛、无依据拒答和标准题回归测试。
- 开源向量：Infinity 提供 OpenAI 兼容 API，默认模型 `BAAI/bge-m3`，1024 维。
- 对外 API：客户 API Key、OpenAI 兼容 `models`、`chat/completions`、`responses`、`embeddings`、SSE 与 Trace。
- SaaS：企业注册、独立账号密码、直接创建成员、RBAC、租户切换、离职禁用、套餐、订阅、月配额、Credits 与 R2 原文件存储。
- 三套后台：`/platform` 仅超级管理员经营平台并统一配置 DeepSeek、Embedding、Rerank、OCR 与 SMTP；`/admin` 供运营、财务、客服和风控处理任务；`/workspace` 供企业客户管理资料、成员、账单和客服运营，不能查看或修改平台密钥。
- 商业账号：三个角色固定独立登录入口，账号密码和滑块邮箱验证码双登录；新企业必须滑块验证并完成邮箱验证码注册。
- 收费：待支付订单、签名支付/退款网关、回调防重放、幂等履约、手动续费、退款和到期降级；未配置正式商户时生产环境保持关闭。
- 商业闭环：官网悬浮客服、域名白名单、销售留资、负责人、人工工单、SLA、未解决问题、线索漏斗和成交金额统计。
- 隐私：提交前明示同意、保存期限、访客数据导出/删除、定期清理和最少化留存。
- 运营：企业微信机器人、邮件/短信网关、通用 Webhook 通知；失败退避重试；生成、Embedding、Rerank 与 OCR 成本和租户毛利。
- 灾备：租户数据库、配置密文、R2 原文件和 Qdrant 向量一键 JSONL 导出/恢复。
- 扩展：Qdrant 专用向量库，以及企微、微信公众号、钉钉、飞书的原生鉴权、回调验签、事件幂等和原生回复。
- 企业开通：四步开通向导、制造/贸易/教育/医疗器械行业模板、租户隔离演示知识、标准测试题和官网客服一键发布。
- 安全：PBKDF2-SHA256 密码哈希、HttpOnly 会话、失败锁定、首次改密、模型密钥 AES-256-GCM、租户隔离、Scope、RPM/TPM 与 SSRF 防护。

完整的落地矩阵、启用边界、验收指标与上线步骤见 [`docs/商业化优化方案.md`](./docs/商业化优化方案.md)。

完整源码交接、Linux / Windows 部署、数据迁移和上线验收见 [`docs/源码交接与部署手册.md`](./docs/源码交接与部署手册.md)。

## 服务边界

Sites Worker 不运行 Python 模型。请在单独的 Linux 主机启动 [`docker-compose.open-source.yml`](./docker-compose.open-source.yml)，通过公网 HTTPS 反向代理暴露两个受 Bearer Token 保护的服务，再由超级管理员到 **平台控制台 → 模型服务** 中统一配置。

完整启动说明见 [`services/README.md`](./services/README.md)。

## Linux / Windows 私有化测试

安装 Docker Desktop（Windows）或 Docker Engine + Compose（Linux），然后运行：

```bash
# Linux
bash scripts/init-private.sh
```

```powershell
# Windows PowerShell
.\scripts\init-private.ps1
```

脚本会生成仅本机使用的 `.env.private`，并在终端显示一次 `admin@local.test` 的随机超级管理员初始密码；随后自动执行 D1 迁移并启动 KnowFlow、Qdrant、邮件中继、每分钟运营巡检，以及低资源 CPU Infinity（`BAAI/bge-m3` + `BAAI/bge-reranker-v2-m3`）。Docling / RapidOCR 独立为 `parser` profile，不会在 4G 服务器的普通部署中自动构建。访问 `http://localhost:3000/login` 后用初始账号密码登录，系统会创建站内超级管理员并强制修改密码。本地支付采用沙箱；正式微信/支付宝收款必须另外配置商户网关。

线上首次部署时，站点所有者打开 `/setup` 完成一次身份确认并自行创建超级管理员密码；以后超级管理员从 `/platform/login`、内部管理员从 `/admin/login`、企业账号从 `/workspace/login` 登录。密码永远不以明文写入数据库，只保存带随机盐的哈希。`PLATFORM_ADMIN_EMAILS` 只用于保护首次激活邮箱；内部管理员和企业成员由各自后台直接创建账号与临时密码。


### 2 核 4G 私有服务器的模型服务

默认部署会单独启动 `embedding` 容器，使用 Infinity CPU 镜像同时提供 `BAAI/bge-m3` Embedding 与 `BAAI/bge-reranker-v2-m3` Rerank；批量大小限制为 2，并关闭 `torch.compile`，降低首次加载的内存峰值。模型保存在 `infinity-cache` 卷中，后续重建无需重复下载。Infinity 启动失败不会让 KnowFlow 主站退出。

Docling / RapidOCR 不跟随 Infinity 启动。如服务器后续扩容并确需本地复杂文档解析，再单独执行：

```bash
docker compose --env-file .env.private -f docker-compose.private.yml --profile parser up -d --build document-parser
```

## 后台入口与账号规则

| 入口 | 使用者 | 核心权限 |
|---|---|---|
| `/platform` | 超级管理员 | 平台模型服务、收入、租户、套餐商品、支付商户、平台账号、全局审计 |
| `/admin` | 运营 / 财务 / 客服 / 风控 | 企业审核、退款审核、客服工单、风险告警 |
| `/workspace` | 企业 Owner / Admin / Member / Viewer | 知识库、助手、质量、企业成员、企业账单与渠道 |
| `/login` | 企业账号兼容入口 | 固定进入企业登录，不显示其他角色入口 |
| `/register` | 新企业 | 滑块与邮箱验证码通过后创建企业所有者账号和默认工作区 |
| `/setup` | 站点所有者（仅首次） | 激活首个超级管理员账号 |

企业或平台管理员创建下属账号时填写姓名、邮箱、角色和临时密码；新账号首次登录必须改密。管理员可以重置临时密码，但不能查看原密码；重置后全部旧会话立即失效。

## 本地源码开发

要求 Node.js `>=22.13.0`。

```bash
npm run install:ci
npm run dev
```

常用检查：

```bash
npm run lint
npm test
```

运行时需要 `.openai/hosting.json` 声明的 D1 与 R2 绑定，以及 `CONFIG_ENCRYPTION_KEY` secret。数据库结构位于 `db/schema.ts`，迁移位于 `drizzle/`；`scripts/start-private.sh` 会在私有化容器启动前自动执行尚未应用的迁移。

## 资料流

1. 原文件写入 R2。
2. 提取后的 Markdown 写入租户隔离的 D1 文档记录。
3. 文本按句子边界切分，并保留重叠上下文，降低答案恰好落在切点上的风险。
4. 每个分块由 BGE-M3 转成向量并保存模型名与实际维度。
5. 查询时按 `tenant_id + knowledge_base_id` 过滤 Qdrant，融合向量与中文词法命中，再用独立 Reranker 精排。
6. 低于助手阈值时直接拒答；达到阈值才调用生成模型。
7. 回答、来源、Token、耗时、Credits 与真实成本进入 Trace。
