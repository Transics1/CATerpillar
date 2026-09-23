# CAT Copilot — Build Spec

Single source of truth for the 6-hour build. Every decision here is **already made** — if you find
yourself debating something in this file during the sprint, you've lost. Change it only if it's
blocking a demo beat.

---

## Repo structure

```
/client     React + Vite + Tailwind PWA   (operator app + supervisor route)
/server     Node + Express + Socket.IO    (API, coaching engine, simulator)
/ml         FastAPI + scikit-learn        (task-time estimator, anomaly model)
/data       generator script + CSV output + seed script
```

## Env vars

```
# /server/.env
MONGODB_URI=            # Atlas M0 connection string
JWT_SECRET=             # any random string
ML_SERVICE_URL=http://localhost:8000
GROQ_API_KEY=           # P2 — optional, server-side only, never in client bundle
GEMINI_API_KEY=         # P2 — fallback
PORT=5000

# /client/.env
VITE_API_URL=http://localhost:5000
```

---

## Data model (Mongoose)

### `Operator`
```js
{
  operatorId: String,        // "OP1001"  (indexed, unique)
  name: String,
  language: String,          // "en" | "hi"
  skillLevel: String,        // "Beginner" | "Intermediate" | "Expert"
  certifications: [String],
  joinDate: Date,
  dnaScore: { safety: Number, efficiency: Number, skill: Number, overall: Number },
  dnaHistory: [{ date: Date, safety: Number, efficiency: Number, skill: Number, overall: Number }],
  assignedLessons: [String],
  completedLessons: [{ lessonId: String, completedAt: Date, quizScore: Number }]
}
```

### `Machine`
```js
{
  machineId: String,         // "EXC001"  (indexed, unique)
  machineType: String,       // "EXC" | "LOAD" | "DOZ" | "GRD"
  model: String,             // "CAT 320"
  ageYears: Number,
  attachment: String,
  status: String,            // "idle" | "active" | "maintenance"
  lastKnown: { lat: Number, lng: Number, ts: Date }
}
```

### `Telemetry` — **MongoDB time-series collection**
```js
// timeseries: { timeField: "timestamp", metaField: "meta", granularity: "minutes" }
{
  timestamp: Date,
  meta: { machineId: String, operatorId: String, machineType: String },

  // from the provided sample
  engineHours: Number, fuelUsedL: Number, loadCycles: Number,
  idlingTimeMin: Number, seatbeltStatus: String, safetyAlertTriggered: Boolean,

  // location / terrain
  lat: Number, lng: Number, geofenceZone: String, terrainSlopeDeg: Number,
  // machine health
  engineTempC: Number, hydraulicPressureBar: Number, oilPressureBar: Number, batteryVoltage: Number,
  // operation quality
  rpm: Number, throttlePct: Number, payloadKg: Number,
  swingRateDegSec: Number, vibrationEvents: Number,
  // environment
  ambientTempC: Number, humidityPct: Number, windKph: Number, weather: String,
  // BLE proximity
  nearestPersonnelM: Number, personnelInRadius: Number,
  // fatigue inputs
  continuousOperatingMin: Number, shiftStartTs: Date,
  cycleTimeSec: Number, cycleTimeStdRolling: Number
}
```

### `Task`
```js
{
  taskId: String,            // "T001"
  taskType: String,          // "Earth Excavation" | "Trenching" | "Material Loading" | "Grading" | "Demolition"
  machineType: String, machineId: String, operatorId: String,
  siteZone: String, scheduledDate: Date, shiftPeriod: String,  // "morning"|"afternoon"|"night"
  weather: String, ambientTempC: Number,
  operatorSkill: String, machineAgeYrs: Number,
  targetVolumeM3: Number, payloadTargetKg: Number,
  terrainType: String, terrainSlope: Number,
  estimatedTimeMin: Number, actualTimeMin: Number,
  interruptions: Number,
  status: String,            // "pending" | "active" | "done"
  startedAt: Date, completedAt: Date
}
```

### `Incident` — note `clientId` for offline idempotency
```js
{
  clientId: String,          // UUID generated on the PHONE. Unique index. Prevents duplicate
                             // inserts when the offline queue replays. Do not skip this.
  operatorId: String, machineId: String,
  type: String, severity: String,      // "low" | "medium" | "high"
  rawText: String,           // what the operator actually said
  description: String,       // LLM-drafted (P2) or === rawText
  lat: Number, lng: Number, photoUrl: String,
  occurredAt: Date, syncedAt: Date, source: String  // "online" | "offline-queue"
}
```

