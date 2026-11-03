
from decimal import Decimal
import pytest

from app.services.costing import calculate_costing


def test_costing_calculation():
    result = calculate_costing(
        gross_weight_kg=Decimal("0.61"),
        material_rate_per_kg=Decimal("85"),
        scrap_percent=Decimal("5"),
        cycle_time_minutes=Decimal("3.2"),
        machine_hour_rate=Decimal("850"),
        overhead_percent=Decimal("10"),
        packing_cost_per_part=Decimal("5"),
        freight_cost_per_part=Decimal("3"),
        margin_percent=Decimal("20"),
        annual_volume=180000,
        gst_percent=Decimal("18"),
    )

    assert result["material_cost"] == Decimal("51.85")
    assert result["scrap_cost"] == Decimal("2.59")
    assert result["processing_cost"] == Decimal("45.33")
    assert result["overhead_cost"] == Decimal("9.98")
    assert result["total_cost"] == Decimal("117.75")
    assert result["selling_price"] == Decimal("147.19")
    assert result["annual_volume"] == 180000


def test_invalid_margin_is_rejected():
    with pytest.raises(ValueError):
        calculate_costing(
            gross_weight_kg=Decimal("1"),
            material_rate_per_kg=Decimal("100"),
            scrap_percent=Decimal("5"),
            cycle_time_minutes=Decimal("5"),
            machine_hour_rate=Decimal("500"),
            overhead_percent=Decimal("10"),
            packing_cost_per_part=Decimal("5"),
            freight_cost_per_part=Decimal("5"),
            margin_percent=Decimal("100"),
            annual_volume=1000,
        )


def test_zero_annual_volume_is_rejected():
    with pytest.raises(ValueError):
        calculate_costing(
            gross_weight_kg=Decimal("1"),
            material_rate_per_kg=Decimal("100"),
            scrap_percent=Decimal("5"),
            cycle_time_minutes=Decimal("5"),
            machine_hour_rate=Decimal("500"),
            overhead_percent=Decimal("10"),
            packing_cost_per_part=Decimal("5"),
            freight_cost_per_part=Decimal("5"),
            margin_percent=Decimal("20"),
            annual_volume=0,
        )

