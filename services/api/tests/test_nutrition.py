from decimal import Decimal

from app.domain.fasting import build_fasting_guidance
from app.domain.nutrition import calculate_bmr, calculate_targets


def test_calculate_bmr_mifflin_male() -> None:
    result = calculate_bmr(
        sex="male",
        weight_kg=Decimal("80"),
        height_cm=Decimal("180"),
        age_years=30,
    )

    assert result == Decimal("1780.00")


def test_calculate_targets_returns_macros() -> None:
    result = calculate_targets(
        sex="female",
        weight_kg=Decimal("70"),
        height_cm=Decimal("165"),
        age_years=32,
        activity_level="light",
        goal="lose",
    )

    assert result["calories_kcal"] >= Decimal("1200")
    assert result["protein_g"] == Decimal("126.00")
    assert result["carbs_g"] >= Decimal("0")


def test_fasting_guidance_sets_intake_between_meals() -> None:
    result = build_fasting_guidance(
        protocol="16:8",
        body_weight_kg=Decimal("80"),
        daily_calorie_target=Decimal("2100"),
        activity_context="work",
    )

    assert result.fasting_hours == 16
    assert result.hydration_between_meals_ml >= 500
    assert result.break_fast_calories_min == 462
    assert result.break_fast_calories_max == 672
    assert result.protein_min_g == 28
    assert "agua" in result.allowed_during_fast
