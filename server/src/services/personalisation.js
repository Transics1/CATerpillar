// Scales the model's prediction by how this operator is currently performing. The estimator
// only sees a coarse skill level, which cannot move within a shift; this carries the part that
// does, so a completed lesson changes the next estimate.
//
// Safety is excluded on purpose: a safer operator is not a slower one, and implying otherwise
// would put an incentive somewhere it does not belong.

const NEUTRAL = 75 // a score of 75 is the break-even point: no adjustment either way
const SENSITIVITY = 200 // larger = flatter response
const MIN_FACTOR = 0.88
const MAX_FACTOR = 1.15

export function personalFactor(dna = {}) {
  const skill = dna.skill ?? NEUTRAL
  const efficiency = dna.efficiency ?? NEUTRAL
  const delta = (NEUTRAL - skill) * 0.6 + (NEUTRAL - efficiency) * 0.4
  return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, 1 + delta / SENSITIVITY))
}

// Exposes the adjustment as a named driver so it is visible on the card, not silently baked in.
export function personalise(prediction, dna) {
  const factor = personalFactor(dna)
  const deltaMin = prediction.p50 * (factor - 1)

  const scaled = {
    ...prediction,
    p10: Math.round(prediction.p10 * factor * 10) / 10,
    p50: Math.round(prediction.p50 * factor * 10) / 10,
    p90: Math.round(prediction.p90 * factor * 10) / 10,
    personalFactor: Math.round(factor * 1000) / 1000
  }

  if (Math.abs(deltaMin) >= 0.5) {
    scaled.drivers = [
      {
        feature: 'Your recent pace',
        value: `DNA ${dna?.overall ?? '-'}`,
        deltaMin: Math.round(deltaMin * 10) / 10,
        direction: deltaMin > 0 ? 'up' : 'down'
      },
      ...(prediction.drivers ?? [])
    ].slice(0, 3)
  }

  return scaled
}
