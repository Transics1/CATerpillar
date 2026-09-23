import { Telemetry } from '../models/index.js'
import { evaluateWindow } from './anomalyEngine.js'

// Replays a machine's seeded telemetry as a live stream for the duration of a task, so the
// pace tracker, idle meter and anomaly engine all read the same rows the models trained on.

const TICK_MS = Number(process.env.SIM_TICK_MS || 1500)
const SIM_MINUTES_PER_TICK = 5

// Mid-size excavator at idle; INR per litre; standard diesel combustion factor.
export const IDLE_BURN_L_PER_HR = 4.5
export const DIESEL_COST_PER_L = 90
export const CO2_KG_PER_L = 2.68

const DEFAULT_CYCLES_PER_TICK = 4.5

const sessions = new Map() // taskId -> session

export function getPace(taskId) {
  const s = sessions.get(taskId)
  return s ? summarise(s) : null
}

export function getSession(taskId) {
  return sessions.get(taskId)
}

function summarise(s) {
  const elapsedMin = s.tickIndex * SIM_MINUTES_PER_TICK
  const progressPct = s.cyclesTarget ? Math.min(100, (s.cyclesDone / s.cyclesTarget) * 100) : 0

  // Hold the original estimate until there are enough cycles to infer a rate.
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

  // Target comes from this machine's observed cycle rate against the predicted duration, so
  // working at the historical rate lands exactly on the estimate and reported variance is real.
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

    session.recent.push(row)
    if (session.recent.length > 6) session.recent.shift()

    if (session.cyclesDone >= session.cyclesTarget) session.done = true

    // Fire-and-forget: a slow model call must not stall the stream.
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
