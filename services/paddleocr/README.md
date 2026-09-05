# PaddleOCR local service

Internal-only parsing service for Project4 private deployments. The API is protected by the same `PARSER_API_KEY` used by the application.

- Images and scanned PDFs: PP-OCRv6 small detection + recognition on CPU.
- DOCX / XLSX / PPTX: PaddleOCR 3.7 `doc2md` converts the native Office structure directly to Markdown; no visual OCR model is used for these files.
- `/health`: reports OCR inference readiness and the installed Office formats.
- `/v1/parse`: accepts multipart `file` plus optional `mode`.

The service binds to the Docker private network and `127.0.0.1:8002`; it is not intended to be exposed directly to the public internet.
