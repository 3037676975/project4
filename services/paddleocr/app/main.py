import asyncio
import json
import os
import tempfile
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from PIL import Image
from paddleocr import PaddleOCR, doc2md_convert, doc2md_supported_formats

OCR_API_KEY = os.getenv("OCR_API_KEY", "").strip()
OCR_MODEL_VERSION = os.getenv("OCR_MODEL_VERSION", "PP-OCRv6").strip() or "PP-OCRv6"
OCR_DET_MODEL = os.getenv("OCR_DET_MODEL", "PP-OCRv6_small_det").strip() or "PP-OCRv6_small_det"
OCR_REC_MODEL = os.getenv("OCR_REC_MODEL", "PP-OCRv6_small_rec").strip() or "PP-OCRv6_small_rec"
MAX_FILE_BYTES = int(os.getenv("MAX_FILE_BYTES", str(12 * 1024 * 1024)))
MAX_CONCURRENCY = max(1, int(os.getenv("MAX_CONCURRENCY", "1")))
OCR_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tif", ".tiff"}
OFFICE_SUFFIXES = {f".{str(value).lower().lstrip('.')}" for value in doc2md_supported_formats()}
SUPPORTED_SUFFIXES = OCR_SUFFIXES | OFFICE_SUFFIXES
_semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
_engine_ready = False


def require_auth(authorization: str | None) -> None:
    if not OCR_API_KEY:
        return
    if authorization != f"Bearer {OCR_API_KEY}":
        raise HTTPException(status_code=401, detail="invalid OCR service token")


@lru_cache(maxsize=1)
def get_ocr() -> PaddleOCR:
    # PaddlePaddle 3.3.x has a CPU/PIR -> oneDNN regression on some hosts.
    # Disable MKLDNN/oneDNN for predictable self-hosted CPU inference.
    return PaddleOCR(
        ocr_version=OCR_MODEL_VERSION,
        text_detection_model_name=OCR_DET_MODEL,
        text_recognition_model_name=OCR_REC_MODEL,
        device="cpu",
        enable_mkldnn=False,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )


def inference_probe() -> None:
    # Exercise the actual detection/recognition runtime during startup so a
    # health check cannot be green while model execution is broken.
    image = np.full((96, 320, 3), 255, dtype=np.uint8)
    image[26:70, 38:282] = 0
    list(get_ocr().predict(image))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _engine_ready
    try:
        await asyncio.to_thread(get_ocr)
        await asyncio.to_thread(inference_probe)
        _engine_ready = True
    except Exception as exc:
        _engine_ready = False
        raise RuntimeError(f"PaddleOCR inference self-test failed: {exc}") from exc
    yield


app = FastAPI(title="KnowFlow PaddleOCR", version="1.4.1", lifespan=lifespan)


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


def image_to_array(path: str) -> np.ndarray:
    # The platform smoke test and some browser-produced PNG/JPEG files can be
    # valid images that the Paddle path loader occasionally rejects. Decode via
    # Pillow first and pass a normalized RGB numpy array to PaddleOCR.
    with Image.open(path) as image:
        return np.asarray(image.convert("RGB"))


def recognize(path: str, suffix: str) -> tuple[str, int]:
    pages: list[str] = []
    source: str | np.ndarray = path if suffix == ".pdf" else image_to_array(path)
    for result in get_ocr().predict(source):
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


def office_to_markdown(path: str) -> str:
    result = doc2md_convert(path)
    markdown = str(getattr(result, "markdown", "") or "").strip()
    if not markdown:
        raise RuntimeError("doc2md 没有提取到可用内容")
    return markdown


@app.get("/health")
async def health(authorization: str | None = Header(default=None)):
    require_auth(authorization)
    if not _engine_ready or get_ocr.cache_info().currsize < 1:
        raise HTTPException(status_code=503, detail="PaddleOCR model is not ready")
    return {
        "ok": True,
        "ready": True,
        "engine": f"PaddleOCR {OCR_MODEL_VERSION}",
        "detectionModel": OCR_DET_MODEL,
        "recognitionModel": OCR_REC_MODEL,
        "device": "cpu",
        "mkldnn": False,
        "inferenceSelfTest": True,
        "modelLoaded": True,
        "freeLocal": True,
        "officeParser": "PaddleOCR doc2md",
        "officeFormats": sorted(OFFICE_SUFFIXES),
        "ocrFormats": sorted(OCR_SUFFIXES),
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
        raise HTTPException(
            status_code=415,
            detail="本地解析支持 PDF、图片、DOCX、XLSX、PPTX；旧版 DOC/XLS/PPT 请先另存为新版 Office 格式。",
        )

    payload = await file.read(MAX_FILE_BYTES + 1)
    if len(payload) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail=f"文件超过本地解析限制 {MAX_FILE_BYTES // 1024 // 1024} MB")
    if not payload:
        raise HTTPException(status_code=400, detail="上传文件为空")

    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp.write(payload)
            temp_path = temp.name

        if suffix in OFFICE_SUFFIXES:
            try:
                markdown = await asyncio.to_thread(office_to_markdown, temp_path)
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"doc2md Office 解析失败：{exc}") from exc
            return {
                "text": markdown,
                "markdown": markdown,
                "pageCount": None,
                "engine": "paddleocr:doc2md",
                "mode": "office-to-markdown",
                "usedOcr": False,
                "freeLocal": True,
            }

        if not _engine_ready:
            raise HTTPException(status_code=503, detail="PaddleOCR model is not ready")

        async with _semaphore:
            try:
                text, page_count = await asyncio.to_thread(recognize, temp_path, suffix)
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
            "usedOcr": True,
            "freeLocal": True,
        }
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except FileNotFoundError:
                pass
