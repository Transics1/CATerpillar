"""
Synthetic dataset generator for CAT Copilot.

Supersets the two sample tables from the problem statement with the extra parameters our
features need (location, machine health, operation quality, environment, BLE proximity,
fatigue inputs).

The one thing in here that is NOT decoration: the `improvement cohort`. A subset of operators
get a lesson-completion date, and after that date their idle ratio, harsh-event rate and
cycle-time variance measurably improve. Without it the coaching loop can only be asserted in
the pitch; with it, the report card renders a real before/after curve.

Usage:  python data/generate.py
Output: data/out/{operators,machines,telemetry,tasks,lessons}.csv
"""

import os
import json
import random
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

SEED = 42
random.seed(SEED)
np.random.seed(SEED)

OUT_DIR = os.path.join(os.path.dirname(__file__), "out")

# ----------------------------------------------------------------------------- config

N_DAYS = 60
SHIFT_START_HOUR = 8
SHIFT_HOURS = 10
TICK_MINUTES = 5
TICKS_PER_SHIFT = (SHIFT_HOURS * 60) // TICK_MINUTES  # 120

SITE_CENTER = (12.9716, 77.5946)  # Bengaluru-ish; keeps the Leaflet map plausible
ZONES = ["Zone-A-Excavation", "Zone-B-Haul", "Zone-C-Stockpile", "Zone-D-Demolition"]

MACHINES = (
    [(f"EXC{i:03d}", "EXC", "CAT 320") for i in range(1, 7)]
    + [(f"LOAD{i:03d}", "LOAD", "CAT 950M") for i in range(1, 5)]
    + [(f"DOZ{i:03d}", "DOZ", "CAT D6") for i in range(1, 4)]
    + [(f"GRD{i:03d}", "GRD", "CAT 140") for i in range(1, 3)]
)

SKILLS = ["Beginner", "Intermediate", "Expert"]
SKILL_IDLE_BASE = {"Beginner": 0.30, "Intermediate": 0.22, "Expert": 0.14}
SKILL_TIME_MULT = {"Beginner": 1.18, "Intermediate": 1.00, "Expert": 0.88}
SKILL_HARSH_BASE = {"Beginner": 6.0, "Intermediate": 3.5, "Expert": 1.8}

WEATHERS = ["Sunny", "Cloudy", "Rainy", "Windy"]
WEATHER_P = [0.45, 0.25, 0.18, 0.12]
WEATHER_TIME_MULT = {"Sunny": 1.00, "Cloudy": 1.02, "Windy": 1.10, "Rainy": 1.18}

TASK_TYPES = {
    #                     base_min  machine_type
    "Earth Excavation": (60, "EXC"),
    "Trenching": (45, "EXC"),
    "Material Loading": (30, "LOAD"),
    "Grading": (35, "GRD"),
    "Demolition": (90, "DOZ"),
}

# Zones follow the work, not chance. Randomising this produced cards reading
# "Earth Excavation - Zone-D-Demolition", which anyone who knows a jobsite would flag.
TASK_ZONE = {
    "Earth Excavation": "Zone-A-Excavation",
    "Trenching": "Zone-A-Excavation",
    "Material Loading": "Zone-C-Stockpile",
    "Grading": "Zone-B-Haul",
    "Demolition": "Zone-D-Demolition",
}
SHIFT_PERIOD_MULT = {"morning": 1.00, "afternoon": 1.05, "night": 1.12}

# Anomaly -> lesson mapping. Mirrors BUILD_SPEC.md; keep the two in sync.
LESSONS = [
    ("L01", "Idle Management & Auto-Shutdown", "EXCESSIVE_IDLE", 90),
    ("L02", "Restraint Discipline in Rough Terrain", "SEATBELT_VIOLATION", 75),
    ("L03", "Smooth Swing & Boom Control", "HARSH_OPERATION", 120),
    ("L04", "Spotter Protocol & Swing-Radius Awareness", "PROXIMITY_BREACH", 105),
    ("L05", "Eco-Mode & Throttle Efficiency", "FUEL_ANOMALY", 90),
    ("L06", "Cooling System Pre-Checks", "OVERHEAT", 60),
]

