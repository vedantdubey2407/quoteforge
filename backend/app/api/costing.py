from fastapi import APIRouter, HTTPException

from app.schemas.costing import CostingRequest
from app.services.costing import calculate_costing

router = APIRouter(prefix="/api/costing", tags=["Costing"])


@router.post("/calculate")
def calculate_part_cost(request: CostingRequest):
    try:
        result = calculate_costing(**request.model_dump())
        return {
            "success": True,
            "message": "Costing calculated successfully",
            "data": result,
        }
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