### `Anomaly`, `Lesson`, `Shift`
```js
Anomaly { anomalyId, operatorId, machineId, type, severity, detectedAt,
          window: { from, to }, evidence: {}, lessonAssigned: String, source }  // "rule" | "model"

Lesson  { lessonId, title, durationSec, forAnomalyType, videoUrl, body,
          quiz: [{ q, options: [String], answerIndex: Number }] }

Shift   { shiftId, operatorId, machineId, startedAt, endedAt,
          checklist: [{ item, passed, note }], checklistPhotoUrl, seatbeltConfirmed }
```

---

## Pre-made decisions (do not re-litigate mid-build)

### Operator DNA scoring

```
safety     = clamp0_100(100 - 40*seatbeltViolationRatio - 12*alertsPerHour - 8*proximityBreachesPerShift)
efficiency = clamp0_100(100 - 120*max(0, idleRatio - 0.15) - 60*max(0, fuelPerCycleRatio - 1))
skill      = clamp0_100(100 -  80*max(0, paceRatio - 1))        // paceRatio = actual / estimated
overall    = 0.50*safety + 0.30*efficiency + 0.20*skill
```

Safety is weighted highest deliberately — it mirrors CAT's safety-first culture and is a good answer
when a judge asks why the weights are what they are.

### Anomaly rules (the explainable tier; IsolationForest runs alongside for unknowns)

| Type | Rule (30-min rolling window) |
|---|---|
| `EXCESSIVE_IDLE` | `idleRatio > 0.35` |
| `SEATBELT_VIOLATION` | `seatbeltStatus == "Unfastened" && rpm > 800` |
| `HARSH_OPERATION` | `vibrationEvents > 14` |
| `PROXIMITY_BREACH` | `nearestPersonnelM < 5 && swingRateDegSec > 2` |
| `FUEL_ANOMALY` | `fuelPerCycle > 1.4 × operator's 7-day median` |
| `OVERHEAT` | `engineTempC > 105` |
| `FATIGUE_RISK` *(P2)* | `continuousOperatingMin > 240 && zscore(cycleTimeStdRolling) > 1.5` |

> **These thresholds are empirically tuned against the generated data**, not guessed — each fires on
> roughly 4–17% of 30-min windows. If you regenerate with different parameters, re-run the
> firing-rate check. A rule that never fires silently removes a demo beat; one that always fires
> makes the DNA score meaningless. Both failure modes are invisible until you look.

### Anomaly → lesson mapping (drives the whole coaching loop)

| Anomaly | Lesson |
|---|---|
| `EXCESSIVE_IDLE` | Idle Management & Auto-Shutdown |
| `SEATBELT_VIOLATION` | Restraint Discipline in Rough Terrain |
| `HARSH_OPERATION` | Smooth Swing & Boom Control |
| `PROXIMITY_BREACH` | Spotter Protocol & Swing-Radius Awareness |
| `FUEL_ANOMALY` | Eco-Mode & Throttle Efficiency |
| `OVERHEAT` | Cooling System Pre-Checks |

Lesson completion applies a **+3 bounded bump** to the relevant DNA sub-score and re-runs the ETA
prediction for that operator's next task — this is the visible closing of the loop.

### Idle Waste Meter constants

```
IDLE_BURN_L_PER_HR = 4.5      // typical mid-size excavator at idle
DIESEL_COST_PER_L  = 90       // INR
CO2_KG_PER_L       = 2.68     // standard diesel factor
```

---

## REST API

All authed routes take `Authorization: Bearer <jwt>`.

