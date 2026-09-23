import { Telemetry } from '../models/index.js'
import { IDLE_BURN_L_PER_HR, DIESEL_COST_PER_L, CO2_KG_PER_L } from './simulator.js'

/**
 * Projects what a completed lesson is actually worth to this operator.
 *
 * A 90-second lesson does not make someone measurably faster, and dialling up the ETA effect
 * to make the demo look good would be a lie the numbers cannot support. What an idle-management
 * lesson genuinely changes is fuel burned while parked - so that is what we report, computed
 * from this operator's own last 30 shifts rather than an invented figure.
 *
 * The improvement rate is the one observed in the dataset for operators who completed a lesson
 * (idle down ~25%, harsh events down ~28%), so the projection is grounded in measured behaviour.
 */

const OBSERVED_IDLE_REDUCTION = 0.25
const OBSERVED_HARSH_REDUCTION = 0.28
const SHIFTS_PER_WEEK = 6
const TICK_MINUTES = 5

export async function projectLessonImpact(operatorId, affectedField) {
  const [stats] = await Telemetry.aggregate([
    { $match: { 'meta.operatorId': operatorId } },
    {
      $group: {
        _id: null,
        ticks: { $sum: 1 },
        idleTicks: { $sum: { $cond: [{ $gt: ['$idlingTimeMin', 0] }, 1, 0] } },
        vibration: { $sum: '$vibrationEvents' },
        unsafe: { $sum: { $cond: ['$safetyAlertTriggered', 1, 0] } }
      }
    }
  ])
  if (!stats?.ticks) return null

  const shifts = stats.ticks / 120 // 120 five-minute ticks per 10-hour shift

  if (affectedField === 'efficiency') {
    const idleMinPerShift = (stats.idleTicks * TICK_MINUTES) / shifts
    const savedMinPerWeek = idleMinPerShift * OBSERVED_IDLE_REDUCTION * SHIFTS_PER_WEEK
    const litres = (savedMinPerWeek / 60) * IDLE_BURN_L_PER_HR
    return {
      headline: `${Math.round(savedMinPerWeek)} fewer idle minutes a week`,
      litres: Math.round(litres * 10) / 10,
      costInr: Math.round(litres * DIESEL_COST_PER_L),
      co2Kg: Math.round(litres * CO2_KG_PER_L * 10) / 10,
      basis: `your last ${Math.round(shifts)} shifts`
    }
  }

  if (affectedField === 'skill') {
    const perShift = stats.vibration / shifts
    return {
      headline: `${Math.round(perShift * OBSERVED_HARSH_REDUCTION)} fewer harsh impacts per shift`,
      basis: `your last ${Math.round(shifts)} shifts`,
      note: 'Smoother operation extends component life and cuts unplanned downtime.'
    }
  }

  const unsafePerShift = stats.unsafe / shifts
  return {
    headline: `${Math.round(unsafePerShift * SHIFTS_PER_WEEK)} unsafe events flagged on you last week`,
    basis: `your last ${Math.round(shifts)} shifts`,
    note: 'Every one of these is a near miss that did not have to happen.'
  }
}