N_OPERATORS = 25
IMPROVEMENT_COHORT_SIZE = 8
IMPROVEMENT_DAY = 35  # day index after which the cohort's behaviour improves

FIRST_NAMES = [
    "Ravi", "Arjun", "Sunil", "Deepak", "Manoj", "Karthik", "Imran", "Vikram", "Suresh",
    "Anil", "Rahul", "Prakash", "Naveen", "Sanjay", "Ganesh", "Rakesh", "Vinod", "Ajay",
    "Mahesh", "Pradeep", "Kiran", "Dinesh", "Harish", "Nitin", "Ashok",
]
LAST_NAMES = [
    "Kumar", "Sharma", "Reddy", "Nair", "Patil", "Singh", "Das", "Rao", "Verma", "Yadav",
]


# ----------------------------------------------------------------------------- helpers

def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def make_operators():
    rows = []
    cohort = set(random.sample(range(N_OPERATORS), IMPROVEMENT_COHORT_SIZE))
    base_date = datetime.now() - timedelta(days=N_DAYS)

    for i in range(N_OPERATORS):
        skill = random.choices(SKILLS, weights=[0.3, 0.45, 0.25])[0]
        in_cohort = i in cohort
        rows.append(
            {
                "operatorId": f"OP{1001 + i}",
                "name": f"{FIRST_NAMES[i % len(FIRST_NAMES)]} {random.choice(LAST_NAMES)}",
                "language": random.choices(["en", "hi"], weights=[0.55, 0.45])[0],
                "skillLevel": skill,
                "certifications": json.dumps(
                    random.sample(["Excavator-L1", "Loader-L1", "Dozer-L1", "Safety-Basic"],
                                  k=random.randint(1, 3))
                ),
                "joinDate": (base_date - timedelta(days=random.randint(90, 1800))).date().isoformat(),
                # behavioural profile - drives telemetry generation, not persisted to the app
                "_idleBase": SKILL_IDLE_BASE[skill] + np.random.normal(0, 0.03),
                "_harshBase": SKILL_HARSH_BASE[skill] + np.random.normal(0, 0.6),
                # Tuned so ~7% of 30-min windows contain a violation. beta(2,18) put it at 33%,
                # which made the safety sub-score meaningless because nearly everyone was in breach.
                "_seatbeltViolationP": clamp(np.random.beta(1.5, 100), 0.002, 0.12),
                "_fuelFactor": clamp(np.random.normal(1.0, 0.09), 0.8, 1.35),
                "_inCohort": in_cohort,
                "_lessonDay": IMPROVEMENT_DAY if in_cohort else None,
                "_lessonId": random.choice(LESSONS)[0] if in_cohort else None,
            }
        )
    return pd.DataFrame(rows)


def improvement_factor(op_row, day_index):
    """Returns multipliers (idle, harsh, variance) for this operator on this day."""
    if not op_row["_inCohort"] or day_index < op_row["_lessonDay"]:
        return 1.0, 1.0, 1.0
    # Ramp the improvement in over ~7 days so the curve looks like learning, not a step function.
    ramp = clamp((day_index - op_row["_lessonDay"]) / 7.0, 0.0, 1.0)
    return (
        1.0 - 0.28 * ramp,   # idle ratio down up to 28%
        1.0 - 0.32 * ramp,   # harsh events down up to 32%
        1.0 - 0.22 * ramp,   # cycle-time variance tightens
    )


def make_machines():
    return pd.DataFrame(
        [
            {
                "machineId": mid,
                "machineType": mtype,
                "model": model,
                "ageYears": random.randint(1, 8),
                "attachment": {"EXC": "Bucket", "LOAD": "GP Bucket",
                               "DOZ": "Straight Blade", "GRD": "Moldboard"}[mtype],
                "status": "idle",
            }
            for mid, mtype, model in MACHINES
        ]
    )


