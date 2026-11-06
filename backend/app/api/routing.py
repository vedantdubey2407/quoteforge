from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from supabase import create_client

from app.core.config import settings
from app.core.supabase import supabase
from app.services.routing_suggestions import suggest_routings

router = APIRouter(
    prefix="/api/routing",
    tags=["Routing Suggestions"],
)

security = HTTPBearer()

# Separate client for validating user access tokens.
auth_client = create_client(
    settings.supabase_url,
    settings.supabase_anon_key,
)


class RoutingSuggestionRequest(BaseModel):
    rfq_id: UUID
    part_id: UUID
    limit: int = Field(default=3, ge=1, le=10)


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
    except Exception:
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
                detail="Only estimators can request routing suggestions.",
            )

        return user.id

    except HTTPException:
        raise
    except Exception as exc:
        print("ESTIMATOR AUTH ERROR:", repr(exc))
        raise HTTPException(
            status_code=500,
            detail="Unable to verify estimator profile.",
        )


@router.post("/suggest")
def get_routing_suggestions(
    request: RoutingSuggestionRequest,
    user_id: str = Depends(authenticate_estimator),
) -> dict[str, Any]:
    """Generate suggestions from existing RFQs and imported historical quotes."""

    try:
        # 1. Verify RFQ ownership.
        rfq_result = (
            supabase.table("rfqs")
            .select("id, owner_id, customer_id, rfq_number")
            .eq("id", str(request.rfq_id))
            .eq("owner_id", user_id)
            .limit(1)
            .execute()
        )

        if not rfq_result.data:
            raise HTTPException(
                status_code=404,
                detail="RFQ not found or access denied.",
            )

        target_rfq = rfq_result.data[0]

        # 2. Verify the part belongs to the requested RFQ.
        part_result = (
            supabase.table("parts")
            .select(
                "id, rfq_id, part_number, part_name, material, "
                "gross_weight_kg, cycle_time_minutes"
            )
            .eq("id", str(request.part_id))
            .eq("rfq_id", str(request.rfq_id))
            .limit(1)
            .execute()
        )

        if not part_result.data:
            raise HTTPException(
                status_code=404,
                detail="Part not found in this RFQ.",
            )

        target_part = part_result.data[0]

        target = {
            "part_id": target_part["id"],
            "part_number": target_part["part_number"],
            "part_name": target_part["part_name"],
            "material": target_part.get("material"),
            "gross_weight_kg": target_part.get("gross_weight_kg"),
            "cycle_time_minutes": target_part.get("cycle_time_minutes"),
        }

        # 3. Get the customer's name for imported historical matching.
        customer_result = (
            supabase.table("customers")
            .select("id, name")
            .eq("id", target_rfq["customer_id"])
            .limit(1)
            .execute()
        )

        if not customer_result.data:
            raise HTTPException(
                status_code=404,
                detail="Customer associated with this RFQ was not found.",
            )

        customer_name = customer_result.data[0]["name"]

        historical_candidates: list[dict[str, Any]] = []

        # ---------------------------------------------------------
        # SOURCE 1: Existing RFQs belonging to the same estimator
        # and customer.
        # ---------------------------------------------------------

        historical_rfqs = (
            supabase.table("rfqs")
            .select("id, rfq_number")
            .eq("owner_id", user_id)
            .eq("customer_id", target_rfq["customer_id"])
            .neq("id", str(request.rfq_id))
            .execute()
        )

        historical_rfq_rows = historical_rfqs.data or []

        historical_rfq_ids = [row["id"] for row in historical_rfq_rows]

        rfq_numbers_by_id = {
            row["id"]: row.get("rfq_number") for row in historical_rfq_rows
        }

        if historical_rfq_ids:
            # 4. Retrieve previous parts.
            parts_result = (
                supabase.table("parts")
                .select(
                    "id, rfq_id, part_number, part_name, material, "
                    "gross_weight_kg, cycle_time_minutes"
                )
                .in_("rfq_id", historical_rfq_ids)
                .execute()
            )

            historical_parts = parts_result.data or []

            if historical_parts:
                part_ids = [part["id"] for part in historical_parts]

                # 5. Retrieve routing records.
                routings_result = (
                    supabase.table("part_routings")
                    .select("id, part_id, source_type")
                    .in_("part_id", part_ids)
                    .execute()
                )

                routings = routings_result.data or []

                if routings:
                    routing_ids = [routing["id"] for routing in routings]

                    # 6. Retrieve routing operations.
                    steps_result = (
                        supabase.table("routing_steps")
                        .select(
                            "routing_id, sequence_number, operation_name, "
                            "machine_type, estimated_cycle_time_minutes, "
                            "source_note"
                        )
                        .in_("routing_id", routing_ids)
                        .order("sequence_number")
                        .execute()
                    )

                    # 7. Assemble existing historical candidates.
                    parts_by_id = {part["id"]: part for part in historical_parts}

                    steps_by_routing: dict[str, list[dict]] = {}

                    for step in steps_result.data or []:
                        steps_by_routing.setdefault(step["routing_id"], []).append(
                            {
                                "sequence_number": step["sequence_number"],
                                "operation_name": step["operation_name"],
                                "machine_type": step.get("machine_type"),
                                "estimated_cycle_time_minutes": step.get(
                                    "estimated_cycle_time_minutes"
                                ),
                                "source_note": step.get("source_note"),
                            }
                        )

                    for routing in routings:
                        part = parts_by_id.get(routing["part_id"])

                        if not part:
                            continue

                        steps = steps_by_routing.get(routing["id"], [])

                        if not steps:
                            continue

                        historical_candidates.append(
                            {
                                "part_id": part["id"],
                                "record_id": None,
                                "rfq_number": rfq_numbers_by_id.get(part["rfq_id"]),
                                "quote_date": None,
                                "customer_name": customer_name,
                                "part_number": part["part_number"],
                                "part_name": part["part_name"],
                                "material": part.get("material"),
                                "gross_weight_kg": part.get("gross_weight_kg"),
                                "cycle_time_minutes": part.get("cycle_time_minutes"),
                                "source_type": routing["source_type"],
                                "data_source": "existing_rfq",
                                "is_synthetic": False,
                                "routing_steps": steps,
                            }
                        )

        # ---------------------------------------------------------
        # SOURCE 2: Imported historical CSV records.
        # ---------------------------------------------------------

        imported_result = (
            supabase.table("historical_quotes")
            .select(
                "record_id, rfq_number, quote_date, customer_name, "
                "part_number, part_name, material, gross_weight_kg, "
                "annual_volume, routing_operations, is_synthetic"
            )
            .ilike("customer_name", customer_name)
            .limit(1000)
            .execute()
        )

        imported_records = imported_result.data or []

        for record in imported_records:
            operations_text = record.get("routing_operations") or ""

            operations = [
                operation.strip()
                for operation in operations_text.split(";")
                if operation.strip()
            ]

            if not operations:
                continue

            imported_steps = [
                {
                    "sequence_number": index,
                    "operation_name": operation,
                    "machine_type": None,
                    "estimated_cycle_time_minutes": None,
                    "source_note": (
                        "Imported historical CSV operation. "
                        "Machine and cycle-time details were not "
                        "provided in the source record."
                    ),
                }
                for index, operation in enumerate(operations, start=1)
            ]

            historical_candidates.append(
                {
                    "part_id": None,
                    "record_id": record["record_id"],
                    "rfq_number": record.get("rfq_number"),
                    "quote_date": record.get("quote_date"),
                    "customer_name": record.get("customer_name"),
                    "part_number": record.get("part_number"),
                    "part_name": record.get("part_name"),
                    "material": record.get("material"),
                    "gross_weight_kg": record.get("gross_weight_kg"),
                    "annual_volume": record.get("annual_volume"),
                    "cycle_time_minutes": None,
                    "source_type": "imported_historical_csv",
                    "data_source": "historical_quotes",
                    "is_synthetic": record.get("is_synthetic"),
                    "routing_steps": imported_steps,
                }
            )

        # ---------------------------------------------------------
        # Combine both sources and rank suggestions.
        # ---------------------------------------------------------

        if not historical_candidates:
            return {
                "success": True,
                "message": (
                    "No historical routing records were found " "for this customer."
                ),
                "target_part": target_part["part_number"],
                "historical_parts_considered": 0,
                "suggestions": [],
                "human_review_required": True,
            }

        result = suggest_routings(
            target=target,
            historical_parts=historical_candidates,
            limit=request.limit,
        )

        return {
            "success": True,
            "message": "Routing suggestions generated successfully.",
            "target_part": target_part["part_number"],
            "historical_parts_considered": len(historical_candidates),
            "existing_rfq_candidates": sum(
                1
                for item in historical_candidates
                if item.get("data_source") == "existing_rfq"
            ),
            "imported_csv_candidates": sum(
                1
                for item in historical_candidates
                if item.get("data_source") == "historical_quotes"
            ),
            "data": result,
            "human_review_required": True,
        }

    except HTTPException:
        raise
    except Exception as exc:
        print("ROUTING SUGGESTION ERROR:", repr(exc))
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve historical routing suggestions.",
        )


