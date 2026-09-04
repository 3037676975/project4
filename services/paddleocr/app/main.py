import asyncio
import json
import os
import tempfile
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from paddleocr import PaddleOCR

app = FastAPI(title="KnowFlow PaddleOCR", version="1.1.0")

OCR_API_KEY = os.getenv("OCR_API_KEY", "").strip()
OCR_MODEL_VERSION = os.getenv("OCR_MODEL_VERSION", "PP-OCRv6").strip() or "PP-OCRv6"
OCR_DET_MODEL = os.getenv("OCR_DET_MODEL", "PP-OCRv6_small_det").strip() or "PP-OCRv6_small_det"
OCR_REC_MODEL = os.getenv("OCR_REC_MODEL", "PP-OCRv6_small_rec").strip() or "PP-OCRv6_small_rec"
MAX_FILE_BYTES = int(os.getenv("MAX_FILE_BYTES", str(12 * 1024 * 1024)))
MAX_CONCURRENCY = max(1, int(os.getenv("MAX_CONCURRENCY", "1")))
SUPPORTED_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tif", ".tiff"}
_semaphore = asyncio.Semaphore(MAX_CONCURRENCY)


def require_auth(authorization: str | None) -> None:
    if not OCR_API_KEY:
        return
    if authorization != f"Bearer {OCR_API_KEY}":
        raise HTTPException(status_code=401, detail="invalid OCR service token")


@lru_cache(maxsize=1)
def get_ocr() -> PaddleOCR:
    # PP-OCRv6 small keeps the self-hosted CPU/RAM footprint much lower than
    # the medium/server tier while preserving substantially better accuracy
    # than the tiny tier. Optional preprocessing models stay disabled.
    return PaddleOCR(
        ocr_version=OCR_MODEL_VERSION,
        text_detection_model_name=OCR_DET_MODEL,
        text_recognition_model_name=OCR_REC_MODEL,
        device="cpu",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )


def result_json(result: object) -> dict:
    raw = getattr(result, "json", {})
    if callable(raw):
        raw = raw()
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return {}
    if not isinstance(raw, dict):
        return {}
    nested = raw.get("res")
    return nested if isinstance(nested, dict) else raw


def recognize(path: str) -> tuple[str, int]:
    pages: list[str] = []
    for result in get_ocr().predict(path):
        data = result_json(result)
        texts = data.get("rec_texts") or []
        if not isinstance(texts, list):
            texts = []
        page_text = "\n".join(str(item).strip() for item in texts if str(item).strip()).strip()
        pages.append(page_text)
    if not pages:
        return "", 0
    if len(pages) == 1:
        return pages[0], 1
    markdown = "\n\n".join(
        f"## 第 {index + 1} 页\n\n{text}"
        for index, text in enumerate(pages)
        if text
    ).strip()
    return markdown, len(pages)


@app.get("/health")
async def health(authorization: str | None = Header(default=None)):
    require_auth(authorization)
    return {
        "ok": True,
        "engine": f"PaddleOCR {OCR_MODEL_VERSION}",
        "detectionModel": OCR_DET_MODEL,
        "recognitionModel": OCR_REC_MODEL,
        "device": "cpu",
        "modelLoaded": get_ocr.cache_info().currsize > 0,
        "freeLocal": True,
    }


@app.post("/v1/parse")
async def parse_document(
    file: UploadFile = File(...),
    mode: str = Form(default="text"),
    authorization: str | None = Header(default=None),
):
    require_auth(authorization)
    filename = file.filename or "upload.bin"
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise HTTPException(status_code=415, detail="PaddleOCR 本地服务仅处理 PDF 和图片；Office 文档请使用 Docling。")

    payload = await file.read(MAX_FILE_BYTES + 1)
    if len(payload) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail=f"文件超过本地 OCR 限制 {MAX_FILE_BYTES // 1024 // 1024} MB")
    if not payload:
        raise HTTPException(status_code=400, detail="上传文件为空")

    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp.write(payload)
            temp_path = temp.name
        async with _semaphore:
            try:
                text, page_count = await asyncio.to_thread(recognize, temp_path)
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"PaddleOCR 识别失败：{exc}") from exc
        if not text.strip():
            raise HTTPException(status_code=422, detail="PaddleOCR 没有识别到可用文字")
        return {
            "text": text,
            "markdown": text,
            "pageCount": page_count or 1,
            "engine": f"paddleocr:{OCR_MODEL_VERSION}:small",
            "mode": "table-text" if mode == "table" else "text",
            "freeLocal": True,
        }
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except FileNotFoundError:
                pass