def make_day_weather(day_index):
    w = random.choices(WEATHERS, weights=WEATHER_P)[0]
    base_temp = {"Sunny": 33, "Cloudy": 29, "Rainy": 26, "Windy": 28}[w]
    return {
        "weather": w,
        "ambientTempC": round(base_temp + np.random.normal(0, 2.5), 1),
        "humidityPct": round(clamp(np.random.normal(60 if w != "Rainy" else 85, 10), 20, 99), 1),
        "windKph": round(clamp(np.random.normal(25 if w == "Windy" else 9, 5), 0, 60), 1),
    }


# ----------------------------------------------------------------------------- telemetry

def make_telemetry(operators, machines):
    rows = []
    start_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=N_DAYS)
    engine_hours = {m: float(random.randint(800, 4000)) for m in machines["machineId"]}
    op_ids = operators["operatorId"].tolist()

    for day in range(N_DAYS):
        date = start_date + timedelta(days=day)
        if date.weekday() == 6:  # Sunday off
            continue
        weather = make_day_weather(day)

        # Rotate operators across machines so everyone accumulates history.
        assignment = {}
        shuffled = op_ids[:]
        random.shuffle(shuffled)
        for idx, mid in enumerate(machines["machineId"]):
            assignment[mid] = shuffled[idx % len(shuffled)]

        for _, machine in machines.iterrows():
            mid = machine["machineId"]
            oid = assignment[mid]
            op = operators[operators["operatorId"] == oid].iloc[0]
            idle_mult, harsh_mult, var_mult = improvement_factor(op, day)

            shift_start = date.replace(hour=SHIFT_START_HOUR)
            zone = random.choice(ZONES)
            lat, lng = SITE_CENTER[0] + np.random.normal(0, 0.004), SITE_CENTER[1] + np.random.normal(0, 0.004)

            idle_ratio = clamp(op["_idleBase"] * idle_mult + np.random.normal(0, 0.04), 0.03, 0.75)
            cycle_mean = 55 + np.random.normal(0, 6)
            cycle_std = clamp((7 + np.random.normal(0, 2)) * var_mult, 1.5, 20)
            cum_cycles = 0

            for tick in range(TICKS_PER_SHIFT):
                ts = shift_start + timedelta(minutes=tick * TICK_MINUTES)
                continuous_min = tick * TICK_MINUTES
                # Fatigue: variance drifts upward late in the shift.
                fatigue = clamp((continuous_min - 240) / 360.0, 0, 1)
                is_idle = random.random() < idle_ratio

                if is_idle:
                    cycles = 0
                    rpm = int(np.random.normal(750, 60))
                    throttle = round(clamp(np.random.normal(12, 4), 0, 35), 1)
                    fuel = round(4.5 / 12 * op["_fuelFactor"] + np.random.normal(0, 0.03), 3)
                    payload = 0
                    swing = round(clamp(np.random.normal(0.2, 0.15), 0, 1), 2)
                    vib = 0
                else:
                    cycles = max(0, int(np.random.normal(TICK_MINUTES * 60 / cycle_mean, 0.8)))
                    rpm = int(np.random.normal(1650, 180))
                    throttle = round(clamp(np.random.normal(68, 12), 20, 100), 1)
                    fuel = round(18.0 / 12 * op["_fuelFactor"] + np.random.normal(0, 0.12), 3)
                    payload = int(clamp(np.random.normal(2400, 420), 0, 4200))
                    swing = round(clamp(np.random.normal(2.6, 0.9), 0, 8), 2)
                    # Scaled so a 30-min window (6 ticks) separates skill levels either side of
                    # the HARSH_OPERATION threshold of 8 in BUILD_SPEC.md:
                    # beginner ~15/window, expert ~4/window. Do not rescale without re-tuning that rule.
                    vib = int(max(0, np.random.poisson(op["_harshBase"] * harsh_mult / 2.4 * (1 + fatigue))))

                cum_cycles += cycles
                engine_hours[mid] += TICK_MINUTES / 60 * (0.35 if is_idle else 1.0)

                seatbelt_violation = (not is_idle) and random.random() < op["_seatbeltViolationP"]
                nearest_personnel = round(clamp(np.random.gamma(3, 12), 1.5, 120), 1)
                proximity_breach = nearest_personnel < 5 and swing > 2

                rows.append(
                    {
                        "timestamp": ts.isoformat(),
                        "machineId": mid,
                        "operatorId": oid,
                        "machineType": machine["machineType"],
                        "attachment": machine["attachment"],
                        "engineHours": round(engine_hours[mid], 1),
                        "fuelUsedL": fuel,
                        "loadCycles": cycles,
                        "idlingTimeMin": TICK_MINUTES if is_idle else 0,
                        "seatbeltStatus": "Unfastened" if seatbelt_violation else "Fastened",
                        "safetyAlertTriggered": bool(seatbelt_violation or proximity_breach),
                        "lat": round(lat + np.random.normal(0, 0.0004), 6),
                        "lng": round(lng + np.random.normal(0, 0.0004), 6),
                        "geofenceZone": zone,
                        "terrainSlopeDeg": round(clamp(np.random.normal(5, 3), 0, 22), 1),
                        # Anomaly rules take the MAX over a 6-tick window, which inflates the tail.
                        # Centred at ~86C with a tight sd so OVERHEAT (>105) stays a rare event
                        # rather than firing in one window out of six.
                        "engineTempC": round(clamp(np.random.normal(86 if not is_idle else 78, 4.5)
                                                   + weather["ambientTempC"] * 0.15, 60, 118), 1),
                        "hydraulicPressureBar": round(clamp(np.random.normal(210 if not is_idle else 60, 25), 20, 330), 1),
                        "oilPressureBar": round(clamp(np.random.normal(4.2, 0.5), 1.5, 7), 2),
                        "batteryVoltage": round(clamp(np.random.normal(27.8, 0.8), 22, 30), 2),
                        "rpm": rpm,
                        "throttlePct": throttle,
                        "payloadKg": payload,
                        "swingRateDegSec": swing,
                        "vibrationEvents": vib,
                        "ambientTempC": weather["ambientTempC"],
                        "humidityPct": weather["humidityPct"],
                        "windKph": weather["windKph"],
                        "weather": weather["weather"],
                        "nearestPersonnelM": nearest_personnel,
                        "personnelInRadius": int(max(0, np.random.poisson(1.2))),
                        "continuousOperatingMin": continuous_min,
                        "shiftStartTs": shift_start.isoformat(),
                        "cycleTimeSec": round(clamp(np.random.normal(cycle_mean, cycle_std * (1 + fatigue)), 15, 200), 1),
                        "cycleTimeStdRolling": round(cycle_std * (1 + fatigue), 2),
                    }
                )
    return pd.DataFrame(rows)


