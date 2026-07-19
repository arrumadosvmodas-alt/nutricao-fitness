from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal


Protocol = Literal["12:12", "14:10", "16:8", "18:6"]
ActivityContext = Literal["rest", "work", "training", "hot_day"]

PROTOCOL_HOURS: dict[Protocol, tuple[int, int]] = {
    "12:12": (12, 12),
    "14:10": (14, 10),
    "16:8": (16, 8),
    "18:6": (18, 6),
}


@dataclass(frozen=True)
class FastingGuidance:
    protocol: Protocol
    fasting_hours: int
    eating_window_hours: int
    allowed_during_fast: list[str]
    hydration_between_meals_ml: int
    break_fast_calories_min: int
    break_fast_calories_max: int
    protein_min_g: int
    fiber_min_g: int
    guidance: list[str]
    safety_notes: list[str]


def _round_int(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def build_fasting_guidance(
    *,
    protocol: Protocol,
    body_weight_kg: Decimal,
    daily_calorie_target: Decimal,
    activity_context: ActivityContext = "work",
) -> FastingGuidance:
    fasting_hours, eating_window_hours = PROTOCOL_HOURS[protocol]
    hydration_base = body_weight_kg * Decimal("35")
    context_bonus = Decimal("0")
    if activity_context == "training":
        context_bonus = Decimal("500")
    elif activity_context == "hot_day":
        context_bonus = Decimal("350")

    hydration = _round_int((hydration_base + context_bonus) * Decimal(fasting_hours) / Decimal("24"))
    meal_min = _round_int(daily_calorie_target * Decimal("0.22"))
    meal_max = _round_int(daily_calorie_target * Decimal("0.32"))
    protein = max(20, _round_int(body_weight_kg * Decimal("0.35")))

    return FastingGuidance(
        protocol=protocol,
        fasting_hours=fasting_hours,
        eating_window_hours=eating_window_hours,
        allowed_during_fast=[
            "agua",
            "cafe sem acucar",
            "cha sem acucar",
            "eletrolitos sem calorias quando necessario",
        ],
        hydration_between_meals_ml=max(500, hydration),
        break_fast_calories_min=max(250, meal_min),
        break_fast_calories_max=max(meal_min, meal_max),
        protein_min_g=protein,
        fiber_min_g=8,
        guidance=[
            "Durante o jejum, manter ingestao sem calorias para preservar a janela planejada.",
            "Quebrar o jejum com proteina, fibra e carboidrato ajustado ao diario.",
            "Evitar compensar o jejum com refeicao muito grande se isso ultrapassar a meta do dia.",
        ],
        safety_notes=[
            "Nao usar jejum como orientacao para gestantes, menores de idade, pessoas com historico de transtorno alimentar ou diabetes sem acompanhamento profissional.",
            "Interromper o protocolo e orientar avaliacao profissional em caso de tontura forte, desmaio, tremor, confusao ou mal-estar persistente.",
        ],
    )
