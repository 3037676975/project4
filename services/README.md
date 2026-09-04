# Open-source model services

Project4 keeps CPU-heavy model workloads outside the main Next/Vinext application. Private deployment now includes a dedicated **PaddleOCR** service for free local OCR, while the existing Docling parser can still be enabled for Office/document parsing.

## Private deployment defaults

- `paddleocr`: PP-OCRv6 small detection + recognition models, CPU mode, internal port `8002`. Used by enterprise knowledge-base uploads by default.
- `document-parser`: Docling + RapidOCR, internal port `8001`, optional `parser` profile. Useful for DOCX/XLSX/PPTX and richer document conversion.
- `qdrant`: vector store.
- `email-relay`: SMTP relay.

The local PaddleOCR endpoint is protected with the existing `PARSER_API_KEY`; it is bound to `127.0.0.1` on the host and is not intended to be exposed publicly.

```bash
bash scripts/init-private.sh
```

`init-private.sh` creates or upgrades `.env.private` with:

```dotenv
LOCAL_OCR_MODE=paddleocr
```

With that default, real tenant image/scanned-PDF uploads follow:

```text
KnowFlow -> paddleocr:8002 -> PP-OCRv6 small -> extracted text -> Embedding -> Qdrant
```

The platform administrator can still save and test Tencent Cloud or Baidu Cloud OCR credentials. Those cloud settings are kept as optional diagnostics/fallback configuration and are not charged for normal tenant OCR while `LOCAL_OCR_MODE=paddleocr`.

To intentionally route tenant OCR back through the configured platform OCR provider, set:

```dotenv
LOCAL_OCR_MODE=platform
```

## Separate open-source service deployment

The older `docker-compose.open-source.yml` remains available when model services need to run on another Linux server:

```bash
cp .env.open-source.example .env.open-source
docker compose --env-file .env.open-source -f docker-compose.open-source.yml up -d --build
```

For externally hosted model services, put Nginx/Caddy/Cloudflare Tunnel in front of them, use HTTPS and bearer authentication, and do not expose raw model ports directly to the internet.
