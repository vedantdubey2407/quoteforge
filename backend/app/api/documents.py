from fastapi import APIRouter, UploadFile, File, HTTPException

from app.services.document_parser import (
    parse_document,
    DocumentParseError,
    MAX_FILE_SIZE_BYTES,
)
from app.services.rfq_extractor import extract_rfq_fields

router = APIRouter(prefix="/api/documents", tags=["Documents"])

ALLOWED_EXTENSIONS = {".pdf", ".xlsx", ".xls"}


@router.post("/parse")
async def parse_rfq_document(file: UploadFile = File(...)):
    """Parse an RFQ document and return source text plus labeled field extraction."""
    filename = file.filename or "unknown"
    extension_parts = filename.lower().rsplit(".", 1)

    if len(extension_parts) != 2 or f".{extension_parts[1]}" not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, XLSX and XLS files are supported.",
        )

    try:
        file_bytes = await file.read(MAX_FILE_SIZE_BYTES + 1)

        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail="File size must be 10 MB or less.",
            )

        parsed = parse_document(
            filename=filename,
            file_bytes=file_bytes,
            content_type=file.content_type,
        )
        structured = extract_rfq_fields(parsed["text"])

        return {
            "success": True,
            "message": "Document parsed. Extracted fields require estimator review.",
            "data": {
                **parsed,
                "extraction": structured,
            },
        }

    except DocumentParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to process the uploaded document.",
        ) from exc
    finally:
        await file.close()
