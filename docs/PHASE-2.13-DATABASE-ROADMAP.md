# Phase 2.13 真实数据库接入

## 目标

将客服 Widget 配置从临时状态管理升级为可持久化企业级配置系统。

## 架构目标

```
Admin Platform
      |
      v
Widget Config API
      |
      v
Service Layer
      |
      v
Repository Layer
      |
      v
PostgreSQL
```

## 数据模型规划

### widget_settings

字段规划：

- id
- tenant_id
- enabled
- welcome_message
- title
- avatar
- theme_color
- position
- quick_questions
- created_at
- updated_at

## 实施步骤

### Batch 1

- [ ] 数据库连接层整理
- [ ] Schema 定义
- [ ] Migration
- [ ] Repository 接入数据库

### Batch 2

- [ ] Service 改造
- [ ] Admin 保存接口
- [ ] Widget读取接口

### Batch 3

- [ ] Docker环境验证
- [ ] 宝塔自动部署验证
- [ ] 线上功能测试

## 验收标准

完成后必须满足：

1. 超级管理员修改配置后可以保存
2. 重启 Docker 后配置不会丢失
3. 官网 Widget 自动读取最新配置
4. 多租户数据隔离

## 开发规范

每次修改前：

1. 阅读 README PRD
2. 确认模块职责
3. 完成代码修改
4. 执行 build 和部署测试
