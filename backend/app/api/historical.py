from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import create_client

from app.core.config import settings
from app.core.supabase import supabase
from app.services.historical_import import parse_historical_csv

router = APIRouter(
    prefix="/api/historical",
    tags=["Historical Quotes"],
)

security = HTTPBearer()

auth_client = create_client(
    settings.supabase_url,
    settings.supabase_anon_key,
)

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
BATCH_SIZE = 200


def authenticate_estimator(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """Validate the access token and return the estimator user ID."""

    try:
        response = auth_client.auth.get_user(credentials.credentials)
        user = response.user

        if not user:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired access token.",
            )

    except HTTPException:
        raise
    except Exception as exc:
        print("AUTHENTICATION ERROR:", repr(exc))
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired access token.",
        )

    try:
        profile = (
            supabase.table("profiles")
            .select("id, role")
            .eq("id", user.id)
            .limit(1)
            .execute()
        )

        if not profile.data:
            raise HTTPException(
                status_code=403,
                detail="Estimator profile not found.",
            )

        if profile.data[0]["role"] != "estimator":
            raise HTTPException(
                status_code=403,
                detail="Only estimators can import historical quotes.",
            )

        return user.id

    except HTTPException:
        raise
    except Exception as exc:
        print("PROFILE VERIFICATION ERROR:", repr(exc))
        raise HTTPException(
            status_code=500,
            detail=f"Unable to verify estimator profile: {str(exc)}",
        ) from exc


@router.post("/import")
async def import_historical_quotes(
    file: UploadFile = File(...),
    user_id: str = Depends(authenticate_estimator),
) -> dict[str, Any]:
    """Validate and import historical quote records."""

    filename = file.filename or ""

    if not filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Only CSV files are supported.",
        )

    try:
        file_bytes = await file.read(MAX_FILE_SIZE_BYTES + 1)

        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail="CSV file must be 5 MB or less.",
            )

        try:
            records = parse_historical_csv(file_bytes)
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail=str(exc),
            ) from exc

        # Check whether any record IDs already exist.
        record_ids = [record["record_id"] for record in records]
        existing_ids = []

        for start in range(0, len(record_ids), BATCH_SIZE):
            batch = record_ids[start : start + BATCH_SIZE]

            result = (
                supabase.table("historical_quotes")
                .select("record_id")
                .in_("record_id", batch)
                .execute()
            )

            existing_ids.extend(row["record_id"] for row in result.data)

        if existing_ids:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Some records already exist. No records were imported.",
                    "duplicate_count": len(existing_ids),
                    "sample_duplicate_ids": existing_ids[:10],
                },
            )

        # Insert validated records.
        result = supabase.table("historical_quotes").insert(records).execute()

        return {
            "success": True,
            "message": "Historical quotes imported successfully.",
            "imported_count": len(result.data),
            "synthetic_count": sum(record["is_synthetic"] for record in records),
            "imported_by": user_id,
            "human_review_required": True,
        }

    except HTTPException:
        raise

    except Exception as exc:
        print("HISTORICAL IMPORT ERROR:", repr(exc))

        raise HTTPException(
            status_code=500,
            detail=f"Unable to import historical quote records: {str(exc)}",
        ) from exc

    finally:
        await file.close()


@router.get("/search")
def search_historical_quotes(
    part_number: str | None = None,
    part_name: str | None = None,
    material: str | None = None,
    customer_name: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(authenticate_estimator),
) -> dict[str, Any]:
    """Search imported historical quote records."""

    try:
        query = supabase.table("historical_quotes").select(
            "record_id, rfq_number, quote_date, customer_name, "
            "part_name, part_number, material, gross_weight_kg, "
            "annual_volume, cycle_time_minutes, routing_operations, "
            "total_cost_inr, quoted_unit_price_ex_gst_inr, "
            "quote_status, data_source, is_synthetic",
            count="exact",
        )

        if part_number:
            query = query.ilike("part_number", f"%{part_number}%")

        if part_name:
            query = query.ilike("part_name", f"%{part_name}%")

        if material:
            query = query.ilike("material", f"%{material}%")

        if customer_name:
            query = query.ilike("customer_name", f"%{customer_name}%")

        result = (
            query.order("quote_date", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

        return {
            "success": True,
            "count": len(result.data),
            "total_records": result.count,
            "limit": limit,
            "offset": offset,
            "results": result.data,
            "human_review_required": True,
        }

    except Exception as exc:
        print("HISTORICAL SEARCH ERROR:", repr(exc))
        raise HTTPException(
            status_code=500,
            detail="Unable to search historical quote records.",
        ) from exc
