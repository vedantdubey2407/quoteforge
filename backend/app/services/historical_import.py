import csv
import io
from typing import Any

EXPECTED_COLUMNS = {
    "record_id",
    "rfq_number",
    "quote_date",
    "customer_name",
    "customer_segment",
    "part_name",
    "part_number",
    "material",
    "gross_weight_kg",
    "annual_volume",
    "cycle_time_minutes",
    "machine_hour_rate_inr",
    "material_rate_inr_per_kg",
    "scrap_percent",
    "overhead_percent",
    "packing_inr_per_part",
    "freight_inr_per_part",
    "margin_percent",
    "material_cost_inr",
    "scrap_cost_inr",
    "processing_cost_inr",
    "overhead_cost_inr",
    "total_cost_inr",
    "quoted_unit_price_ex_gst_inr",
    "gst_percent",
    "quoted_unit_price_inc_gst_inr",
    "annual_quote_value_ex_gst_inr",
    "quote_status",
    "routing_operations",
    "data_source",
    "is_synthetic",
}

NUMERIC_COLUMNS = {
    "gross_weight_kg",
    "annual_volume",
    "cycle_time_minutes",
    "machine_hour_rate_inr",
    "material_rate_inr_per_kg",
    "scrap_percent",
    "overhead_percent",
    "packing_inr_per_part",
    "freight_inr_per_part",
    "margin_percent",
    "material_cost_inr",
    "scrap_cost_inr",
    "processing_cost_inr",
    "overhead_cost_inr",
    "total_cost_inr",
    "quoted_unit_price_ex_gst_inr",
    "gst_percent",
    "quoted_unit_price_inc_gst_inr",
    "annual_quote_value_ex_gst_inr",
}


def parse_historical_csv(file_bytes: bytes) -> list[dict[str, Any]]:
    """Validate and parse historical quote CSV records."""

    try:
        content = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("CSV must use UTF-8 encoding.") from exc

    reader = csv.DictReader(io.StringIO(content))

    if not reader.fieldnames:
        raise ValueError("CSV file is empty or has no header.")

    missing_columns = EXPECTED_COLUMNS - set(reader.fieldnames)

    if missing_columns:
        raise ValueError(
            f"CSV is missing required columns: {', '.join(sorted(missing_columns))}"
        )

    records = []
    seen_ids = set()

    for row_number, row in enumerate(reader, start=2):
        record = {}

        for column in EXPECTED_COLUMNS:
            value = (row.get(column) or "").strip()
            record[column] = value if value else None

        record_id = record["record_id"]

        if not record_id:
            raise ValueError(f"Missing record_id on CSV row {row_number}.")

        if record_id in seen_ids:
            raise ValueError(f"Duplicate record_id '{record_id}' in CSV.")

        seen_ids.add(record_id)

        for column in NUMERIC_COLUMNS:
            value = record[column]

            if value is None:
                continue

            try:
                number = float(value.replace(",", ""))
                record[column] = int(number) if column == "annual_volume" else number
            except ValueError as exc:
                raise ValueError(
                    f"Invalid number in column '{column}' on row {row_number}."
                ) from exc

        synthetic_value = (record["is_synthetic"] or "").lower()

        if synthetic_value not in {"true", "false"}:
            raise ValueError(f"Invalid is_synthetic value on row {row_number}.")

        record["is_synthetic"] = synthetic_value == "true"

        records.append(record)

    if not records:
        raise ValueError("CSV contains no historical quote records.")

    return records
