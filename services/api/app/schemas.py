from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class GoalRequest(BaseModel):
    sex: Literal["male", "female"]
    weight_kg: Decimal = Field(gt=0, le=400)
    height_cm: Decimal = Field(gt=0, le=260)
    age_years: int = Field(ge=13, le=120)
    activity_level: Literal["sedentary", "light", "moderate", "active", "very_active"]
    goal: Literal["lose", "maintain", "gain"]


class GoalResponse(BaseModel):
    bmr_kcal: Decimal
    tdee_kcal: Decimal
    calories_kcal: Decimal
    protein_g: Decimal
    carbs_g: Decimal
    fat_g: Decimal


class FastingGuidanceRequest(BaseModel):
    protocol: Literal["12:12", "14:10", "16:8", "18:6"] = "16:8"
    body_weight_kg: Decimal = Field(gt=0, le=400)
    daily_calorie_target: Decimal = Field(ge=1200, le=6000)
    activity_context: Literal["rest", "work", "training", "hot_day"] = "work"


class FastingGuidanceResponse(BaseModel):
    protocol: str
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

class FoodSearchItem(BaseModel):
    code: str | None = None
    name: str
    brand: str | None = None
    calories_kcal_100g: float
    protein_g_100g: float
    carbs_g_100g: float
    fat_g_100g: float
    source: str = "open_food_facts"


class FoodSearchResponse(BaseModel):
    items: list[FoodSearchItem]
