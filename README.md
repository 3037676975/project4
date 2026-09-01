# 🤖 AI Customer Service SaaS

企业级 AI 智能客服 + RAG 知识库 + Agent 智能体平台。

> Vue3 + Spring Boot 3 + LangChain4j + RAG + MCP + Docker

## 📖 项目介绍

AI Customer Service SaaS 是一个面向企业的智能客服系统，通过大语言模型、RAG知识库增强、AI Agent 和 MCP 工具调用，实现智能问答、自动工单、业务系统连接和企业级 SaaS 管理。

## ✨ 核心功能

- 🤖 AI智能客服：多轮对话、上下文理解、知识增强回答
- 📚 RAG企业知识库：PDF/Word/TXT文档解析、向量检索
- 🎫 智能工单系统：AI分类、自动创建、流程管理
- 🧠 AI Agent：调用工具完成业务任务
- 🔌 MCP工具调用：连接订单、用户、工单等系统
- 🏢 多租户SaaS：企业数据隔离与权限管理

## 🛠 技术栈

### Frontend
- Vue3
- TypeScript
- Element Plus
- ECharts

### Backend
- Spring Boot 3
- MyBatis Plus
- Spring Security
- JWT

### AI
- LangChain4j
- RAG
- Embedding
- PGVector
- Agent
- MCP

### Deployment
- Docker
- Docker Compose
- Nginx
- PostgreSQL
- Redis

## 🏗 项目结构

```text
b-ai-
├── web                 # Vue3前端
├── server              # SpringBoot后端
├── ai-service          # RAG + Agent服务
├── mcp-server          # MCP工具服务
├── database            # 数据库脚本
├── docs                # 项目文档
└── docker-compose.yml
```

## 🚀 Roadmap

- [x] AI客服架构设计
- [x] RAG知识库设计
- [x] 工单系统设计
- [x] Agent智能体设计
- [ ] MCP工具实现
- [ ] 多租户实现
- [ ] Docker一键部署
- [ ] 商业套餐系统

## 📌 项目定位

适合作为：

- AI应用开发项目
- Java后端高级项目
- AI产品经理作品集
- 企业级SaaS产品原型

## License

MIT