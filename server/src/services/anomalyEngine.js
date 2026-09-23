import { Anomaly, Lesson, Operator } from '../models/index.js'
import { scoreAnomaly } from './predict.js'

/**
 * Hybrid anomaly detection over a rolling 30-minute window.
 *
 * Two tiers on purpose. The explicit rules below catch the known failure modes and can state
 * exactly why they fired, which is what turns a detection into a coachable moment. The
 * IsolationForest runs alongside to catch combinations nobody wrote a rule for. A model-only
 * engine would flag things it cannot explain, and "something looks unusual" is not something
 * an operator can act on.
 *
 * Thresholds are tuned against the generated distributions - see BUILD_SPEC.md.
 */

const WINDOW_TICKS = 6 // 6 x 5 simulated minutes = 30 min

// Do not re-fire the same anomaly type for this many ticks. Without it a sustained idle
// stretch would assign the same lesson every tick and bury the operator in notifications.
const COOLDOWN_TICKS = 12

const RULES = [
  {
    type: 'EXCESSIVE_IDLE',
    severity: 'medium',
    test: (w) => w.idleRatio > 0.35,
    evidence: (w) => ({ idleRatio: Math.round(w.idleRatio * 100) / 100 }),
    message: (w) => `Idle ${Math.round(w.idleRatio * 100)}% of the last 30 minutes`
  },
  {
    type: 'SEATBELT_VIOLATION',
    severity: 'high',
    test: (w) => w.seatbeltViolations > 0 && w.maxRpm > 800,
    evidence: (w) => ({ violations: w.seatbeltViolations }),
    message: () => 'Operating with the restraint unfastened'
  },
  {
    type: 'HARSH_OPERATION',
    severity: 'medium',
    test: (w) => w.vibrationEvents > 14,
    evidence: (w) => ({ vibrationEvents: w.vibrationEvents }),
    message: (w) => `${w.vibrationEvents} harsh impacts in 30 minutes`
  },
  {
    type: 'PROXIMITY_BREACH',
    severity: 'high',
    test: (w) => w.minPersonnelM < 5 && w.maxSwingRate > 2,
    evidence: (w) => ({ nearestPersonnelM: w.minPersonnelM }),
    message: (w) => `Person within ${w.minPersonnelM} m while swinging`
  },
  {
    type: 'OVERHEAT',
    severity: 'high',
    test: (w) => w.maxEngineTemp > 105,
    evidence: (w) => ({ engineTempC: w.maxEngineTemp }),
    message: (w) => `Engine at ${w.maxEngineTemp} C`
  }
]

function summariseWindow(rows) {
  const n = rows.length || 1
  const idleTicks = rows.filter((r) => (r?.idlingTimeMin ?? 0) > 0).length
  const cycles = rows.reduce((s, r) => s + (r?.loadCycles ?? 0), 0)
  const fuel = rows.reduce((s, r) => s + (r?.fuelUsedL ?? 0), 0)

  return {
    idleRatio: idleTicks / n,
    vibrationEvents: rows.reduce((s, r) => s + (r?.vibrationEvents ?? 0), 0),
    fuelPerCycle: cycles ? fuel / cycles : fuel,
    maxEngineTemp: Math.max(...rows.map((r) => r?.engineTempC ?? 0)),
    seatbeltViolations: rows.filter((r) => r?.seatbeltStatus === 'Unfastened').length,
    minPersonnelM: Math.min(...rows.map((r) => r?.nearestPersonnelM ?? 999)),
    maxSwingRate: Math.max(...rows.map((r) => r?.swingRateDegSec ?? 0)),
    maxRpm: Math.max(...rows.map((r) => r?.rpm ?? 0)),
    cycleTimeStd: rows.reduce((s, r) => s + (r?.cycleTimeStdRolling ?? 0), 0) / n
  }
}

/**
 * Evaluates the session's rolling window and, on a detection, assigns the matching lesson.
 * This is the join between "we noticed something" and "here is what to do about it" - the
 * step that makes the five required outcomes one system rather than five screens.
 */
export async function evaluateWindow(session, io) {
  if (session.recent.length < WINDOW_TICKS) return null

  const w = summariseWindow(session.recent)
  session.cooldowns ??= {}

  const fired = RULES.find(
    (r) => r.test(w) && (session.cooldowns[r.type] ?? -Infinity) + COOLDOWN_TICKS < session.tickIndex
  )

  let detection = null
  if (fired) {
    detection = {
      type: fired.type,
      severity: fired.severity,
      evidence: fired.evidence(w),
      message: fired.message(w),
      source: 'rule'
    }
  } else if ((session.cooldowns.MODEL ?? -Infinity) + COOLDOWN_TICKS < session.tickIndex) {
    // Nothing matched a rule - ask the model whether this window is unusual anyway.
    const ml = await scoreAnomaly({
      idleRatio: w.idleRatio,
      vibrationEvents: w.vibrationEvents,
      fuelPerCycle: w.fuelPerCycle,
      maxEngineTemp: w.maxEngineTemp,
      seatbeltViolations: w.seatbeltViolations,
      minPersonnelM: w.minPersonnelM,
      maxSwingRate: w.maxSwingRate,
      cycleTimeStd: w.cycleTimeStd
    })
    if (ml.isAnomaly) {
      session.cooldowns.MODEL = session.tickIndex
      detection = {
        type: 'UNUSUAL_PATTERN',
        severity: 'low',
        evidence: { score: ml.score, drivers: ml.topFeatures },
        message: `Unusual combination: ${(ml.topFeatures || []).join(', ')}`,
        source: 'model'
      }
    }
  }

  if (!detection) return null
  if (fired) session.cooldowns[fired.type] = session.tickIndex

  const lesson = await Lesson.findOne({ forAnomalyType: detection.type }).lean()

  const anomaly = await Anomaly.create({
    anomalyId: `AN-${session.taskId}-${session.tickIndex}`,
    operatorId: session.operatorId,
    machineId: session.machineId,
    type: detection.type,
    severity: detection.severity,
    window: { from: new Date(Date.now() - 30 * 60000), to: new Date() },
    evidence: detection.evidence,
    lessonAssigned: lesson?.lessonId,
    source: detection.source
  })

  if (lesson) {
    await Operator.updateOne(
      { operatorId: session.operatorId },
      { $addToSet: { assignedLessons: lesson.lessonId } }
    )
  }

  const room = `operator:${session.operatorId}`
  io.to(room).emit('anomaly:detected', {
    anomalyId: anomaly.anomalyId,
    type: detection.type,
    severity: detection.severity,
    message: detection.message,
    evidence: detection.evidence,
    source: detection.source
  })
  if (lesson) {
    io.to(room).emit('lesson:assigned', {
      lessonId: lesson.lessonId,
      title: lesson.title,
      durationSec: lesson.durationSec,
      becauseOf: detection.type,
      becauseMessage: detection.message
    })
  }

  return { detection, lesson }
}
