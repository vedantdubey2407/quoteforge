import pytest

from app.services.historical_import import parse_historical_csv


def test_parses_valid_historical_csv():
    csv_text = """record_id,rfq_number,quote_date,customer_name,customer_segment,part_name,part_number,material,gross_weight_kg,annual_volume,cycle_time_minutes,machine_hour_rate_inr,material_rate_inr_per_kg,scrap_percent,overhead_percent,packing_inr_per_part,freight_inr_per_part,margin_percent,material_cost_inr,scrap_cost_inr,processing_cost_inr,overhead_cost_inr,total_cost_inr,quoted_unit_price_ex_gst_inr,gst_percent,quoted_unit_price_inc_gst_inr,annual_quote_value_ex_gst_inr,quote_status,routing_operations,data_source,is_synthetic
H001,RFQ-001,2026-01-01,Company A,OEM,Spindle,RWS-001,EN8,0.61,180000,3.2,950,85,5,10,5,3,15,50,2,30,8,90,105,18,123,18900000,Quoted,Turning;Grinding,synthetic_demo,TRUE
"""

    records = parse_historical_csv(csv_text.encode("utf-8"))

    assert len(records) == 1
    assert records[0]["record_id"] == "H001"
    assert records[0]["annual_volume"] == 180000
    assert records[0]["gross_weight_kg"] == 0.61
    assert records[0]["is_synthetic"] is True


def test_rejects_duplicate_record_ids():
    csv_text = """record_id
H001
H001
"""

    with pytest.raises(ValueError, match="missing required columns"):
        parse_historical_csv(csv_text.encode("utf-8"))


def test_rejects_empty_csv():
    with pytest.raises(ValueError):
        parse_historical_csv(b"")
