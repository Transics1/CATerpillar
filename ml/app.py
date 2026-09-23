"""ML service. Run: python -m uvicorn ml.app:app --port 8000"""

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

# Task type is the identity of the job, not a driver of it.
EXPLAIN_EXCLUDE = {"taskType"}

UNITS = {
    "machineAgeYrs": " yr",
    "targetVolumeM3": " m3",
    "terrainSlope": " deg",
    "ambientTempC": " C",
}

def encode_row(payload: dict) -> pd.DataFrame:
    row = {}
    for col in META["categorical"]:
        mapping = {v: i for i, v in enumerate(META["categories"][col])}
        row[col] = mapping.get(payload.get(col), -1)
    for col in META["numeric"]:
        row[col] = float(payload.get(col, META["baseline"][col]))
    return pd.DataFrame([row])[META["features"]]

def compute_drivers(payload: dict, p50: float, top_n: int = 3) -> List[Driver]:
    """Re-predict with one feature at its training baseline; the delta is its contribution."""
    drivers = []
    for feat in META["features"]:
        if feat in EXPLAIN_EXCLUDE:
            continue
        swapped = dict(payload)
        swapped[feat] = META["baseline"][feat]
        delta = float(p50 - MODELS["p50"].predict(encode_row(swapped))[0])
        if abs(delta) < 0.5:
            continue
        raw = payload.get(feat, META["baseline"][feat])
        value = f"{raw:g}{UNITS.get(feat, '')}" if isinstance(raw, (int, float)) else str(raw)
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
    # Conformal widening from train.py; without it the advertised 80% band covers ~61%.
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

    med = ANOMALY["medians"]
    devs = sorted(
        ((f, abs(getattr(window, f) - med[f]) / (abs(med[f]) + 1e-6)) for f in feats),
        key=lambda x: x[1],
        reverse=True,
    )
    return AnomalyResult(isAnomaly=is_anom, score=round(score, 4),
                         topFeatures=[f for f, _ in devs[:3]])