```
POST   /api/auth/login            { operatorId, pin }        → { token, operator }
GET    /api/auth/me                                          → { operator }

GET    /api/tasks/today?operatorId=                          → [ TaskCard ]   // AI-ordered
POST   /api/tasks/:id/start                                  → { taskId, startedAt }
POST   /api/tasks/:id/complete    { actualTimeMin }          → { dnaDelta, nextTaskEtaShift }
GET    /api/tasks/:id/pace                                   → PaceStatus

POST   /api/shift/start           { machineId }              → { shiftId, checklist[] }
POST   /api/shift/checklist       { shiftId, items[], photo }→ { passed, blockers[] }
GET    /api/shift/:id/report                                 → ReportCard

POST   /api/incidents             Incident (w/ clientId)     → { incident }
GET    /api/incidents?machineId=                             → [ Incident ]

GET    /api/telemetry/live/:machineId                        → TelemetrySnapshot
GET    /api/anomalies?operatorId=                            → [ Anomaly ]

GET    /api/lessons?operatorId=                              → { assigned[], available[] }
POST   /api/lessons/:id/complete  { quizScore }              → { dnaDelta }

POST   /api/predict/task-time     TaskFeatures               → Prediction
POST   /api/assist                { text, lang, context }    → { reply, action?, structured? }   // P2
POST   /api/sync/batch            { operations[] }           → { results[] }                     // offline flush

GET    /api/fleet                                            → [ MachineState ]   // supervisor
GET    /api/fleet/alerts                                     → [ Alert ]          // supervisor
```

### Key response shapes

```jsonc
// TaskCard — what the dashboard renders
{
  "taskId": "T001", "taskType": "Trenching", "machineId": "EXC001",
  "scheduledStart": "2026-09-23T08:00:00Z", "status": "pending",
  "prediction": {
    "p10": 38, "p50": 47, "p90": 61, "unit": "min",
    "drivers": [
      { "feature": "weather",       "value": "Rainy",        "deltaMin":  8, "direction": "up" },
      { "feature": "machineAgeYrs", "value": 6,              "deltaMin":  4, "direction": "up" },
      { "feature": "operatorSkill", "value": "Expert",       "deltaMin": -5, "direction": "down" }
    ],
    "narrative": "Rain and an older machine push this ~25% over baseline."
  }
}

// PaceStatus — drives the Pace Tracker
{ "elapsedMin": 32, "cyclesDone": 18, "cyclesTarget": 45,
  "progressPct": 40, "revisedEtaMin": 59, "varianceMin": 12, "state": "behind" }

// Prediction — /api/predict/task-time and the ML service both return this shape.
// Node's heuristic fallback MUST return this identical shape when FastAPI is down.
{ "p10": 38, "p50": 47, "p90": 61, "unit": "min", "drivers": [...], "source": "model" }  // | "fallback"

// ReportCard
{ "shiftId": "...", "tasksCompleted": 4, "idleMin": 84,
  "idleCostInr": 567, "idleCo2Kg": 16.9,
  "dnaBefore": {...}, "dnaAfter": {...},
  "lessonsCompleted": [...], "tomorrowMatchImprovement": "+12% task-fit" }
```

---

## Socket.IO events

```
client → server    subscribe:machine   { machineId }
                   subscribe:operator  { operatorId }

server → client    telemetry:tick      TelemetrySnapshot
                   alert:new           { type, severity, message, messageHi, speak: true }
                   anomaly:detected    Anomaly
                   lesson:assigned     Lesson          // ⭐ the loop closing, on screen
                   pace:update         PaceStatus
                   proximity:warning   { distanceM, bearing, severity }
```

Every `alert:new` carries pre-translated `messageHi` so TTS never waits on a network call.

---

## ML service (`/ml`, FastAPI, port 8000)

```
POST /predict   TaskFeatures → Prediction     (HistGradientBoostingRegressor, quantile loss ×3)
POST /anomaly   { window }   → { isAnomaly, score, topFeatures[] }   (IsolationForest)
GET  /health
```

**"Why" drivers without SHAP:** predict once with the real feature vector, then re-predict with each
feature swapped to its training median. The delta is that feature's contribution. Fast, no extra
dependency, and the output reads better than SHAP values for a non-technical audience.

**Node fallback (build this — it saves the demo):** if FastAPI is unreachable, `/api/predict/task-time`
returns the same shape from a heuristic:
```
base[taskType] × weatherMult × skillMult × (1 + 0.04 × machineAgeYrs)
p10 = 0.8 × p50,  p90 = 1.3 × p50,  source = "fallback"
```

---

## Data generator (`/data`) — build this first, it blocks everything

15 machines × 25 operators × 60 days, 5-min telemetry over 10h shifts
→ **~108,000 telemetry rows + ~2,500 tasks**.

**The one line that matters most:** for ~8 operators, after their `lessonCompletedDate`, reduce idle
ratio and harsh-event counts by 15–30% and tighten cycle-time variance. Without this the closed loop
can only be *asserted*; with it, the Report Card renders a real before/after curve and the entire
pitch is evidenced. Do not skip it to save five minutes.
