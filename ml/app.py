"""
ML service for CAT Copilot.

Run:  python -m uvicorn ml.app:app --reload --port 8000

The Node server proxies to this and falls back to a heuristic returning the identical
response shape if this process is unreachable, so the demo survives a Python crash.
"""

import os

os.environ.setdefault("LOKY_MAX_CPU_COUNT", "4")

from typing import List, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

app = FastAPI(title="CAT Copilot ML")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

# Loaded once at import. If a file is missing the service reports unhealthy and Node
# transparently uses its fallback rather than serving wrong numbers.
try:
    META = joblib.load(os.path.join(MODEL_DIR, "meta.joblib"))
    MODELS = {q: joblib.load(os.path.join(MODEL_DIR, f"{q}.joblib")) for q in ("p10", "p50", "p90")}
    ANOMALY = joblib.load(os.path.join(MODEL_DIR, "anomaly.joblib"))
    READY = True
except Exception as e:  # noqa: BLE001
    print(f"[ml] models unavailable: {e}")
    META, MODELS, ANOMALY, READY = None, {}, None, False


# ----------------------------------------------------------------------------- schemas

class TaskFeatures(BaseModel):
    taskType: str
    weather: str
    operatorSkill: str
    terrainType: str = "Mixed"
    shiftPeriod: str = "morning"
    machineAgeYrs: float = 3
    targetVolumeM3: float = 40
    terrainSlope: float = 5
    ambientTempC: float = 30


class Driver(BaseModel):
    feature: str
    value: str
    deltaMin: float
    direction: str


class Prediction(BaseModel):
    p10: float
    p50: float
    p90: float
    unit: str = "min"
    drivers: List[Driver]
    narrative: str
    source: str = "model"


class Window(BaseModel):
    idleRatio: float = 0
    vibrationEvents: float = 0
    fuelPerCycle: float = 0
    maxEngineTemp: float = 90
    seatbeltViolations: float = 0
    minPersonnelM: float = 40
    maxSwingRate: float = 2
    cycleTimeStd: float = 7


class AnomalyResult(BaseModel):
    isAnomaly: bool
    score: float
    topFeatures: List[str]


# ----------------------------------------------------------------------------- helpers

# Human-readable labels; the operator never sees a camelCase field name.
LABELS = {
    "taskType": "Task type",
    "weather": "Weather",
    "operatorSkill": "Your skill level",
    "terrainType": "Terrain",
    "shiftPeriod": "Shift",
    "machineAgeYrs": "Machine age",
    "targetVolumeM3": "Volume",
    "terrainSlope": "Slope",
    "ambientTempC": "Temperature",
}

EXPLAIN_EXCLUDE = {"taskType"}


def encode_row(payload: dict) -> pd.DataFrame:
    row = {}
    for col in META["categorical"]:
        mapping = {v: i for i, v in enumerate(META["categories"][col])}
        row[col] = mapping.get(payload.get(col), -1)
    for col in META["numeric"]:
        row[col] = float(payload.get(col, META["baseline"][col]))
    return pd.DataFrame([row])[META["features"]]


def compute_drivers(payload: dict, p50: float, top_n: int = 3) -> List[Driver]:
    """
    Baseline-delta attribution: re-predict with one feature swapped to its training baseline.
    The change in predicted minutes is that feature's contribution.
    """
    drivers = []
    for feat in META["features"]:
        # Task type is the identity of the job, not a driver of it. Including it produced
        # "Trenching: -99.8 min" against the modal task type, which dominates every other
        # factor and tells the operator nothing they don't already know. Drivers should
        # explain variation WITHIN a task type.
        if feat in EXPLAIN_EXCLUDE:
            continue
        swapped = dict(payload)
        swapped[feat] = META["baseline"][feat]
        delta = float(p50 - MODELS["p50"].predict(encode_row(swapped))[0])
        if abs(delta) < 0.5:
            continue
        raw = payload.get(feat, META["baseline"][feat])
        value = f"{raw:g}" if isinstance(raw, (int, float)) else str(raw)
        drivers.append(
            Driver(
                feature=LABELS.get(feat, feat),
                value=value,
                deltaMin=round(delta, 1),
                direction="up" if delta > 0 else "down",
            )
        )
    drivers.sort(key=lambda d: abs(d.deltaMin), reverse=True)
    return drivers[:top_n]


def build_narrative(drivers: List[Driver], p50: float) -> str:
    """
    Compact signed form rather than a sentence. Avoids subject-verb agreement problems
    ("rain push this up" vs "rain and slope push this up") and reads faster on a task card
    and through text-to-speech.
    """
    if not drivers:
        return f"About {p50:.0f} min. Nothing unusual about this one."
    bits = ", ".join(
        f"{d.feature.lower()} {'+' if d.direction == 'up' else ''}{d.deltaMin:g} min"
        for d in drivers
    )
    return f"About {p50:.0f} min. Driven by {bits}."


# ----------------------------------------------------------------------------- routes

@app.get("/health")
def health():
    return {"ok": READY, "models": list(MODELS.keys()), "qAdjust": META["qAdjust"] if READY else None}


@app.post("/predict", response_model=Prediction)
def predict(features: TaskFeatures):
    payload = features.model_dump()
    X = encode_row(payload)

    p50 = float(MODELS["p50"].predict(X)[0])
    # qAdjust is the conformal widening computed in train.py. Applying it is what makes the
    # advertised 80% band actually cover 80% - without it coverage drops to ~61%.
    q = META["qAdjust"]
    p10 = float(MODELS["p10"].predict(X)[0]) - q
    p90 = float(MODELS["p90"].predict(X)[0]) + q

    drivers = compute_drivers(payload, p50)
    return Prediction(
        p10=round(max(1.0, p10), 1),
        p50=round(p50, 1),
        p90=round(p90, 1),
        drivers=drivers,
        narrative=build_narrative(drivers, p50),
        source="model",
    )


@app.post("/anomaly", response_model=AnomalyResult)
def anomaly(window: Window):
    feats = ANOMALY["features"]
    row = pd.DataFrame([[getattr(window, f) for f in feats]], columns=feats)
    score = float(ANOMALY["model"].decision_function(row)[0])
    is_anom = bool(ANOMALY["model"].predict(row)[0] == -1)

    # Which inputs are most unusual relative to the training medians?
    med = ANOMALY["medians"]
    devs = sorted(
        ((f, abs(getattr(window, f) - med[f]) / (abs(med[f]) + 1e-6)) for f in feats),
        key=lambda x: x[1],
        reverse=True,
    )
    return AnomalyResult(isAnomaly=is_anom, score=round(score, 4),
                         topFeatures=[f for f, _ in devs[:3]])
