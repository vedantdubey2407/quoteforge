from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from pypdf import PdfReader
import xlrd

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
PDF_MIME = "application/pdf"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
XLS_MIME = "application/vnd.ms-excel"


class DocumentParseError(ValueError):
    """Raised when an RFQ document cannot be parsed safely."""


def parse_document(
    filename: str, file_bytes: bytes, content_type: str | None = None
) -> dict[str, Any]:
    """Extract source text from PDF/XLSX/XLS. No AI inference or costing occurs here."""
    if not file_bytes:
        raise DocumentParseError("The uploaded file is empty.")
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise DocumentParseError("File size must be 10 MB or less.")

    extension = Path(filename).suffix.lower()
    if extension == ".pdf" or content_type == PDF_MIME:
        text, pages = _parse_pdf(file_bytes)
        return {
            "filename": filename,
            "file_type": "pdf",
            "text": text,
            "pages": pages,
            "sheets": [],
            "character_count": len(text),
        }

    if extension == ".xlsx" or content_type == XLSX_MIME:
        sheets = _parse_xlsx(file_bytes)
        text = _sheets_to_text(sheets)
        return {
            "filename": filename,
            "file_type": "xlsx",
            "text": text,
            "pages": [],
            "sheets": sheets,
            "character_count": len(text),
        }

    if extension == ".xls" or content_type == XLS_MIME:
        sheets = _parse_xls(file_bytes)
        text = _sheets_to_text(sheets)
        return {
            "filename": filename,
            "file_type": "xls",
            "text": text,
            "pages": [],
            "sheets": sheets,
            "character_count": len(text),
        }

    raise DocumentParseError("Unsupported file type. Upload PDF, XLSX, or XLS.")


def _parse_pdf(file_bytes: bytes) -> tuple[str, list[dict[str, Any]]]:
    try:
        reader = PdfReader(BytesIO(file_bytes), strict=False)
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception as exc:
                raise DocumentParseError("The PDF is password-protected.") from exc

        pages, chunks = [], []
        for number, page in enumerate(reader.pages, start=1):
            page_text = (page.extract_text() or "").strip()
            pages.append({"page": number, "text": page_text})
            if page_text:
                chunks.append(f"[Page {number}]\n{page_text}")

        text = "\n\n".join(chunks).strip()
        if not text:
            raise DocumentParseError(
                "No selectable text was found. This may be a scanned PDF; OCR is not enabled yet."
            )
        return text, pages
    except DocumentParseError:
        raise
    except Exception as exc:
        raise DocumentParseError("Unable to read this PDF file.") from exc


def _clean_cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _parse_xlsx(file_bytes: bytes) -> list[dict[str, Any]]:
    try:
        workbook = load_workbook(BytesIO(file_bytes), read_only=True, data_only=True)
        sheets = []
        for worksheet in workbook.worksheets:
            rows = []
            for row in worksheet.iter_rows(values_only=True):
                values = [_clean_cell(value) for value in row]
                while values and not values[-1]:
                    values.pop()
                if any(values):
                    rows.append(values)
            sheets.append({"name": worksheet.title, "rows": rows})
        workbook.close()
        if not any(sheet["rows"] for sheet in sheets):
            raise DocumentParseError("No data rows were found in this Excel file.")
        return sheets
    except DocumentParseError:
        raise
    except Exception as exc:
        raise DocumentParseError("Unable to read this XLSX file.") from exc


def _parse_xls(file_bytes: bytes) -> list[dict[str, Any]]:
    try:
        workbook = xlrd.open_workbook(file_contents=file_bytes)
        sheets = []
        for worksheet in workbook.sheets():
            rows = []
            for row_index in range(worksheet.nrows):
                values = [
                    _clean_cell(value) for value in worksheet.row_values(row_index)
                ]
                while values and not values[-1]:
                    values.pop()
                if any(values):
                    rows.append(values)
            sheets.append({"name": worksheet.name, "rows": rows})
        if not any(sheet["rows"] for sheet in sheets):
            raise DocumentParseError("No data rows were found in this Excel file.")
        return sheets
    except DocumentParseError:
        raise
    except Exception as exc:
        raise DocumentParseError("Unable to read this XLS file.") from exc


def _sheets_to_text(sheets: list[dict[str, Any]]) -> str:
    sections = []
    for sheet in sheets:
        lines = [f"[Sheet: {sheet['name']}]"]
        lines.extend(" | ".join(row) for row in sheet["rows"])
        sections.append("\n".join(lines))
    return "\n\n".join(sections)
