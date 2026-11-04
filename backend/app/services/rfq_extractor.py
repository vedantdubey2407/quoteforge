from __future__ import annotations

import re
from typing import Any

FIELD_LABELS = {
    "rfq_number": ["RFQ number", "RFQ no", "RFQ #", "RFQ reference"],
    "customer_name": ["Customer name", "Customer", "Buyer"],
    "part_name": ["Part name", "Component name", "Item description", "Description"],
    "part_number": ["Part number", "Part no", "Component number", "Item code"],
    "material": ["Material grade", "Material", "Raw material"],
    "annual_volume": [
        "Annual volume",
        "Yearly volume",
        "Annual quantity",
        "Annual qty",
    ],
    "gross_weight_kg": ["Gross weight", "Part weight", "Weight"],
    "cycle_time_minutes": ["Cycle time", "Machining time", "Processing time"],
    "due_date": ["Due date", "Required by", "Delivery date"],
}

STOP_LABELS = [label for labels in FIELD_LABELS.values() for label in labels] + [
    "Quote version",
    "Created",
    "Cost breakdown",
    "Cost component",
    "Material cost",
    "Scrap cost",
    "Processing cost",
    "Overhead",
    "Packing",
    "Freight",
    "Total manufacturing cost",
    "Selling price",
    "GST",
    "Approval information",
    "Status",
    "Reviewed at",
    "QuoteForge",
]

STOP_PATTERN = "|".join(
    re.escape(label) for label in sorted(set(STOP_LABELS), key=len, reverse=True)
)


def extract_rfq_fields(text: str) -> dict[str, Any]:
    text = text.replace("\u00a0", " ").replace("\t", " ")
    text = re.sub(r"[ \r\f\v]+", " ", text)
    text = re.sub(r"\n+", " ", text).strip()

    fields = {}

    for field_name, labels in FIELD_LABELS.items():
        value = None
        source = None

        for label in sorted(labels, key=len, reverse=True):
            pattern = re.compile(
                rf"(?<![A-Za-z]){re.escape(label)}\s*[:\-]?\s*(.*?)"
                rf"(?=\s+(?:{STOP_PATTERN})\s*[:\-]?\s*|$)",
                re.IGNORECASE,
            )
            match = pattern.search(text)

            if match:
                candidate = match.group(1).strip(" :|-")
                if candidate:
                    value = candidate
                    source = f"{label} {candidate}"
                    break

        if field_name in {"annual_volume", "gross_weight_kg", "cycle_time_minutes"}:
            parsed = None
            if value:
                number = re.search(r"\d[\d,]*(?:\.\d+)?", value)
                if number:
                    cleaned = number.group().replace(",", "")
                    parsed = (
                        int(cleaned)
                        if field_name == "annual_volume"
                        else float(cleaned)
                    )
            value = parsed

        fields[field_name] = {
            "value": value,
            "source_text": source,
            "status": "extracted" if value is not None else "missing",
        }

    extracted_count = sum(field["status"] == "extracted" for field in fields.values())

    return {
        "fields": fields,
        "extracted_count": extracted_count,
        "total_fields": len(fields),
        "review_required": True,
        "note": (
            "Extracted values require estimator verification. "
            "Missing values must be completed manually."
        ),
    }
