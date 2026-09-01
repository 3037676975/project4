# Open-source OCR and embedding services

The Sites application runs on Cloudflare and cannot load Python ML models inside a request. This stack runs the two model services separately:

- `document-parser`: Docling with RapidOCR for scanned PDFs, images, DOCX, XLSX and PPTX.
- `embedding`: Infinity serving `BAAI/bge-m3` through an OpenAI-compatible `/v1/embeddings` API (1024 dimensions).

## Start on a Linux server

```bash
cp .env.open-source.example .env.open-source
# Replace both example secrets before starting.
docker compose --env-file .env.open-source -f docker-compose.open-source.yml up -d --build
```

The compose file binds both ports to `127.0.0.1`. Put Caddy, Nginx or a Cloudflare Tunnel in front of them and expose two public HTTPS names, for example:

- `https://embedding.example.com` -> `127.0.0.1:7997`
- `https://parser.example.com` -> `127.0.0.1:8001`

Do not expose either container directly to the internet. Keep the bearer tokens enabled, use different secrets, and restrict inbound traffic where possible.

## Configure KnowFlow

In **模型与 RAG**:

1. Choose **自建 Infinity / BGE-M3**. Enter `https://embedding.example.com/v1`, model `BAAI/bge-m3`, dimension `1024`, and `INFINITY_API_KEY`.
2. Choose **自建 Docling / RapidOCR**. Enter `https://parser.example.com`, engine `rapidocr`, and `PARSER_API_KEY`.
3. Test both connections, then use **全部重建** in the knowledge base so every saved chunk uses the same embedding model and dimension.

The first start downloads model weights into named Docker volumes. CPU mode is suitable for a functional test but can be slow; for production, switch Infinity to its GPU image and add the Docker GPU reservation appropriate for the server.
