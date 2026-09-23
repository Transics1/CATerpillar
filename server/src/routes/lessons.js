import { Router } from 'express'
import { Lesson, Operator, Anomaly } from '../models/index.js'
import { requireAuth } from '../middleware/auth.js'
import { personalFactor } from '../services/personalisation.js'
import { projectLessonImpact } from '../services/impact.js'

const router = Router()

// A lesson lifts the sub-score its anomaly maps to: idling moves efficiency, not safety.
const LESSON_AFFECTS = {
  EXCESSIVE_IDLE: 'efficiency',
  FUEL_ANOMALY: 'efficiency',
  SEATBELT_VIOLATION: 'safety',
  PROXIMITY_BREACH: 'safety',
  OVERHEAT: 'safety',
  HARSH_OPERATION: 'skill'
}
const BUMP = 3

router.get('/', requireAuth, async (req, res) => {
  const operator = await Operator.findOne({ operatorId: req.operatorId }, '-pinHash').lean()
  if (!operator) return res.status(404).json({ error: 'not found' })

  const all = await Lesson.find().lean()
  const completedIds = new Set((operator.completedLessons ?? []).map((c) => c.lessonId))
  const assignedIds = new Set(operator.assignedLessons ?? [])

  // A generic lesson is training; one that cites what you did twenty minutes ago is coaching.
  const anomalies = await Anomaly.find({ operatorId: req.operatorId })
    .sort({ detectedAt: -1 })
    .limit(20)
    .lean()
  const reasonFor = {}
  for (const a of anomalies) {
    if (a.lessonAssigned && !reasonFor[a.lessonAssigned]) {
      reasonFor[a.lessonAssigned] = {
        type: a.type,
        evidence: a.evidence,
        detectedAt: a.detectedAt,
        machineId: a.machineId
      }
    }
  }

  const decorate = (l) => ({
    ...l,
    completed: completedIds.has(l.lessonId),
    reason: reasonFor[l.lessonId] ?? null
  })

  res.json({
    assigned: all.filter((l) => assignedIds.has(l.lessonId) && !completedIds.has(l.lessonId)).map(decorate),
    completed: all.filter((l) => completedIds.has(l.lessonId)).map(decorate),
    library: all.filter((l) => !assignedIds.has(l.lessonId) && !completedIds.has(l.lessonId)).map(decorate)
  })
})

router.post('/:lessonId/complete', requireAuth, async (req, res) => {
  const { quizScore = 100 } = req.body
  const lesson = await Lesson.findOne({ lessonId: req.params.lessonId }).lean()
  if (!lesson) return res.status(404).json({ error: 'lesson not found' })

  const operator = await Operator.findOne({ operatorId: req.operatorId })
  if (!operator) return res.status(404).json({ error: 'operator not found' })
  if ((operator.completedLessons ?? []).some((c) => c.lessonId === lesson.lessonId)) {
    return res.status(409).json({ error: 'already completed' })
  }

  const before = { ...operator.dnaScore.toObject?.() ?? operator.dnaScore }
  const field = LESSON_AFFECTS[lesson.forAnomalyType] ?? 'skill'

  const etaFactorBefore = personalFactor(before)
  const updated = { ...before, [field]: Math.min(100, (before[field] ?? 70) + BUMP) }
  updated.overall =
    Math.round((0.5 * updated.safety + 0.3 * updated.efficiency + 0.2 * updated.skill) * 10) / 10

  operator.dnaScore = updated
  operator.dnaHistory.push({ date: new Date(), ...updated })
  operator.completedLessons.push({ lessonId: lesson.lessonId, completedAt: new Date(), quizScore })
  operator.assignedLessons = (operator.assignedLessons ?? []).filter((id) => id !== lesson.lessonId)
  await operator.save()

  const etaFactorAfter = personalFactor(updated)
  const projection = await projectLessonImpact(req.operatorId, field)

  res.json({
    lessonId: lesson.lessonId,
    affected: field,
    dnaBefore: before,
    dnaAfter: updated,
    etaShiftPctPerTask: Math.round((etaFactorAfter / etaFactorBefore - 1) * 1000) / 10,
    projection
  })
})

export default router
