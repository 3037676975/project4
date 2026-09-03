# Project4 重构执行计划

## 当前原则

每次代码修改前：

1. 阅读 README 产品 PRD
2. 确认当前 Phase 目标
3. 检查影响范围
4. 修改后进行构建和功能验证

## 当前重构主线

### Phase 2 Widget SaaS 化

目标：

将固定客服组件升级为企业可配置客服产品。

架构：

```
Admin Widget Settings
        |
        v
Widget API
        |
        v
Widget Service
        |
        v
Widget Repository
        |
        v
Database
        |
        v
Website Widget
```

## 后续阶段

### Phase 2.13 数据持久化

- 接入真实数据库
- widget_settings 表
- tenant_id 隔离
- 配置重启不丢失

### Phase 2.14 Widget 产品化

- 动画效果
- 在线状态
- 未读消息
- Markdown消息
- 转人工流程

### Phase 3 Agent

- MCP工具调用
- 工单Agent
- 销售Agent
- 自动执行任务

## 验收标准

每个阶段完成：

- GitHub commit
- Docker build
- 页面访问
- 核心流程测试
