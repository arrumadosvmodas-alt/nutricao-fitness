from decimal import Decimal, ROUND_HALF_UP
from typing import Literal


Sex = Literal["male", "female"]
Goal = Literal["lose", "maintain", "gain"]
ActivityLevel = Literal["sedentary", "light", "moderate", "active", "very_active"]

ACTIVITY_FACTORS: dict[ActivityLevel, Decimal] = {
    "sedentary": Decimal("1.2"),
    "light": Decimal("1.375"),
    "moderate": Decimal("1.55"),
    "active": Decimal("1.725"),
    "very_active": Decimal("1.9"),
}

GOAL_ADJUSTMENTS: dict[Goal, Decimal] = {
    "lose": Decimal("-400"),
    "maintain": Decimal("0"),
    "gain": Decimal("300"),
}


def q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate_bmr(
    *,
    sex: Sex,
    weight_kg: Decimal,
    height_cm: Decimal,
    age_years: int,
) -> Decimal:
    base = Decimal("10") * weight_kg + Decimal("6.25") * height_cm - Decimal("5") * Decimal(age_years)
    if sex == "male":
        return q(base + Decimal("5"))
    return q(base - Decimal("161"))


def calculate_targets(
    *,
    sex: Sex,
    weight_kg: Decimal,
    height_cm: Decimal,
    age_years: int,
    activity_level: ActivityLevel,
    goal: Goal,
) -> dict[str, Decimal]:
    bmr = calculate_bmr(
        sex=sex,
        weight_kg=weight_kg,
        height_cm=height_cm,
        age_years=age_years,
    )
    tdee = q(bmr * ACTIVITY_FACTORS[activity_level])
    calories = max(Decimal("1200"), tdee + GOAL_ADJUSTMENTS[goal])
    protein = q(weight_kg * Decimal("1.8"))
    fat = q((calories * Decimal("0.25")) / Decimal("9"))
    carbs = q((calories - (protein * Decimal("4")) - (fat * Decimal("9"))) / Decimal("4"))

    return {
        "bmr_kcal": q(bmr),
        "tdee_kcal": q(tdee),
        "calories_kcal": q(calories),
        "protein_g": protein,
        "carbs_g": max(Decimal("0"), carbs),
        "fat_g": fat,
    }

