from decimal import Decimal, ROUND_HALF_UP

CENT = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    """Round monetary values to two decimal places."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def calculate_costing(
    gross_weight_kg: Decimal,
    material_rate_per_kg: Decimal,
    scrap_percent: Decimal,
    cycle_time_minutes: Decimal,
    machine_hour_rate: Decimal,
    overhead_percent: Decimal,
    packing_cost_per_part: Decimal,
    freight_cost_per_part: Decimal,
    margin_percent: Decimal,
    annual_volume: int,
    gst_percent: Decimal = Decimal("18"),
) -> dict:
    """Calculate manufacturing cost and selling price for one part."""

    # Validate inputs
    if gross_weight_kg <= 0:
        raise ValueError("Gross weight must be greater than zero.")

    if material_rate_per_kg < 0 or machine_hour_rate < 0:
        raise ValueError("Rates cannot be negative.")

    if cycle_time_minutes < 0:
        raise ValueError("Cycle time cannot be negative.")

    if not Decimal("0") <= scrap_percent <= Decimal("100"):
        raise ValueError("Scrap percentage must be between 0 and 100.")

    if not Decimal("0") <= overhead_percent <= Decimal("100"):
        raise ValueError("Overhead percentage must be between 0 and 100.")

    if not Decimal("0") <= margin_percent < Decimal("100"):
        raise ValueError("Margin must be between 0 and 100.")

    if packing_cost_per_part < 0 or freight_cost_per_part < 0:
        raise ValueError("Packing and freight cannot be negative.")

    if not Decimal("0") <= gst_percent <= Decimal("100"):
        raise ValueError("GST percentage must be between 0 and 100.")

    if annual_volume <= 0:
        raise ValueError("Annual volume must be greater than zero.")

    # 1. Material cost
    material_cost = gross_weight_kg * material_rate_per_kg

    # 2. Scrap cost
    scrap_cost = material_cost * scrap_percent / Decimal("100")

    # 3. Processing cost
    processing_cost = (cycle_time_minutes / Decimal("60")) * machine_hour_rate

    # 4. Overhead cost
    overhead_base = material_cost + scrap_cost + processing_cost
    overhead_cost = overhead_base * overhead_percent / Decimal("100")

    # 5. Total manufacturing cost per part
    total_cost = (
        material_cost
        + scrap_cost
        + processing_cost
        + overhead_cost
        + packing_cost_per_part
        + freight_cost_per_part
    )

    # 6. Selling price using gross margin
    selling_price = money(total_cost / (Decimal("1") - margin_percent / Decimal("100")))

    # 7. GST is separate from the base selling price
    gst_amount = selling_price * gst_percent / Decimal("100")
    price_including_gst = selling_price + gst_amount

    # 8. Annual quote value excludes GST
    annual_value = selling_price * annual_volume

    return {
        "material_cost": money(material_cost),
        "scrap_cost": money(scrap_cost),
        "processing_cost": money(processing_cost),
        "overhead_cost": money(overhead_cost),
        "packing_cost": money(packing_cost_per_part),
        "freight_cost": money(freight_cost_per_part),
        "total_cost": money(total_cost),
        "margin_percent": margin_percent,
        "selling_price": money(selling_price),
        "gst_percent": gst_percent,
        "gst_amount": money(gst_amount),
        "price_including_gst": money(price_including_gst),
        "annual_volume": annual_volume,
        "annual_value": money(annual_value),
    }
