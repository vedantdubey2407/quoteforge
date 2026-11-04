from app.services.rfq_extractor import extract_rfq_fields


def test_extracts_fields_from_quote_text():
    text = """
    QUOTATION DETAILS
    RFQ number RFQ-2611-024 Customer Company B
    Part name Rear wheel spindle Part number RWS-024
    Material EN8 Annual volume 1,80,000
    """
    result = extract_rfq_fields(text)
    fields = result["fields"]

    assert fields["rfq_number"]["value"] == "RFQ-2611-024"
    assert fields["customer_name"]["value"] == "Company B"
    assert fields["part_name"]["value"] == "Rear wheel spindle"
    assert fields["part_number"]["value"] == "RWS-024"
    assert fields["material"]["value"] == "EN8"
    assert fields["annual_volume"]["value"] == 180000
    assert fields["gross_weight_kg"]["value"] is None
    assert result["review_required"] is True


def test_does_not_invent_missing_fields():
    result = extract_rfq_fields("Part number: ABC-123 Material: EN8")
    fields = result["fields"]

    assert fields["part_number"]["value"] == "ABC-123"
    assert fields["material"]["value"] == "EN8"
    assert fields["annual_volume"]["status"] == "missing"
    assert fields["cycle_time_minutes"]["status"] == "missing"


def test_extracts_weight_and_cycle_time_when_labeled():
    result = extract_rfq_fields(
        "Gross weight: 0.61 kg Cycle time: 3.2 minutes Annual volume: 180000"
    )
    fields = result["fields"]

    assert fields["gross_weight_kg"]["value"] == 0.61
    assert fields["cycle_time_minutes"]["value"] == 3.2
    assert fields["annual_volume"]["value"] == 180000
