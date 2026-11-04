from app.services.routing_suggestions import suggest_routings


def test_exact_material_and_similar_part_ranks_first():
    target = {
        "part_name": "Rear wheel spindle",
        "material": "EN8",
        "gross_weight_kg": 0.62,
        "cycle_time_minutes": 3.1,
    }
    candidates = [
        {
            "part_id": "part-a",
            "part_number": "RWS-014",
            "part_name": "Rear wheel spindle",
            "material": "EN8",
            "gross_weight_kg": 0.61,
            "cycle_time_minutes": 3.2,
            "source_type": "demo_hypothetical",
            "routing_steps": [
                {
                    "sequence_number": 1,
                    "operation_name": "CNC turning",
                    "machine_type": "CNC lathe",
                    "estimated_cycle_time_minutes": 1.6,
                    "source_note": "Hypothetical demo",
                }
            ],
        },
        {
            "part_id": "part-b",
            "part_number": "HLA-019",
            "part_name": "Hydraulic lift arm",
            "material": "40Cr4 forging",
            "gross_weight_kg": 4.6,
            "cycle_time_minutes": 11.5,
            "source_type": "demo_hypothetical",
            "routing_steps": [
                {
                    "sequence_number": 1,
                    "operation_name": "Forging inspection",
                    "machine_type": "Inspection station",
                    "estimated_cycle_time_minutes": 0.5,
                    "source_note": "Hypothetical demo",
                }
            ],
        },
    ]

    result = suggest_routings(target, candidates)

    assert result["success"] is True
    assert result["suggestions"][0]["part_number"] == "RWS-014"
    assert result["human_review_required"] is True
    assert (
        result["suggestions"][0]["routing_steps"][0]["operation_name"] == "CNC turning"
    )


def test_candidates_without_routes_are_not_returned():
    result = suggest_routings(
        {"part_name": "Part A", "material": "EN8"},
        [
            {
                "part_number": "A-1",
                "part_name": "Part A",
                "material": "EN8",
                "routing_steps": [],
            }
        ],
    )

    assert result["suggestions"] == []
