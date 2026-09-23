# CAT Copilot

**Smart Operator Assistant for CAT machinery** — Caterpillar Hackathon 2026

A mobile-first assistant that runs on the operator's own phone and supports them through the
whole working day: pre-start walkaround, task plan, live coaching, incident reporting, and an
end-of-shift report.

---

## The idea

The brief lists five outcomes — task dashboard, safety features, training hub, unusual-behaviour
detection, task time estimation. The obvious build is five separate tabs. That's a dashboard, and
an operator opens it once.

We built the arrows between them instead.

```
   Task assigned, estimated by a model
              │
              ▼
   Operator works — live telemetry streams in
              │
              ▼
   Unsafe or wasteful pattern detected
              │
              ▼
   90-second lesson auto-assigned, citing THAT operator's own data
              │
              ▼
   Lesson completed → performance score moves
              │
              ▼
   Next day's estimates recalibrate, task matching improves
              │
              └────────────────────────────────► ↺
```

> **Every unsafe second becomes a lesson. Every lesson makes the next estimate better.**

A lesson that says "idling wastes fuel" is training. A lesson that says *"you were idle 67% of a
30-minute window on EXC004"* is coaching. That difference is the product.

---

## Measured results

Every number below comes from the running system, not an estimate.

| | |
|---|---|
| Task-time estimator MAE | **6.15 min** (MAPE 8.7%) |
| vs. the planner's own estimate in the dataset | **62.3% more accurate** |
| Prediction interval coverage | **79.0%** against an 80% target |
| Anomaly model | Isolation Forest, flags 8.0% of windows |
| Operator scoring validity | Beginner 82.5 → Intermediate 89.8 → Expert 93.0 |
| Dataset | 91,800 telemetry rows · 2,321 tasks · 25 operators · 15 machines · 60 days |

### On that 79%

Raw quantile regression covered only 60.6% of held-out tasks inside its own "P10–P90" band — a
confidence interval that was wrong a third of the time while claiming otherwise. We added
conformal calibration: hold out a split, measure how far outside the band those points fell,
widen by that amount. The interval now means what it says.

We think that's worth more than a slightly lower MAE.

---

## Features

**For the operator**

- **Daily plan, not a task list.** Ordered by shift window and workload. Each task shows a
  predicted duration, a calibrated range, and the factors behind it in minutes ("Rainy +8.3,
  Beginner +6.2, newer machine −2.9").
- **Pre-start walkaround** with machine-type-specific checks and a seatbelt gate that actually
  blocks task start. A checklist that can't stop you is a form, not a safety control.
- **Live pace tracker** that re-estimates mid-task against the operator's own observed rate.
- **Idle waste meter** — idle minutes into litres, rupees and kg CO₂, live, with a spoken nudge
  at three minutes.
- **Coaching hub** where lessons arrive automatically from detected patterns, each citing the
  telemetry that triggered it, with the payoff quantified (~₹1,068 and 31.8 kg CO₂ per week for
  one idle-management lesson).
- **Operator DNA score** — safety, efficiency, skill, weighted 50/30/20.
- **Incident reporting that works offline**, with voice dictation.

**For the supervisor**

- Day-wide assignment board across all operators and machines.
- Mark an operator sick or injured and their stranded work surfaces immediately.
- **Ranked reassignment** scoring candidates on certification, machine-type experience, current
  load and track record — every suggestion shows its reasoning.
- Machine faults with rerouting to alternatives.

---

## Built for the cab

The operator is wearing gloves, in noise and dust and sunlight, with unreliable signal, and may
not read English well. That drove real decisions:

| Constraint | Response |
|---|---|
| Hands on the levers | Voice commands, spoken alerts |
| Gloves, vibration, glare | Oversized targets, high contrast, haptic-first |
| Site loses signal | Offline-first queue, syncs on reconnect |
| Mixed languages | Hindi/English speech |

**The voice assistant deliberately does not call an LLM.** Local keyword matching costs nothing,
answers instantly, and keeps working in a dead zone. An assistant that needs the cloud is useless
where operators actually work.

---

## Architecture

```
┌──────────────────────┐     ┌──────────────────────┐
│  Operator PWA        │     │  Supervisor console  │
│  React · Vite · TW   │     │  (same app, gated    │
│  Service worker      │     │   by JWT role)       │
│  IndexedDB outbox    │     └──────────┬───────────┘
└──────────┬───────────┘                │
           │      REST + Socket.IO      │
           └─────────────┬──────────────┘
                         ▼
          ┌──────────────────────────────┐
          │  Node · Express · Socket.IO  │
          │  JWT + RBAC                  │
          │  Telemetry simulator         │
          │  Anomaly engine              │
          │  Coaching loop               │
          └───────┬──────────────┬───────┘
                  ▼              ▼
     ┌─────────────────┐   ┌──────────────────────┐
     │ MongoDB Atlas   │   │ FastAPI · scikit-    │
     │ (time-series)   │   │ learn  /predict      │
     └─────────────────┘   │        /anomaly      │
                           └──────────────────────┘
```

Node proxies to the ML service and **falls back to a heuristic returning the identical response
shape** if it is unreachable, so a model outage is invisible to the operator.

**Stack:** React 18, Vite, Tailwind, vite-plugin-pwa, Recharts, Socket.IO, idb · Node, Express,
Mongoose, JWT, bcrypt · MongoDB Atlas time-series · Python, FastAPI, scikit-learn, pandas.
Entirely free tier and open source — no paid APIs.

---

## Running it

```bash
npm install
python -m pip install -r ml/requirements.txt

cp server/.env.example server/.env    # add your MongoDB Atlas URI

python data/generate.py               # synthetic dataset
python ml/train.py                    # train estimator + anomaly model
npm run seed                          # load Atlas, compute DNA scores

python -m uvicorn ml.app:app --port 8000
npm run dev
```

Sign in with any operator and PIN `1234`, or the supervisor `SUP001` / `9999`.

`server/src/scripts/build-roster.js --reset` restores a clean day between runs.

---

## What's real and what's simulated

We'd rather state this than have it found.

- **Telemetry is a replay of our generated dataset**, not a live machine feed. The ingestion,
  detection and coaching path is real; the source is simulated. Swapping in a real feed means
  changing one service.
- **Proximity comes from simulated BLE personnel tags**, not computer vision. Real sites use
  exactly this approach.
- **Auth is PIN-based** by choice. A real deployment would federate to the site's identity
  provider.
- **Certifications are randomly assigned** in the generator, so an operator can hold a
  certification that doesn't match their job history.

---

## Notes on the build

Three bugs we found by measuring rather than assuming, each of which would have survived to a
demo:

- The anomaly threshold we chose from first principles fired on **47% of all windows**. A rule
  that always fires makes the coaching signal meaningless. Now tuned against the real
  distributions — every rule fires on 0.4–16%.
- The confidence interval covered **61%** of outcomes while advertising 80%. Fixed with conformal
  calibration.
- The pace tracker read **"33 minutes ahead" permanently**, because the cycle target came from
  bucket volume while the estimate came from the model, and the two disagreed by 40%. A pace
  tracker that always says the same thing is worse than none.

Docs: [`BUILD_SPEC.md`](BUILD_SPEC.md) for schemas, API shapes and tuned thresholds ·
[`TESTING.md`](TESTING.md) for the device test plan.
