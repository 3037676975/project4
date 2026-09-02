# Project4 Payment Lab 支付模块

> 目标：参考 `3037676975/project3` 的 Payment Lab 模块化思路，在 Project4 中保留更现代的 TypeScript / Cloudflare Workers / D1 支付实现。

## 设计原则

- 支付模块与业务模块解耦：企业套餐只创建业务订单，支付适配器负责收款。
- 支付配置独立管理：密钥由超级管理员后台保存，并通过 `CONFIG_ENCRYPTION_KEY` 加密后进入 D1。
- 统一订单结构：使用 `billing_orders` 保存订单号、套餐、金额、渠道、状态、第三方交易号、支付时间与履约时间。
- 统一支付日志：使用 `payment_logs` 记录支付请求、回调、主动查询和退款流程。
- 回调必须验签：验签失败绝不更新业务订单。
- 状态更新必须幂等：`order_fulfillments` 保证同一订单不会重复发放套餐和积分。
- 主动订单查询：支付宝使用 `alipay.trade.query`；微信支付使用 API v3 订单查询接口。
- 主动查询也要验签：查询结果只有在响应验签、订单渠道和金额一致时才能触发履约。
- 密钥不写日志：Payment Lab 日志会对 secret/password/private key/API key/signature/token 等字段自动脱敏。

## 与 Project3 的关系

Project3 是可复用支付模板，核心价值是：独立支付模块、独立配置、统一订单、统一日志、回调验签、订单查询与幂等更新。

Project4 不直接调用 Project3，也不复制 Project3 的 PHP 运行时。Project4 使用现有技术栈重新实现相同的模块边界：

| 能力 | Project3 | Project4 |
| --- | --- | --- |
| 支付宝 | RSA2 | RSA2 |
| 微信支付 | V2 模板 | API v3 |
| 业务订单 | 独立订单存储 | D1 `billing_orders` |
| 支付日志 | 文件日志 | D1 `payment_logs` |
| 回调验签 | 支持 | 支持 |
| 订单查询 | 支持 | 支持 |
| 幂等履约 | 业务自行接入 | `order_fulfillments` 强制保证 |
| 密钥管理 | 独立配置 | 超级管理员后台加密保存 |

## 主要接口

### 企业账单

- `POST /api/billing`：创建订单、续费、退款。
- `GET /api/billing`：查看套餐、订阅、订单和退款。

### 支付回调

- `POST /api/payments/callback?provider=alipay`
- `POST /api/payments/callback?provider=wechat`
- `POST /api/payments/callback?provider=gateway`

### 主动订单查询

- `GET /api/payments/query?orderNo=业务订单号`

仅企业 Owner 可查询自己企业的订单。查询到已付款时仍需通过第三方响应验签和金额一致性检查，才允许调用履约逻辑。

### 超级管理员

- `/platform`：支付渠道和商户密钥配置。
- `/platform/payment-lab`：Payment Lab 订单与日志监控页面。
- `GET /api/platform/payment/lab`：Payment Lab 监控数据接口。

## 正式支付上线检查

1. Project4 必须使用公网 HTTPS 域名；HTTP IP 地址仅用于开发和部署验证。
2. 在超级管理员后台分别配置支付宝/微信支付正式商户参数。
3. 回调地址必须可从支付平台公网访问。
4. 支付宝使用应用私钥签名、支付宝公钥验签。
5. 微信支付使用商户 API 私钥签名、APIv3 密钥解密通知、微信支付平台公钥验签。
6. 先使用小金额真实订单做完整闭环测试：创建订单 → 支付 → 回调 → 验签 → 履约 → 日志 → 主动查询。
7. 禁止在 GitHub、支付日志、截图或前端响应里提交任何私钥、APIv3 密钥、回调密钥。

## 数据迁移

`drizzle/0014_payment_lab.sql` 创建统一 `payment_logs` 表。私有部署执行 `scripts/start-private.sh` 时会通过 Wrangler 自动应用尚未执行的本地 D1 migration。
