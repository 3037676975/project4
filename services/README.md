# Project4 本地服务说明

Project4 将 CPU/持久化类能力拆成独立容器，主应用只负责业务编排。

## 当前默认服务

- `paddleocr`：**默认 OCR 与 Office 文档转换服务**。使用 PP-OCRv6 small 检测/识别模型，CPU 推理，内部端口 `8002`；图片与扫描 PDF 做 OCR，DOCX/XLSX/PPTX 通过 PaddleOCR `doc2md` 转 Markdown。
- `qdrant`：默认向量数据库，内部端口 `6333`。
- `email-relay`：SMTP 中继，内部端口 `8025`。
- `operations-sweeper`：后台巡检/清理任务。

可选兼容服务：

- `document-parser`：Docling + RapidOCR，`parser` profile，内部端口 `8001`。默认部署不依赖它，仅在需要兼容复杂文档解析时手动启用。

## 默认 OCR 链路

```text
企业上传文件
  -> KnowFlow
  -> paddleocr:8002
  -> PP-OCRv6 / doc2md
  -> 文本切片
  -> Embedding
  -> Qdrant
```

`paddleocr` 使用 `.env.private` 中的 `PARSER_API_KEY` 作为 Bearer Token。宿主机端口只绑定 `127.0.0.1:8002`，不要向公网开放。

首次私有化部署：

```bash
bash scripts/init-private.sh
```

检查服务：

```bash
docker compose --env-file .env.private -f docker-compose.private.yml ps
bash scripts/verify-private-services.sh
```

查看 OCR 日志：

```bash
docker compose --env-file .env.private -f docker-compose.private.yml logs -f --tail=200 paddleocr
```

## 关于云 OCR

当前私有化主链路已经取消百度云/腾讯云 OCR 依赖，正常企业文档识别不应产生云 OCR 调用费用。旧 Provider 兼容入口不应绕过本地 PaddleOCR 主链路。

## `docker-compose.open-source.yml`

该文件继续保留，用于需要把模型服务拆到另一台 Linux 服务器的场景，不属于本次清理对象。若外置模型服务，必须通过 HTTPS、鉴权和反向代理保护，禁止直接暴露裸模型端口。