# ----------------------------------------------------------------------------- tasks

def make_tasks(operators, machines):
    rows = []
    start_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=N_DAYS)
    tid = 1

    for day in range(N_DAYS):
        date = start_date + timedelta(days=day)
        if date.weekday() == 6:
            continue
        weather = make_day_weather(day)

        for _ in range(random.randint(40, 50)):
            task_type = random.choice(list(TASK_TYPES.keys()))
            base_min, req_type = TASK_TYPES[task_type]
            candidates = machines[machines["machineType"] == req_type]
            machine = candidates.sample(1).iloc[0]
            op = operators.sample(1).iloc[0]
            _, _, _ = improvement_factor(op, day)

            shift_period = random.choices(
                ["morning", "afternoon", "night"], weights=[0.5, 0.38, 0.12]
            )[0]
            slope = round(clamp(np.random.normal(5, 3), 0, 22), 1)
            volume = round(clamp(np.random.normal(1.0, 0.25), 0.4, 2.0), 2)

            # Effective skill improves for the cohort after their lesson.
            skill_mult = SKILL_TIME_MULT[op["skillLevel"]]
            if op["_inCohort"] and day >= op["_lessonDay"]:
                ramp = clamp((day - op["_lessonDay"]) / 7.0, 0, 1)
                skill_mult *= 1 - 0.09 * ramp

            actual = (
                base_min
                * volume
                * WEATHER_TIME_MULT[weather["weather"]]
                * skill_mult
                * (1 + 0.04 * machine["ageYears"])
                * (1 + 0.012 * slope)
                * SHIFT_PERIOD_MULT[shift_period]
                * (1 + np.random.normal(0, 0.09))
            )
            # A planner's naive estimate: volume-scaled base with a light skill nudge only.
            estimated = base_min * volume * (0.95 if op["skillLevel"] == "Expert" else 1.05)

            rows.append(
                {
                    "taskId": f"T{tid:05d}",
                    "taskType": task_type,
                    "machineType": req_type,
                    "machineId": machine["machineId"],
                    "operatorId": op["operatorId"],
                    "siteZone": TASK_ZONE[task_type],
                    "scheduledDate": date.date().isoformat(),
                    "shiftPeriod": shift_period,
                    "weather": weather["weather"],
                    "ambientTempC": weather["ambientTempC"],
                    "operatorSkill": op["skillLevel"],
                    "machineAgeYrs": int(machine["ageYears"]),
                    "targetVolumeM3": round(volume * 40, 1),
                    "payloadTargetKg": int(volume * 32000),
                    "terrainType": random.choice(["Clay", "Gravel", "Sand", "Rock", "Mixed"]),
                    "terrainSlope": slope,
                    "estimatedTimeMin": round(estimated, 1),
                    "actualTimeMin": round(actual, 1),
                    "interruptions": int(max(0, np.random.poisson(0.6))),
                    "status": "done",
                }
            )
            tid += 1
    return pd.DataFrame(rows)


