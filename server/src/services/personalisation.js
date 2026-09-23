/**
 * Turns an operator's DNA score into a multiplier on the model's predicted duration.
 *
 * The estimator is trained on task features plus a coarse skill LEVEL (Beginner/Intermediate/
 * Expert), which cannot move within a shift. This layer carries the part that does: how this
 * specific operator is currently performing. It is what lets a completed lesson change
 * tomorrow's estimate instead of the loop merely claiming it does.
 *
 * Skill is weighted above efficiency because it reflects pace directly, while efficiency
 * reaches duration indirectly through idling and rework. Safety is deliberately excluded -
 * a safer operator is not a slower one, and implying otherwise would create an incentive we
 * do not want anywhere near a safety score.
 */

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

/**
 * Applies the operator's factor to a prediction and exposes it as a named driver, so the
 * adjustment is visible and explained on the task card rather than silently baked in.
 */
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
