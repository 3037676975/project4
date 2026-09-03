# KnowFlow — AI 客服知识库 SaaS

一个运行在 OpenAI Sites / Cloudflare 上的多租户 RAG 客服底座。超级管理员统一维护模型服务、支付与平台经营；企业管理自己的知识库、助手、客户 API Key、成员、账单和客服运营；Python 模型服务可独立部署。

## AI 接手开发说明（Project4 Handoff）

> 本项目后续由 AI 助手参与维护时，请先阅读本章节，避免破坏已有架构。

### 项目定位

Project4 是一个商业化 AI 客服 SaaS 平台，不是简单聊天 Demo。

核心目标：

- 企业知识库问答
- RAG 检索增强生成
- AI 客服悬浮窗 Widget
- 超级管理员平台控制台
- 企业工作台
- 工单与客户运营
- 多租户 SaaS 商业模式

### 当前架构

```
用户浏览器
    |
官网 / Widget.js
    |
KnowFlow Web
    |
API Routes
    |
+----------------+
| RAG Pipeline   |
| Embedding      |
| Rerank         |
| LLM Provider   |
+----------------+
    |
Qdrant Vector DB
```

### 三大后台

| 地址 | 角色 | 说明 |
|---|---|---|
| /platform | 超级管理员 | 平台配置、模型、套餐、支付、租户管理 |
| /admin | 运营后台 | 工单、客服、审核、运营 |
| /workspace | 企业后台 | 企业知识库、成员、客服管理 |

### AI 修改原则

任何 AI 修改代码前必须：

1. 先确认现有功能。
2. 不删除已经完成的 SaaS 模块。
3. 优先新增组件，不直接重构核心架构。
4. 修改后必须说明：
   - 修改文件
   - 修改原因
   - 测试方式
   - 部署影响

### 客服 Widget 开发规则

Widget 是 Project4 的核心商业入口。

需要支持：

- 官网右下角悬浮按钮
- 开关配置
- 颜色主题配置
- 欢迎语配置
- 企业独立 Widget
- Public Chat API
- 对话记录
- 留资信息
- 人工转接

相关入口：

```
/widget.js
/api/public/chat
/api/public/config
/api/public/conversation
```

### UI 设计方向

后续 UI 优化遵循：

- SaaS 产品风格
- 蓝白灰专业配色
- 卡片式布局
- 数据 Dashboard 风格
- 移动端适配
- 不破坏已有业务流程

参考产品方向：

- Intercom
- Zendesk
- Chatbase
- 企业级 AI Agent 平台

### 部署流程

项目采用 GitHub → 宝塔 → Docker 自动部署。

流程：

```
修改代码
 ↓
GitHub main
 ↓
宝塔 Git 自动部署
 ↓
docker compose rebuild
 ↓
28441端口上线
```

每次提交必须记录：

```
Commit: xxxxxxx
修改内容:
- xxx
- xxx

部署检查:
- Docker build
- Health check
- 页面访问
```

### 给未来 AI 的任务模板

继续开发时请使用：

```
你正在维护 Project4 AI 客服 SaaS。
先阅读 README。
保持现有架构。
修改前分析影响范围。
提交后输出 commit、文件列表、部署验证。
```

---

完整的落地矩阵、启用边界、验收指标与上线步骤见 [`docs/商业化优化方案.md`](./docs/商业化优化方案.md)。

完整源码交接、Linux / Windows 部署、数据迁移和上线验收见 [`docs/源码交接与部署手册.md`](./docs/源码交接与部署手册.md)。
