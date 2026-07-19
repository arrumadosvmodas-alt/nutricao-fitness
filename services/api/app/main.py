from dataclasses import asdict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.domain.fasting import build_fasting_guidance
from app.domain.nutrition import calculate_targets
from app.schemas import (
    FastingGuidanceRequest,
    FastingGuidanceResponse,
    GoalRequest,
    GoalResponse,
)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/goals/calculate", response_model=GoalResponse)
def calculate_goal(payload: GoalRequest) -> dict[str, object]:
    return calculate_targets(**payload.model_dump())


@app.post("/fasting/guidance", response_model=FastingGuidanceResponse)
def fasting_guidance(payload: FastingGuidanceRequest) -> dict[str, object]:
    guidance = build_fasting_guidance(**payload.model_dump())
    return asdict(guidance)
