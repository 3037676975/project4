# Project4 本地 PaddleOCR 架构

Project4 私有化部署默认使用内置 PaddleOCR 处理企业上传的图片和扫描 PDF，从而避免每次 OCR 都调用付费云接口。

## 路由策略

- 企业真实文档识别：`knowflow -> paddleocr:8002 -> PP-OCRv6 (CPU)`
- 超级管理员的腾讯云/百度云“测试连接”：仍然测试对应云厂商，不会被本地 OCR 替换。
- 设置 `LOCAL_OCR_MODE=platform` 可恢复“企业文档使用超级管理员配置的云 OCR”。
- Office 文档仍可使用原有 Docling 文档解析服务。

## 安全

PaddleOCR 只绑定服务器 `127.0.0.1:8002`，容器间使用 `PARSER_API_KEY` Bearer Token，不向公网暴露 OCR API。

## 成本

本地 PaddleOCR 的 `usage_records.cost_micros` 固定记为 0，只记录页数与使用情况，不计云 OCR 费用。
