import axios from 'axios'

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000'

// Mirrors data/generate.py so the fallback lands in the right neighbourhood.
const BASE_MIN = {
  'Earth Excavation': 60,
  Trenching: 45,
  'Material Loading': 30,
  Grading: 35,
  Demolition: 90
}
const WEATHER_MULT = { Sunny: 1.0, Cloudy: 1.02, Windy: 1.1, Rainy: 1.18 }
const SKILL_MULT = { Beginner: 1.18, Intermediate: 1.0, Expert: 0.88 }
const PERIOD_MULT = { morning: 1.0, afternoon: 1.05, night: 1.12 }

// Used when the ML service is unreachable. Returns the same shape as /predict, drivers
// included, so the client cannot tell the difference. `source` is the only tell.
function heuristic(f) {
  const base = BASE_MIN[f.taskType] ?? 45
  const volume = (f.targetVolumeM3 ?? 40) / 40
  const weather = WEATHER_MULT[f.weather] ?? 1
  const skill = SKILL_MULT[f.operatorSkill] ?? 1
  const period = PERIOD_MULT[f.shiftPeriod] ?? 1
  const age = 1 + 0.04 * (f.machineAgeYrs ?? 3)
  const slope = 1 + 0.012 * (f.terrainSlope ?? 5)

  const p50 = base * volume * weather * skill * age * period * slope
  const plain = base * volume

  const drivers = [
    { feature: 'Weather', value: f.weather, deltaMin: plain * (weather - 1) },
    { feature: 'Your skill level', value: f.operatorSkill, deltaMin: plain * (skill - 1) },
    { feature: 'Machine age', value: `${f.machineAgeYrs ?? 3} yr`, deltaMin: plain * (age - 1) },
    { feature: 'Slope', value: `${f.terrainSlope ?? 5} deg`, deltaMin: plain * (slope - 1) }
  ]
    .filter((d) => Math.abs(d.deltaMin) >= 0.5)
    .map((d) => ({ ...d, deltaMin: Math.round(d.deltaMin * 10) / 10, direction: d.deltaMin > 0 ? 'up' : 'down' }))
    .sort((a, b) => Math.abs(b.deltaMin) - Math.abs(a.deltaMin))
    .slice(0, 3)

  const bits = drivers.map((d) => `${d.feature.toLowerCase()} ${d.deltaMin > 0 ? '+' : ''}${d.deltaMin} min`).join(', ')

  return {
    p10: Math.round(Math.max(1, p50 * 0.8) * 10) / 10,
    p50: Math.round(p50 * 10) / 10,
    p90: Math.round(p50 * 1.3 * 10) / 10,
    unit: 'min',
    drivers,
    narrative: drivers.length ? `About ${Math.round(p50)} min. Driven by ${bits}.` : `About ${Math.round(p50)} min.`,
    source: 'fallback'
  }
}

export async function predictTaskTime(features) {
  try {
    const { data } = await axios.post(`${ML_URL}/predict`, features, { timeout: 2500 })
    return data
  } catch {
    return heuristic(features)
  }
}

export async function scoreAnomaly(window) {
  try {
    const { data } = await axios.post(`${ML_URL}/anomaly`, window, { timeout: 2500 })
    return data
  } catch {
    return { isAnomaly: false, score: 0, topFeatures: [], source: 'fallback' }
  }
}
