from dataclasses import asdict
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.domain.fasting import build_fasting_guidance
from app.domain.nutrition import calculate_targets
from app.schemas import (
    FastingGuidanceRequest,
    FastingGuidanceResponse,
    FoodSearchResponse,
    GoalRequest,
    GoalResponse,
)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://localhost:3000",
        "https://nutricao-fitness-web.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": "foods-search-v1"}


@app.post("/goals/calculate", response_model=GoalResponse)
def calculate_goal(payload: GoalRequest) -> dict[str, object]:
    return calculate_targets(**payload.model_dump())


@app.post("/fasting/guidance", response_model=FastingGuidanceResponse)
def fasting_guidance(payload: FastingGuidanceRequest) -> dict[str, object]:
    guidance = build_fasting_guidance(**payload.model_dump())
    return asdict(guidance)

@app.get("/foods/search", response_model=FoodSearchResponse)
def search_foods(q: str, page_size: int = 10) -> dict[str, object]:
    params = urlencode({
        "search_terms": q,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": min(max(page_size, 1), 20),
        "fields": "code,product_name,brands,nutriments",
    })
    request = Request(
        f"https://world.openfoodfacts.org/cgi/search.pl?{params}",
        headers={"User-Agent": "NutricaoFitness/0.1 contato@arrumadosvmodas.com"},
    )
    try:
        with urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return {"items": []}

    items = []
    for product in payload.get("products", []):
        nutriments = product.get("nutriments") or {}
        name = product.get("product_name") or ""
        calories = nutriments.get("energy-kcal_100g") or nutriments.get("energy-kcal") or 0
        if not name or not calories:
            continue
        items.append({
            "code": product.get("code"),
            "name": name,
            "brand": product.get("brands") or None,
            "calories_kcal_100g": float(calories or 0),
            "protein_g_100g": float(nutriments.get("proteins_100g") or 0),
            "carbs_g_100g": float(nutriments.get("carbohydrates_100g") or 0),
            "fat_g_100g": float(nutriments.get("fat_100g") or 0),
        })
    return {"items": items}
