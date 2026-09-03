# Project4 - AI Customer Service SaaS

Project4 是一个企业级 AI 客服 SaaS 平台，目标是帮助企业通过知识库、RAG、Agent 和智能客服工作台完成自动化客户服务。

## 产品定位

Project4 不只是一个知识库 Demo，而是一套完整的 AI 客服商业系统：

- AI 客服 Widget
- 企业知识库 RAG
- 客服实时会话工作台
- 多租户企业空间
- 超级管理员平台
- 数据分析与运营能力
- Docker 私有化部署

## 核心能力

### AI 客服

支持网站悬浮客服、智能问答、快捷问题和人工客服转接。

### RAG 知识库

流程：

用户问题 -> 文档检索 -> 向量召回 -> 大模型生成 -> 返回答案

### 企业工作台

企业管理员可以管理：

- 知识库
- 客服会话
- FAQ
- 团队成员
- 使用情况

### 平台管理

超级管理员可以管理：

- 企业租户
- 服务配置
- 支付配置
- 系统设置

## 技术架构

Frontend:

- TypeScript
- React
- Vinext

Backend:

- API Routes
- AI Service
- RAG Pipeline

Infrastructure:

- Docker Compose
- Qdrant Vector Database
- Email Relay

## 项目目录

```
app/              页面和接口
components/       UI组件
features/         业务模块
lib/              通用能力
db/               数据相关
design/           设计资料
scripts/          自动部署脚本
docker*           部署配置
```

## 部署方式

### Docker 部署

```bash
cp .env.private.example .env.private

docker compose --env-file .env.private -f docker-compose.private.yml up -d --build
```

### 宝塔自动部署

流程：

```
GitHub main
    ↓
宝塔 Git Webhook
    ↓
auto-deploy.sh
    ↓
Docker Build
    ↓
服务启动
```

## 开发规范

- 新功能优先放入 features
- 公共 UI 放 components
- AI能力集中管理
- 不直接修改生产配置

## 文档

- docs/ARCHITECTURE.md
- docs/DEPLOYMENT.md
- docs/DEVELOPMENT.md

## License

Private SaaS Project
