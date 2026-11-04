from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.routing_suggestions import suggest_routings

router = APIRouter(prefix="/api/routing", tags=["Routing Suggestions"])


class RoutingTarget(BaseModel):
    part_name: str = Field(min_length=1, max_length=200)
    material: str | None = Field(default=None, max_length=100)
    gross_weight_kg: float | None = Field(default=None, gt=0)
    cycle_time_minutes: float | None = Field(default=None, gt=0)


class HistoricalRoutingStep(BaseModel):
    sequence_number: int = Field(ge=1)
    operation_name: str = Field(min_length=1, max_length=150)
    machine_type: str | None = Field(default=None, max_length=150)
    estimated_cycle_time_minutes: float | None = Field(default=None, ge=0)
    source_note: str | None = Field(default=None, max_length=500)


class HistoricalPart(BaseModel):
    part_id: str | None = None
    part_number: str = Field(min_length=1, max_length=100)
    part_name: str = Field(min_length=1, max_length=200)
    material: str | None = Field(default=None, max_length=100)
    gross_weight_kg: float | None = Field(default=None, gt=0)
    cycle_time_minutes: float | None = Field(default=None, gt=0)
    source_type: str = "unknown"
    routing_steps: list[HistoricalRoutingStep] = Field(default_factory=list)


class RoutingSuggestionRequest(BaseModel):
    target: RoutingTarget
    historical_parts: list[HistoricalPart] = Field(min_length=1, max_length=500)
    limit: int = Field(default=3, ge=1, le=10)


@router.post("/suggest")
def get_routing_suggestions(request: RoutingSuggestionRequest) -> dict[str, Any]:
    """Rank supplied historical routes; no costing or automatic route approval occurs."""
    try:
        result = suggest_routings(
            target=request.target.model_dump(),
            historical_parts=[part.model_dump() for part in request.historical_parts],
            limit=request.limit,
        )
        return result
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to generate routing suggestions.",
        ) from exc