# ----------------------------------------------------------------------------- main

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("generating operators + machines ...")
    operators = make_operators()
    machines = make_machines()

    print("generating telemetry (this is the slow one) ...")
    telemetry = make_telemetry(operators, machines)

    print("generating tasks ...")
    tasks = make_tasks(operators, machines)

    lessons = pd.DataFrame(
        [{"lessonId": l, "title": t, "forAnomalyType": a, "durationSec": d} for l, t, a, d in LESSONS]
    )

    # Persist the cohort so the seeder can attach lesson-completion history.
    cohort = operators[operators["_inCohort"]][["operatorId", "_lessonDay", "_lessonId"]].copy()
    cohort.columns = ["operatorId", "lessonDayIndex", "lessonId"]

    public_cols = [c for c in operators.columns if not c.startswith("_")]
    operators[public_cols].to_csv(f"{OUT_DIR}/operators.csv", index=False)
    machines.to_csv(f"{OUT_DIR}/machines.csv", index=False)
    telemetry.to_csv(f"{OUT_DIR}/telemetry.csv", index=False)
    tasks.to_csv(f"{OUT_DIR}/tasks.csv", index=False)
    lessons.to_csv(f"{OUT_DIR}/lessons.csv", index=False)
    cohort.to_csv(f"{OUT_DIR}/improvement_cohort.csv", index=False)

    print(f"\n  operators  {len(operators):>7,}")
    print(f"  machines   {len(machines):>7,}")
    print(f"  telemetry  {len(telemetry):>7,}")
    print(f"  tasks      {len(tasks):>7,}")
    print(f"  cohort     {len(cohort):>7,}  (operators with a visible before/after)")
    print(f"\nwritten to {OUT_DIR}")


if __name__ == "__main__":
    main()
