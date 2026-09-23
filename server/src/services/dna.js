import { Telemetry, Task, Operator } from '../models/index.js'

const clamp = (v) => Math.max(0, Math.min(100, v))
const round = (v) => Math.round(v * 10) / 10

function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!sorted.length) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// One pass over the time-series collection rather than a query per operator.
async function gatherStats() {
  const telemetry = await Telemetry.aggregate([
    {
      $group: {
        _id: '$meta.operatorId',
        ticks: { $sum: 1 },
        idleTicks: { $sum: { $cond: [{ $gt: ['$idlingTimeMin', 0] }, 1, 0] } },
        activeTicks: { $sum: { $cond: [{ $eq: ['$idlingTimeMin', 0] }, 1, 0] } },
        seatbeltViolations: { $sum: { $cond: [{ $eq: ['$seatbeltStatus', 'Unfastened'] }, 1, 0] } },
        safetyAlerts: { $sum: { $cond: ['$safetyAlertTriggered', 1, 0] } },
        proximityBreaches: {
          $sum: {
            $cond: [{ $and: [{ $lt: ['$nearestPersonnelM', 5] }, { $gt: ['$swingRateDegSec', 2] }] }, 1, 0]
          }
        },
        fuel: { $sum: '$fuelUsedL' },
        cycles: { $sum: '$loadCycles' }
      }
    }
  ])

  const tasks = await Task.aggregate([
    { $match: { status: 'done', actualTimeMin: { $gt: 0 }, estimatedTimeMin: { $gt: 0 } } },
    {
      $group: {
        _id: '$operatorId',
        paceRatio: { $avg: { $divide: ['$actualTimeMin', '$estimatedTimeMin'] } },
        completed: { $sum: 1 }
      }
    }
  ])

  const taskBy = Object.fromEntries(tasks.map((t) => [t._id, t]))
  return telemetry.map((t) => {
    const hours = (t.ticks * 5) / 60
    return {
      operatorId: t._id,
      idleRatio: t.ticks ? t.idleTicks / t.ticks : 0,
      seatbeltViolationRatio: t.activeTicks ? t.seatbeltViolations / t.activeTicks : 0,
      alertsPerHour: hours ? t.safetyAlerts / hours : 0,
      proximityBreachesPerShift: t.ticks ? t.proximityBreaches / (t.ticks / 120) : 0,
      fuelPerCycle: t.cycles ? t.fuel / t.cycles : 0,
      paceRatio: taskBy[t._id]?.paceRatio ?? 1,
      tasksCompleted: taskBy[t._id]?.completed ?? 0
    }
  })
}

// Scores every operator and writes the result back. Safety is weighted heaviest (50/30/20).
export async function recomputeAllDna() {
  const stats = await gatherStats()
  if (!stats.length) return []

  const fuelMedian = median(stats.map((s) => s.fuelPerCycle))

  const scored = stats.map((s) => {
    const fuelRatio = fuelMedian ? s.fuelPerCycle / fuelMedian : 1

    const safety = clamp(
      100 - 40 * s.seatbeltViolationRatio - 12 * s.alertsPerHour - 8 * s.proximityBreachesPerShift
    )
    const efficiency = clamp(
      100 - 120 * Math.max(0, s.idleRatio - 0.15) - 60 * Math.max(0, fuelRatio - 1)
    )
    const skill = clamp(100 - 80 * Math.max(0, s.paceRatio - 1))
    const overall = 0.5 * safety + 0.3 * efficiency + 0.2 * skill

    return {
      operatorId: s.operatorId,
      dnaScore: {
        safety: round(safety),
        efficiency: round(efficiency),
        skill: round(skill),
        overall: round(overall)
      },
      stats: s
    }
  })

  await Operator.bulkWrite(
    scored.map((s) => ({
      updateOne: {
        filter: { operatorId: s.operatorId },
        update: {
          $set: { dnaScore: s.dnaScore },
          $push: { dnaHistory: { date: new Date(), ...s.dnaScore } }
        }
      }
    }))
  )

  return scored
}