# -------------------------------------------------------------
# ROUTING REVIEW REQUEST
# -------------------------------------------------------------


class RoutingReviewRequest(BaseModel):
    rfq_id: UUID
    target_part_id: UUID

    # Exactly one of these must be provided.
    suggested_part_id: UUID | None = None
    historical_record_id: str | None = None

    similarity_score: float = Field(ge=0, le=100)
    source_type: str = Field(min_length=1, max_length=100)
    suggestion_snapshot: dict[str, Any]


@router.post("/review")
def save_routing_review(
    request: RoutingReviewRequest,
    user_id: str = Depends(authenticate_estimator),
) -> dict[str, Any]:
    """Persist an estimator's review of a historical routing suggestion."""

    try:
        # Exactly one source identifier is required.
        has_existing_part = request.suggested_part_id is not None
        has_imported_record = request.historical_record_id is not None

        if has_existing_part == has_imported_record:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Provide exactly one of suggested_part_id "
                    "or historical_record_id."
                ),
            )

        # 1. Verify ownership of the target RFQ.
        rfq_result = (
            supabase.table("rfqs")
            .select("id, owner_id, customer_id")
            .eq("id", str(request.rfq_id))
            .eq("owner_id", user_id)
            .limit(1)
            .execute()
        )

        if not rfq_result.data:
            raise HTTPException(
                status_code=404,
                detail="RFQ not found or access denied.",
            )

        target_rfq = rfq_result.data[0]

        # 2. Verify target part belongs to this RFQ.
        target_part_result = (
            supabase.table("parts")
            .select("id")
            .eq("id", str(request.target_part_id))
            .eq("rfq_id", str(request.rfq_id))
            .limit(1)
            .execute()
        )

        if not target_part_result.data:
            raise HTTPException(
                status_code=404,
                detail="Target part not found in this RFQ.",
            )

        review_data = {
            "rfq_id": str(request.rfq_id),
            "target_part_id": str(request.target_part_id),
            "suggested_part_id": None,
            "historical_record_id": None,
            "reviewed_by": user_id,
            "similarity_score": request.similarity_score,
            "source_type": request.source_type,
            "review_status": "reviewed",
            "suggestion_snapshot": request.suggestion_snapshot,
        }

        # ---------------------------------------------------------
        # SOURCE A: Existing historical part.
        # ---------------------------------------------------------

        if has_existing_part:
            suggested_part_result = (
                supabase.table("parts")
                .select("id, rfq_id")
                .eq("id", str(request.suggested_part_id))
                .limit(1)
                .execute()
            )

            if not suggested_part_result.data:
                raise HTTPException(
                    status_code=404,
                    detail="Suggested historical part not found.",
                )

            suggested_rfq_result = (
                supabase.table("rfqs")
                .select("id, owner_id, customer_id")
                .eq(
                    "id",
                    suggested_part_result.data[0]["rfq_id"],
                )
                .eq("owner_id", user_id)
                .limit(1)
                .execute()
            )

            if not suggested_rfq_result.data:
                raise HTTPException(
                    status_code=403,
                    detail="Suggested part is not accessible.",
                )

            suggested_rfq = suggested_rfq_result.data[0]

            if suggested_rfq["customer_id"] != target_rfq["customer_id"]:
                raise HTTPException(
                    status_code=403,
                    detail="Suggested part belongs to a different customer.",
                )

            if suggested_rfq["id"] == target_rfq["id"]:
                raise HTTPException(
                    status_code=422,
                    detail="A current part cannot be reviewed as historical.",
                )

            review_data["suggested_part_id"] = str(request.suggested_part_id)

            result = (
                supabase.table("routing_reviews")
                .upsert(
                    review_data,
                    on_conflict=(
                        "rfq_id,target_part_id," "suggested_part_id,reviewed_by"
                    ),
                )
                .execute()
            )

        # ---------------------------------------------------------
        # SOURCE B: Imported historical CSV record.
        # ---------------------------------------------------------

        else:
            imported_record_result = (
                supabase.table("historical_quotes")
                .select("record_id, customer_name")
                .eq("record_id", request.historical_record_id)
                .limit(1)
                .execute()
            )

            if not imported_record_result.data:
                raise HTTPException(
                    status_code=404,
                    detail="Imported historical record not found.",
                )

            imported_record = imported_record_result.data[0]

            # Verify the imported record belongs to the same customer.
            customer_result = (
                supabase.table("customers")
                .select("name")
                .eq("id", target_rfq["customer_id"])
                .limit(1)
                .execute()
            )

            if not customer_result.data:
                raise HTTPException(
                    status_code=404,
                    detail="Customer associated with this RFQ was not found.",
                )

            target_customer_name = customer_result.data[0]["name"]

            if (imported_record.get("customer_name") or "").strip().lower() != (
                target_customer_name or ""
            ).strip().lower():
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Imported historical record belongs to " "a different customer."
                    ),
                )

            review_data["historical_record_id"] = imported_record["record_id"]

            # The historical unique index is partial. Find an existing
            # review first, then update it or insert a new one.
            existing_review = (
                supabase.table("routing_reviews")
                .select("id")
                .eq("rfq_id", str(request.rfq_id))
                .eq("target_part_id", str(request.target_part_id))
                .eq(
                    "historical_record_id",
                    imported_record["record_id"],
                )
                .eq("reviewed_by", user_id)
                .limit(1)
                .execute()
            )

            if existing_review.data:
                result = (
                    supabase.table("routing_reviews")
                    .update(review_data)
                    .eq("id", existing_review.data[0]["id"])
                    .execute()
                )
            else:
                result = supabase.table("routing_reviews").insert(review_data).execute()

        return {
            "success": True,
            "message": "Routing review saved successfully.",
            "data": result.data,
        }

    except HTTPException:
        raise
    except Exception as exc:
        print("ROUTING REVIEW ERROR:", repr(exc))
        raise HTTPException(
            status_code=500,
            detail="Unable to save routing review.",
        )


