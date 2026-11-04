from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any


def _normalise(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def _material_similarity(target: str | None, candidate: str | None) -> float:
    left = _normalise(target)
    right = _normalise(candidate)
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0

    # Exact grade tokens are stronger evidence than broad substring matches.
    left_tokens = set(left.split())
    right_tokens = set(right.split())
    if left_tokens & right_tokens:
        return 0.65
    return SequenceMatcher(None, left, right).ratio() * 0.5


def _weight_similarity(target: float | None, candidate: float | None) -> float:
    if target is None or candidate is None or target <= 0 or candidate <= 0:
        return 0.0
    ratio = min(target, candidate) / max(target, candidate)
    return max(0.0, min(1.0, ratio))


def _name_similarity(target: str | None, candidate: str | None) -> float:
    left = _normalise(target)
    right = _normalise(candidate)
    if not left or not right:
        return 0.0
    left_tokens = set(left.split())
    right_tokens = set(right.split())
    token_score = (
        len(left_tokens & right_tokens) / len(left_tokens | right_tokens)
        if left_tokens | right_tokens
        else 0.0
    )
    sequence_score = SequenceMatcher(None, left, right).ratio()
    return max(token_score, sequence_score)


def _cycle_similarity(target: float | None, candidate: float | None) -> float:
    if target is None or candidate is None or target <= 0 or candidate <= 0:
        return 0.0
    return min(target, candidate) / max(target, candidate)


def _score_candidate(
    target: dict[str, Any], candidate: dict[str, Any]
) -> dict[str, Any]:
    material = _material_similarity(target.get("material"), candidate.get("material"))
    weight = _weight_similarity(
        target.get("gross_weight_kg"), candidate.get("gross_weight_kg")
    )
    name = _name_similarity(target.get("part_name"), candidate.get("part_name"))
    cycle = _cycle_similarity(
        target.get("cycle_time_minutes"), candidate.get("cycle_time_minutes")
    )

    # Material is the strongest signal for manufacturing process similarity.
    weighted = material * 0.45 + weight * 0.25 + name * 0.20 + cycle * 0.10
    available_weight = sum(
        weight_part
        for value, weight_part in (
            (target.get("material") and candidate.get("material"), 0.45),
            (target.get("gross_weight_kg") and candidate.get("gross_weight_kg"), 0.25),
            (target.get("part_name") and candidate.get("part_name"), 0.20),
            (
                target.get("cycle_time_minutes")
                and candidate.get("cycle_time_minutes"),
                0.10,
            ),
        )
        if value
    )
    score = weighted / available_weight if available_weight else 0.0

    return {
        "part_id": candidate.get("part_id"),
        "part_number": candidate.get("part_number"),
        "part_name": candidate.get("part_name"),
        "material": candidate.get("material"),
        "gross_weight_kg": candidate.get("gross_weight_kg"),
        "cycle_time_minutes": candidate.get("cycle_time_minutes"),
        "source_type": candidate.get("source_type", "unknown"),
        "similarity_score": round(score * 100, 1),
        "similarity_reasons": {
            "material_match": round(material * 100, 1),
            "weight_similarity": round(weight * 100, 1),
            "part_name_similarity": round(name * 100, 1),
            "cycle_time_similarity": round(cycle * 100, 1),
        },
        "routing_steps": sorted(
            candidate.get("routing_steps") or [],
            key=lambda step: step.get("sequence_number", 0),
        ),
    }


def suggest_routings(
    target: dict[str, Any],
    historical_parts: list[dict[str, Any]],
    limit: int = 3,
) -> dict[str, Any]:
    """Rank historical parts and return their traceable, estimator-reviewable routes."""
    ranked = [
        _score_candidate(target, candidate)
        for candidate in historical_parts
        if candidate.get("routing_steps")
    ]
    ranked.sort(key=lambda item: item["similarity_score"], reverse=True)

    suggestions = []
    for item in ranked[:limit]:
        if not item["routing_steps"]:
            continue
        suggestions.append(item)

    return {
        "success": True,
        "target": target,
        "suggestions": suggestions,
        "method": "weighted_similarity_retrieval",
        "weights": {
            "material": 0.45,
            "weight": 0.25,
            "part_name": 0.20,
            "cycle_time": 0.10,
        },
        "human_review_required": True,
        "notice": (
            "Suggestions are ranked from supplied historical routing records. "
            "Demo/hypothetical routes are not verified factory instructions. "
            "Estimator approval is required before use."
        ),
    }
