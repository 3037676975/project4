# Project4 - AI Customer Service SaaS

> 企业级 AI 客服 SaaS 平台：RAG 知识库 + AI Agent + 客服工作台 + 多租户管理 + 私有化部署。

---

# 产品 PRD 总览

## 1. 产品定位

Project4 不是简单的 AI 问答 Demo，而是一套面向企业商业化落地的智能客服系统。

目标：

- 降低企业人工客服成本
- 提升客户响应速度
- 将企业知识沉淀为 AI 能力
- 支持 SaaS 多租户商业模式

---

# 2. 产品核心模块

## 2.1 AI 客服 Widget

状态：持续重构中

能力：

- 网站右下角悬浮客服
- AI 自动回复
- 快捷问题
- 会话记录
- 人工客服转接
- 后台配置主题和欢迎语

架构：

```
WidgetManager
    |
    ├── WidgetButton
    ├── WidgetPanel
    ├── WidgetApi
    ├── WidgetConfig
    └── WidgetSettings
```

---

## 2.2 RAG 企业知识库

流程：

```
企业文档
 ↓
文本切片
 ↓
Embedding向量化
 ↓
Qdrant检索
 ↓
LLM生成答案
 ↓
返回客户
```

支持：

- 知识库管理
- 文档上传
- 向量检索
- AI问答

---

## 2.3 客服工作台

企业客服可以：

- 查看客户会话
- 管理FAQ
- 处理人工咨询
- 查看服务质量

---

## 2.4 超级管理员平台

管理员能力：

- 租户管理
- 系统配置
- 服务开关
- Widget配置
- 支付配置

---

# 3. 开发路线 Roadmap

## Phase 1 基础平台

- [x] Docker 私有化部署
- [x] AI客服基础能力
- [x] RAG知识库
- [x] 企业工作台

## Phase 2 客服模块重构

- [x] Widget模块拆分
- [x] Widget配置模型
- [x] Widget状态管理
- [ ] 超级管理员配置页面
- [ ] 多主题皮肤
- [ ] 会话状态机

## Phase 3 Agent能力

计划：

- MCP工具调用
- 自动执行任务
- 工单Agent
- 销售Agent
- 数据分析Agent

## Phase 4 商业化

计划：

- 套餐系统
- 企业订阅
- 用量计费
- 支付系统

---

# 4. 每次开发执行规范

以后所有功能修改必须遵循：

## 第一步：读取 PRD

修改前先查看：

```
README.md
features/*/README.md
docs/
```

确认：

- 当前目标
- 模块职责
- 是否影响已有功能

---

## 第二步：拆解任务

每次提交必须说明：

```
目标:

修改:

影响:

测试:
```

---

## 第三步：代码修改

规范：

- 新业务进入 features
- 公共能力进入 lib
- 页面负责组合
- 不堆积大文件

---

## 第四步：验收

提交后检查：

```
✅ GitHub commit
✅ Docker build
✅ 页面访问
✅ 核心功能测试
```

---

# 技术架构

## Frontend

- TypeScript
- React
- Vinext

## AI

- RAG
- Embedding
- LLM API
- Agent

## Infrastructure

- Docker Compose
- Qdrant
- Email Relay
- 宝塔 Git 自动部署

---

# 项目目录

```
app/              页面和接口
components/       通用UI
features/         业务模块
lib/              公共能力
docs/             文档
scripts/          自动部署
docker*           部署配置
```

---

# 部署

## Docker

```bash
cp .env.private.example .env.private

docker compose --env-file .env.private -f docker-compose.private.yml up -d --build
```

## 宝塔自动部署

```
GitHub main
 ↓
宝塔Webhook
 ↓
auto-deploy.sh
 ↓
Docker Build
 ↓
线上服务
```

---

# 当前目标

打造一个：

> 可商业化、可扩展、可维护的企业 AI 客服 SaaS 平台。
