from io import BytesIO

import pytest
from openpyxl import Workbook
from pypdf import PdfWriter

from app.services.document_parser import (
    DocumentParseError,
    MAX_FILE_SIZE_BYTES,
    parse_document,
)


def make_xlsx() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "RFQ"
    sheet.append(["Part Number", "Material", "Annual Volume"])
    sheet.append(["RWS-100", "EN8", 180000])
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def make_blank_pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=300)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def test_parse_xlsx_extracts_rows():
    result = parse_document(
        "sample.xlsx",
        make_xlsx(),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    assert result["file_type"] == "xlsx"
    assert "RWS-100 | EN8 | 180000" in result["text"]
    assert result["sheets"][0]["name"] == "RFQ"


def test_rejects_unsupported_file():
    with pytest.raises(DocumentParseError, match="Unsupported file type"):
        parse_document("sample.txt", b"hello", "text/plain")


def test_rejects_oversized_file():
    with pytest.raises(DocumentParseError, match="10 MB"):
        parse_document("large.pdf", b"x" * (MAX_FILE_SIZE_BYTES + 1), "application/pdf")


def test_pdf_without_text_explains_ocr_limitation():
    with pytest.raises(DocumentParseError, match="scanned PDF"):
        parse_document("blank.pdf", make_blank_pdf(), "application/pdf")
