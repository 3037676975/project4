import asyncio
import os
import secrets
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, UploadFile, status
from pydantic import BaseModel


MAX_FILE_BYTES = int(os.getenv("MAX_FILE_BYTES", str(25 * 1024 * 1024)))
PARSE_TIMEOUT_SECONDS = int(os.getenv("PARSE_TIMEOUT_SECONDS", "300"))
MAX_CONCURRENCY = max(1, int(os.getenv("MAX_CONCURRENCY", "1")))
PARSER_API_KEY = os.getenv("PARSER_API_KEY", "")
SUPPORTED_SUFFIXES = {
    ".pdf",
    ".docx",
    ".xlsx",
    ".pptx",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".tif",
    ".tiff",
    ".bmp",
}

app = FastAPI(
    title="KnowFlow Docling Parser",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
parse_slots = asyncio.Semaphore(MAX_CONCURRENCY)


class ParseResult(BaseModel):
    text: str
    markdown: str
    pageCount: int | None = None
    engine: str = "docling+rapidocr"


def require_bearer(authorization: Annotated[str | None, Header()] = None) -> None:
    if len(PARSER_API_KEY) < 12:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="PARSER_API_KEY is not configured")
    scheme, _, supplied = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(supplied, PARSER_API_KEY):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid bearer token")


@lru_cache(maxsize=1)
def get_converter():
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions, RapidOcrOptions
    from docling.document_converter import DocumentConverter, ImageFormatOption, PdfFormatOption

    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = True
    pipeline_options.do_table_structure = True
    pipeline_options.table_structure_options.do_cell_matching = True
    pipeline_options.ocr_options = RapidOcrOptions(lang=["chinese"])

    return DocumentConverter(
        allowed_formats=[
            InputFormat.PDF,
            InputFormat.IMAGE,
            InputFormat.DOCX,
            InputFormat.XLSX,
            InputFormat.PPTX,
        ],
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
            InputFormat.IMAGE: ImageFormatOption(pipeline_options=pipeline_options),
        },
    )


def convert_document(path: Path) -> ParseResult:
    converted = get_converter().convert(path)
    markdown = converted.document.export_to_markdown().strip()
    if not markdown:
        raise ValueError("Docling returned empty content")
    pages = getattr(converted.document, "pages", None)
    return ParseResult(
        text=markdown,
        markdown=markdown,
        pageCount=len(pages) if pages is not None else None,
    )


@app.get("/health", dependencies=[Depends(require_bearer)])
async def health():
    return {
        "status": "ok",
        "engine": "docling+rapidocr",
        "formats": sorted(suffix.removeprefix(".") for suffix in SUPPORTED_SUFFIXES),
    }


@app.post("/v1/parse", response_model=ParseResult, dependencies=[Depends(require_bearer)])
async def parse(file: UploadFile):
    filename = Path(file.filename or "upload").name
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported document format")

    content = await file.read(MAX_FILE_BYTES + 1)
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File is too large")

    with tempfile.TemporaryDirectory(prefix="knowflow-") as temp_dir:
        input_path = Path(temp_dir) / f"input{suffix}"
        input_path.write_bytes(content)
        try:
            async with parse_slots:
                return await asyncio.wait_for(
                    asyncio.to_thread(convert_document, input_path),
                    timeout=PARSE_TIMEOUT_SECONDS,
                )
        except TimeoutError as error:
            raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Document parsing timed out") from error
        except HTTPException:
            raise
        except Exception as error:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Document parsing failed: {error}") from error