@router.get("/reviews")
def get_routing_reviews(
    rfq_id: UUID,
    part_id: UUID,
    user_id: str = Depends(authenticate_estimator),
) -> dict[str, Any]:
    """Retrieve previously saved reviews for an owned RFQ part."""

    try:
        # 1. Verify RFQ ownership.
        rfq_result = (
            supabase.table("rfqs")
            .select("id")
            .eq("id", str(rfq_id))
            .eq("owner_id", user_id)
            .limit(1)
            .execute()
        )

        if not rfq_result.data:
            raise HTTPException(
                status_code=404,
                detail="RFQ not found or access denied.",
            )

        # 2. Verify the part belongs to this RFQ.
        part_result = (
            supabase.table("parts")
            .select("id")
            .eq("id", str(part_id))
            .eq("rfq_id", str(rfq_id))
            .limit(1)
            .execute()
        )

        if not part_result.data:
            raise HTTPException(
                status_code=404,
                detail="Part not found in this RFQ.",
            )

        # 3. Retrieve both existing-part and imported-record reviews.
        result = (
            supabase.table("routing_reviews")
            .select("*")
            .eq("rfq_id", str(rfq_id))
            .eq("target_part_id", str(part_id))
            .eq("reviewed_by", user_id)
            .order("reviewed_at", desc=True)
            .execute()
        )

        return {
            "success": True,
            "reviews": result.data,
            "count": len(result.data),
        }

    except HTTPException:
        raise
    except Exception as exc:
        print("ROUTING REVIEWS ERROR:", repr(exc))
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve routing reviews.",
        )
