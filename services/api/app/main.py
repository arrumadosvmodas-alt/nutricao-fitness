from dataclasses import asdict
import json
import unicodedata
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

COMMON_FOODS = [
    {"code": "br-carne-bovina-patinho-cozido", "name": "Carne bovina patinho cozido", "brand": "Base comum", "calories_kcal_100g": 219, "protein_g_100g": 35.9, "carbs_g_100g": 0, "fat_g_100g": 7.3, "source": "base_comum"},
    {"code": "br-carne-bovina-acem-cozido", "name": "Carne bovina acem cozido", "brand": "Base comum", "calories_kcal_100g": 215, "protein_g_100g": 27.3, "carbs_g_100g": 0, "fat_g_100g": 10.9, "source": "base_comum"},
    {"code": "br-carne-bovina-alcatra-grelhada", "name": "Carne bovina alcatra grelhada", "brand": "Base comum", "calories_kcal_100g": 241, "protein_g_100g": 31.9, "carbs_g_100g": 0, "fat_g_100g": 11.6, "source": "base_comum"},
    {"code": "br-carne-bovina-contra-file-grelhado", "name": "Carne bovina contra-file grelhado", "brand": "Base comum", "calories_kcal_100g": 278, "protein_g_100g": 32.4, "carbs_g_100g": 0, "fat_g_100g": 15.5, "source": "base_comum"},
    {"code": "br-carne-moida-cozida", "name": "Carne bovina moida cozida", "brand": "Base comum", "calories_kcal_100g": 250, "protein_g_100g": 26.7, "carbs_g_100g": 0, "fat_g_100g": 15.0, "source": "base_comum"},
    {"code": "br-frango-peito-grelhado", "name": "Peito de frango grelhado", "brand": "Base comum", "calories_kcal_100g": 165, "protein_g_100g": 31.0, "carbs_g_100g": 0, "fat_g_100g": 3.6, "source": "base_comum"},
    {"code": "br-ovo-cozido", "name": "Ovo de galinha cozido", "brand": "Base comum", "calories_kcal_100g": 155, "protein_g_100g": 12.6, "carbs_g_100g": 1.1, "fat_g_100g": 10.6, "source": "base_comum"},
    {"code": "br-arroz-branco-cozido", "name": "Arroz branco cozido", "brand": "Base comum", "calories_kcal_100g": 128, "protein_g_100g": 2.5, "carbs_g_100g": 28.1, "fat_g_100g": 0.2, "source": "base_comum"},
    {"code": "br-feijao-carioca-cozido", "name": "Feijao carioca cozido", "brand": "Base comum", "calories_kcal_100g": 76, "protein_g_100g": 4.8, "carbs_g_100g": 13.6, "fat_g_100g": 0.5, "source": "base_comum"},
    {"code": "br-batata-doce-cozida", "name": "Batata-doce cozida", "brand": "Base comum", "calories_kcal_100g": 77, "protein_g_100g": 0.6, "carbs_g_100g": 18.4, "fat_g_100g": 0.1, "source": "base_comum"},
    {"code": "br-banana-prata", "name": "Banana prata", "brand": "Base comum", "calories_kcal_100g": 98, "protein_g_100g": 1.3, "carbs_g_100g": 26.0, "fat_g_100g": 0.1, "source": "base_comum"},
]


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value.lower())
    return "".join(char for char in value if not unicodedata.combining(char))


def search_common_foods(query: str, limit: int) -> list[dict[str, object]]:
    terms = [term for term in normalize_text(query).split() if term]
    if not terms:
        return []
    ranked = []
    for food in COMMON_FOODS:
        haystack = normalize_text(f"{food['name']} {food['brand']}")
        score = sum(1 for term in terms if term in haystack)
        if score:
            ranked.append((score, food))
    ranked.sort(key=lambda item: (-item[0], item[1]["name"]))
    return [food for _, food in ranked[:limit]]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": "foods-search-v2"}


@app.post("/goals/calculate", response_model=GoalResponse)
def calculate_goal(payload: GoalRequest) -> dict[str, object]:
    return calculate_targets(**payload.model_dump())


@app.post("/fasting/guidance", response_model=FastingGuidanceResponse)
def fasting_guidance(payload: FastingGuidanceRequest) -> dict[str, object]:
    guidance = build_fasting_guidance(**payload.model_dump())
    return asdict(guidance)


@app.get("/foods/search", response_model=FoodSearchResponse)
def search_foods(q: str, page_size: int = 10) -> dict[str, object]:
    limit = min(max(page_size, 1), 20)
    items = search_common_foods(q, limit)

    params = urlencode({
        "search_terms": q,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": limit,
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
        return {"items": items}

    seen_codes = {item["code"] for item in items}
    for product in payload.get("products", []):
        nutriments = product.get("nutriments") or {}
        name = product.get("product_name") or ""
        calories = nutriments.get("energy-kcal_100g") or nutriments.get("energy-kcal") or 0
        code = product.get("code")
        if not name or not calories or code in seen_codes:
            continue
        items.append({
            "code": code,
            "name": name,
            "brand": product.get("brands") or None,
            "calories_kcal_100g": float(calories or 0),
            "protein_g_100g": float(nutriments.get("proteins_100g") or 0),
            "carbs_g_100g": float(nutriments.get("carbohydrates_100g") or 0),
            "fat_g_100g": float(nutriments.get("fat_100g") or 0),
            "source": "open_food_facts",
        })
        seen_codes.add(code)
        if len(items) >= limit:
            break
    return {"items": items[:limit]}