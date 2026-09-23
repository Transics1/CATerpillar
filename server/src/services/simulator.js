import { Telemetry } from '../models/index.js'
import { evaluateWindow } from './anomalyEngine.js'

/**
 * Replays seeded telemetry for a machine as a live stream while a task is running.
 *
 * The numbers on the operator's screen are real rows from the dataset the models were trained
 * on, not values invented in the browser - so the pace tracker, the idle meter and (next) the
 * anomaly engine all see the same thing.
 */

// One tick is 5 simulated minutes. At 1.5s per tick a 50-minute task plays in ~15 seconds,
// which is the right length for a live demo beat.
const TICK_MS = Number(process.env.SIM_TICK_MS || 1500)
const SIM_MINUTES_PER_TICK = 5

// Idle cost model. Sources: a mid-size excavator burns ~4.5 L/hr at idle; diesel is priced in
// INR; 2.68 kg CO2 per litre is the standard combustion factor.
export const IDLE_BURN_L_PER_HR = 4.5
export const DIESEL_COST_PER_L = 90
export const CO2_KG_PER_L = 2.68

// Fallback when a machine has no replay history to measure a rate from.
const DEFAULT_CYCLES_PER_TICK = 4.5

const sessions = new Map() // taskId -> session

/** Current pace summary for a running task, or null if nothing is running. */
export function getPace(taskId) {
  const s = sessions.get(taskId)
  return s ? summarise(s) : null
}

/** Raw session, including the rolling telemetry window the anomaly engine scores. */
export function getSession(taskId) {
  return sessions.get(taskId)
}

function summarise(s) {
  const elapsedMin = s.tickIndex * SIM_MINUTES_PER_TICK
  const progressPct = s.cyclesTarget ? Math.min(100, (s.cyclesDone / s.cyclesTarget) * 100) : 0

  // Re-estimate from observed pace rather than the original prediction. Early on there is not
  // enough signal, so hold the original estimate until a few cycles are in.
  let revisedEtaMin = s.estimateMin
  if (s.cyclesDone >= 3 && elapsedMin > 0) {
    const minutesPerCycle = elapsedMin / s.cyclesDone
    revisedEtaMin = Math.round(minutesPerCycle * s.cyclesTarget)
  }

  const varianceMin = Math.round(revisedEtaMin - s.estimateMin)
  const state = varianceMin > 5 ? 'behind' : varianceMin < -5 ? 'ahead' : 'on-track'

  const idleFuelL = (s.idleMin / 60) * IDLE_BURN_L_PER_HR

  return {
    taskId: s.taskId,
    elapsedMin,
    cyclesDone: s.cyclesDone,
    cyclesTarget: s.cyclesTarget,
    progressPct: Math.round(progressPct),
    estimateMin: s.estimateMin,
    revisedEtaMin,
    varianceMin,
    state,
    idleMin: s.idleMin,
    idleStreakMin: s.idleStreakMin,
    idleFuelL: Math.round(idleFuelL * 100) / 100,
    idleCostInr: Math.round(idleFuelL * DIESEL_COST_PER_L),
    idleCo2Kg: Math.round(idleFuelL * CO2_KG_PER_L * 10) / 10,
    fuelUsedL: Math.round(s.fuelUsedL * 10) / 10,
    done: s.done
  }
}

export async function startSession({ task, io }) {
  stopSession(task.taskId)

  // Most recent full shift for this machine, replayed from the start.
  const rows = await Telemetry.find({ 'meta.machineId': task.machineId })
    .sort({ timestamp: -1 })
    .limit(120)
    .lean()
  rows.reverse()

  const estimateMin = Math.round(task.predictedMin || task.estimatedTimeMin || 45)

  // Cycle target is derived from THIS machine's observed cycle rate against the predicted
  // duration, so working at the historical rate finishes exactly on the estimate and any
  // variance the tracker reports is real.
  //
  // Deriving it from bucket volume instead put the target at 48 cycles (~80 min) against a
  // 132-min prediction, which pinned the tracker to "33 min ahead" for the entire task - a
  // pace tracker that always says the same thing is worse than no pace tracker.
  const observedCyclesPerTick = rows.length
    ? rows.reduce((sum, r) => sum + (r.loadCycles ?? 0), 0) / rows.length
    : DEFAULT_CYCLES_PER_TICK
  const cyclesTarget = Math.max(
    5,
    Math.round((estimateMin / SIM_MINUTES_PER_TICK) * (observedCyclesPerTick || DEFAULT_CYCLES_PER_TICK))
  )

  const session = {
    taskId: task.taskId,
    operatorId: task.operatorId,
    machineId: task.machineId,
    rows,
    tickIndex: 0,
    cyclesDone: 0,
    idleMin: 0,
    idleStreakMin: 0,
    fuelUsedL: 0,
    cyclesTarget,
    estimateMin,
    done: false,
    recent: []
  }

  session.timer = setInterval(() => {
    const row = session.rows[session.tickIndex % session.rows.length]
    session.tickIndex += 1

    const idle = (row?.idlingTimeMin ?? 0) > 0
    session.cyclesDone += row?.loadCycles ?? 0
    session.fuelUsedL += row?.fuelUsedL ?? 0
    if (idle) {
      session.idleMin += SIM_MINUTES_PER_TICK
      session.idleStreakMin += SIM_MINUTES_PER_TICK
    } else {
      session.idleStreakMin = 0
    }

    // Keep a rolling window for the anomaly engine to score.
    session.recent.push(row)
    if (session.recent.length > 6) session.recent.shift()

    if (session.cyclesDone >= session.cyclesTarget) session.done = true

    // Score the rolling window. Fire-and-forget so a slow model call never stalls the stream.
    evaluateWindow(session, io).catch(() => {})

    const room = `operator:${session.operatorId}`
    io.to(room).emit('telemetry:tick', {
      taskId: session.taskId,
      machineId: session.machineId,
      idle,
      loadCycles: row?.loadCycles ?? 0,
      fuelUsedL: row?.fuelUsedL ?? 0,
      engineTempC: row?.engineTempC,
      seatbeltStatus: row?.seatbeltStatus,
      nearestPersonnelM: row?.nearestPersonnelM,
      vibrationEvents: row?.vibrationEvents
    })
    io.to(room).emit('pace:update', summarise(session))

    if (session.done) stopSession(session.taskId)
  }, TICK_MS)

  sessions.set(task.taskId, session)
  return summarise(session)
}

export function stopSession(taskId) {
  const s = sessions.get(taskId)
  if (!s) return null
  clearInterval(s.timer)
  s.done = true
  const final = summarise(s)
  sessions.delete(taskId)
  return final
}
