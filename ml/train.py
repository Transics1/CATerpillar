"""Trains the task-time estimator and the anomaly model.

Quantile models give the P10/P50/P90 band; a conformal step calibrates it. Explanations use
baseline-delta rather than SHAP - faster, no extra dependency, and easier to read.
"""

import os

os.environ.setdefault("LOKY_MAX_CPU_COUNT", "4")  # silences a noisy joblib probe on Windows

import json

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, IsolationForest
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "..", "data", "out", "tasks.csv")
TELEMETRY = os.path.join(HERE, "..", "data", "out", "telemetry.csv")
MODEL_DIR = os.path.join(HERE, "models")

# Window features the anomaly model scores. Must match the server's windowing logic.
WINDOW_FEATURES = [
    "idleRatio", "vibrationEvents", "fuelPerCycle", "maxEngineTemp",
    "seatbeltViolations", "minPersonnelM", "maxSwingRate", "cycleTimeStd",
]

CATEGORICAL = ["taskType", "weather", "operatorSkill", "terrainType", "shiftPeriod"]
NUMERIC = ["machineAgeYrs", "targetVolumeM3", "terrainSlope", "ambientTempC"]
FEATURES = CATEGORICAL + NUMERIC
TARGET = "actualTimeMin"

def encode(df, categories):
    """Ordinal-encode categoricals using a fixed category order shared with inference."""
    out = df[FEATURES].copy()
    for col in CATEGORICAL:
        mapping = {v: i for i, v in enumerate(categories[col])}
        out[col] = out[col].map(mapping).fillna(-1).astype(int)
    for col in NUMERIC:
        out[col] = pd.to_numeric(out[col], errors="coerce")
    return out

def build_windows(t):
    """Aggregate raw telemetry into 30-min windows. Mirrors the server's anomaly engine."""
    t = t.copy()
    t["timestamp"] = pd.to_datetime(t["timestamp"])
    t["win"] = t["timestamp"].dt.floor("30min")
    g = t.groupby(["machineId", "operatorId", "win"])
    w = g.agg(
        idle_ticks=("idlingTimeMin", lambda s: (s > 0).sum()),
        ticks=("idlingTimeMin", "size"),
        vibrationEvents=("vibrationEvents", "sum"),
        fuel=("fuelUsedL", "sum"),
        cycles=("loadCycles", "sum"),
        maxEngineTemp=("engineTempC", "max"),
        seatbeltViolations=("seatbeltStatus", lambda s: (s == "Unfastened").sum()),
        minPersonnelM=("nearestPersonnelM", "min"),
        maxSwingRate=("swingRateDegSec", "max"),
        cycleTimeStd=("cycleTimeStdRolling", "mean"),
    ).reset_index()
    w["idleRatio"] = w.idle_ticks / w.ticks
    w["fuelPerCycle"] = (w.fuel / w.cycles.replace(0, np.nan)).fillna(w.fuel)
    return w

def train_anomaly_model():
    """Second tier of the hybrid engine: catches window shapes no explicit rule covers."""
    print("\ntraining anomaly model ...")
    t = pd.read_csv(TELEMETRY)
    w = build_windows(t)
    X = w[WINDOW_FEATURES].fillna(0)

    iso = IsolationForest(n_estimators=200, contamination=0.08, random_state=42)
    iso.fit(X)
    joblib.dump({"model": iso, "features": WINDOW_FEATURES,
                 "medians": X.median().to_dict()},
                os.path.join(MODEL_DIR, "anomaly.joblib"))

    flagged = (iso.predict(X) == -1)
    print(f"  windows           {len(w):,}")
    print(f"  flagged anomalous {flagged.sum():,}  ({flagged.mean():.1%})")

def main():
    os.makedirs(MODEL_DIR, exist_ok=True)
    df = pd.read_csv(DATA)
    print(f"loaded {len(df):,} tasks")

    categories = {c: sorted(df[c].dropna().unique().tolist()) for c in CATEGORICAL}
    baseline = {c: df[c].mode()[0] for c in CATEGORICAL}
    baseline.update({c: float(df[c].median()) for c in NUMERIC})

    X = encode(df, categories)
    y = df[TARGET].astype(float)

    # Calibration slice is held out from fitting and used only for the conformal step.
    X_fit, X_tmp, y_fit, y_tmp = train_test_split(X, y, test_size=0.4, random_state=42)
    X_cal, X_test, y_cal, y_test = train_test_split(X_tmp, y_tmp, test_size=0.5, random_state=42)

    cat_mask = [c in CATEGORICAL for c in FEATURES]
    models = {}
    for name, quantile in [("p10", 0.10), ("p50", 0.50), ("p90", 0.90)]:
        m = HistGradientBoostingRegressor(
            loss="quantile",
            quantile=quantile,
            max_iter=300,
            learning_rate=0.08,
            max_depth=6,
            min_samples_leaf=25,
            categorical_features=cat_mask,
            random_state=42,
        )
        m.fit(X_fit, y_fit)
        models[name] = m
        joblib.dump(m, os.path.join(MODEL_DIR, f"{name}.joblib"))

    # Conformalised quantile regression: raw quantile models under-cover, so measure how far
    # outside the band the calibration points fall and widen by that amount.
    cal_lo = models["p10"].predict(X_cal)
    cal_hi = models["p90"].predict(X_cal)
    scores = np.maximum(cal_lo - y_cal.values, y_cal.values - cal_hi)
    n = len(scores)
    alpha = 0.20  # target 80% coverage
    level = min(1.0, np.ceil((n + 1) * (1 - alpha)) / n)
    q_adjust = float(np.quantile(scores, level, method="higher"))

    pred = models["p50"].predict(X_test)
    mae = mean_absolute_error(y_test, pred)
    mape = np.mean(np.abs((y_test - pred) / y_test)) * 100

    lo_raw, hi_raw = models["p10"].predict(X_test), models["p90"].predict(X_test)
    cov_raw = np.mean((y_test >= lo_raw) & (y_test <= hi_raw)) * 100
    lo_cqr, hi_cqr = lo_raw - q_adjust, hi_raw + q_adjust
    cov_cqr = np.mean((y_test >= lo_cqr) & (y_test <= hi_cqr)) * 100
    width = np.mean(hi_cqr - lo_cqr)

    baseline_mae = mean_absolute_error(y_test, df.loc[y_test.index, "estimatedTimeMin"])

    joblib.dump(
        {"categories": categories, "baseline": baseline, "features": FEATURES,
         "categorical": CATEGORICAL, "numeric": NUMERIC, "qAdjust": q_adjust},
        os.path.join(MODEL_DIR, "meta.joblib"),
    )

    print(f"\n  P50 MAE              {mae:.2f} min")
    print(f"  P50 MAPE             {mape:.1f} %")
    print(f"  coverage raw         {cov_raw:.1f} %   (uncalibrated - too narrow)")
    print(f"  coverage conformal   {cov_cqr:.1f} %   (target 80)")
    print(f"  band widened by      +/- {q_adjust:.1f} min -> mean width {width:.1f} min")
    print(f"  planner's estimate   {baseline_mae:.2f} min MAE")
    print(f"  improvement          {(1 - mae / baseline_mae) * 100:.1f} % better than the existing estimate")
    print(f"\nmodels written to {MODEL_DIR}")

    print(json.dumps({"mae": round(mae, 2), "coverageRaw": round(cov_raw, 1),
                      "coverageConformal": round(cov_cqr, 1), "qAdjust": round(q_adjust, 2),
                      "baselineMae": round(baseline_mae, 2)}))

    train_anomaly_model()

if __name__ == "__main__":
    main()
