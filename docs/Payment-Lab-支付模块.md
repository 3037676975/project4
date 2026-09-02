# Project4 Payment Lab 支付模块

> 目标：参考 `3037676975/project3` 的 Payment Lab 模块化思路，在 Project4 中使用支付宝 RSA2 + 微信支付 V2 Native，并保留 TypeScript / Cloudflare Workers / D1 的统一订单、日志与幂等履约。

## 设计原则

- 支付模块与业务模块解耦：企业套餐只创建业务订单，支付适配器负责收款。
- 支付配置独立管理：密钥由超级管理员后台保存，并通过 `CONFIG_ENCRYPTION_KEY` 加密后进入 D1。
- 统一订单结构：使用 `billing_orders` 保存订单号、套餐、金额、渠道、状态、第三方交易号、支付时间与履约时间。
- 统一支付日志：使用 `payment_logs` 记录支付请求、回调、主动查询和退款流程。
- 回调必须验签：验签失败绝不更新业务订单。
- 状态更新必须幂等：`order_fulfillments` 保证同一订单不会重复发放套餐和积分。
- 主动订单查询：支付宝使用 `alipay.trade.query`；微信支付使用 V2 `pay/orderquery`。
- 微信下单：使用 V2 `pay/unifiedorder` + Native 扫码。
- 主动查询也要验签：查询到已支付时，响应验签、订单渠道、交易号和金额必须全部一致才触发履约。
- 密钥不写日志：Payment Lab 日志会对 secret/password/private/API key/signature/token 等字段自动脱敏。

## 与 Project3 的关系

Project3 是可复用支付模板，核心价值是：独立支付模块、独立配置、统一订单、统一日志、回调验签、订单查询与幂等更新。

Project4 不直接调用 Project3 的 PHP 运行时，而是在现有 TypeScript 技术栈中复用同样的模块边界。

| 能力 | Project3 | Project4 |
| --- | --- | --- |
| 支付宝 | RSA2 | RSA2 |
| 微信支付 | V2 模板 | V2 Native 模板 |
| 微信配置 | AppID + mch_id + API V2 Key | AppID + mch_id + API V2 Key + 服务器 IPv4 |
| 微信下单 | `pay/unifiedorder` | `pay/unifiedorder` |
| 微信查单 | `pay/orderquery` | `pay/orderquery` |
| 业务订单 | 独立订单存储 | D1 `billing_orders` |
| 支付日志 | 文件日志 | D1 `payment_logs` |
| 回调验签 | 支持 | 支持 |
| 幂等履约 | 业务自行接入 | `order_fulfillments` 强制保证 |
| 密钥管理 | 独立配置 | 超级管理员后台加密保存 |

## 微信 V2 全局配置

超级管理员打开：

- `/platform/wechat-v2`

需要填写：

1. AppID
2. 商户号 `mch_id`
3. API V2 Key
4. 服务器 IPv4（用于 `spbill_create_ip`）
5. Native 下单接口，默认 `https://api.mch.weixin.qq.com/pay/unifiedorder`
6. 订单查询接口，默认 `https://api.mch.weixin.qq.com/pay/orderquery`

API V2 Key 只在保存时提交，后端加密存储；再次打开页面只显示“已保存”，不会把明文密钥返回浏览器。

### 一键检查配置是否通

点击“检查全局配置是否通”时，Project4 会调用微信 V2 `orderquery` 查询一个随机、不会写入业务数据库的不存在订单号。

如果返回：

- `ORDERNOTEXIST`：这是**检查成功**，表示 AppID、商户号、API V2 Key、签名、服务器出网以及微信订单查询接口已经连通。
- `SIGNERROR`：API V2 Key 错误。
- `APPID_MCHID_NOT_MATCH`：AppID 与商户号不属于同一套商户配置。
- 通信失败：检查服务器出网、DNS、HTTPS 请求或微信接口可达性。

这个检查不会创建真实订单，也不会发生扣款。

## 主要接口

### 企业账单

- `POST /api/billing`：创建订单、续费、退款申请。
- `GET /api/billing`：查看套餐、订阅、订单和退款。

选择微信渠道时，创建订单走独立的微信 V2 Billing Adapter。

### 支付回调

- `POST /api/payments/callback?provider=alipay`
- `POST /api/payments/callback?provider=wechat`
- `POST /api/payments/callback?provider=gateway`

微信回调使用 V2 XML，并使用 API V2 Key 验签；验签成功后仍必须校验本地订单金额，最后才调用幂等履约。

### 主动订单查询

- `GET /api/payments/query?orderNo=业务订单号`

仅企业 Owner 可查询自己企业的订单。微信订单使用 V2 `orderquery`；查询到 `trade_state=SUCCESS` 后仍需验签、交易号和金额完全一致才允许开通权益。

### 超级管理员

- `/platform/wechat-v2`：微信 V2 全局配置和一键连通检查。
- `/platform/payment-lab`：Payment Lab 订单与日志监控页面。
- `GET /api/platform/payment/lab`：Payment Lab 监控数据接口。

## 微信 V2 退款说明

V2 自动退款接口需要商户 API 证书以及双向 TLS。Project4 当前 Worker 版不会把旧 API v3 退款代码错误用于 V2 商户。

微信 V2 订单提交退款申请后：

- 系统保留 `refund_requests` 记录；
- Payment Lab 留下人工退款日志；
- 由管理员在微信商户平台处理退款，或后续接入专用的带商户证书退款服务。

支付宝退款逻辑不受影响。

## 正式支付上线检查

1. **配置连通检查**可以在当前 HTTP 测试服务器完成，因为它是服务器主动请求微信 `orderquery`。
2. **真实收款与异步回调**必须使用公网 HTTPS 域名；当前 `http://IP:端口` 只适合部署验证。
3. 在 `/platform/wechat-v2` 保存微信 V2 参数并执行一键检查。
4. 支付宝继续使用应用私钥签名、支付宝公钥验签。
5. 微信支付使用 API V2 Key 对请求、响应和支付通知进行签名验证。
6. HTTPS 域名完成后，用最低金额跑完整闭环：创建订单 → Native 扫码 → 微信回调 → 验签 → 金额校验 → 幂等履约 → Payment Lab 日志 → 主动查单。
7. 禁止在 GitHub、支付日志、截图或前端响应里提交 API V2 Key、支付宝私钥或其他支付密钥。

## 数据迁移

`drizzle/0014_payment_lab.sql` 创建统一 `payment_logs` 表。私有部署执行 `scripts/start-private.sh` 时会应用尚未执行的本地 D1 migration。
