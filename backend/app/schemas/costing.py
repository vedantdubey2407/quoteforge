from decimal import Decimal
from pydantic import BaseModel, Field


class CostingRequest(BaseModel):
    gross_weight_kg: Decimal = Field(gt=0)
    material_rate_per_kg: Decimal = Field(ge=0)
    scrap_percent: Decimal = Field(ge=0, le=100)
    cycle_time_minutes: Decimal = Field(ge=0)
    machine_hour_rate: Decimal = Field(ge=0)
    overhead_percent: Decimal = Field(ge=0, le=100)
    packing_cost_per_part: Decimal = Field(ge=0)
    freight_cost_per_part: Decimal = Field(ge=0)
    margin_percent: Decimal = Field(ge=0, lt=100)
    annual_volume: int = Field(gt=0)
    gst_percent: Decimal = Field(ge=0, le=100)
