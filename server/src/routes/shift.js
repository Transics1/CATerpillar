import { Router } from 'express'
import { Shift, Task, Operator, Machine, Lesson, Anomaly } from '../models/index.js'
import { requireAuth } from '../middleware/auth.js'
import { personalFactor } from '../services/personalisation.js'

const router = Router()

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Pre-start walkaround. This mirrors the daily inspection operators already do on paper
 * (DVIR-style) rather than inventing a checklist - the items are the ones that actually
 * ground a machine if they fail.
 */
const COMMON_CHECKS = [
  'Engine oil and coolant level',
  'Visible leaks under the machine',
  'Cab glass, mirrors and horn',
  'Lights and beacons'
]
const TYPE_CHECKS = {
  EXC: ['Track tension and undercarriage', 'Hydraulic hoses and cylinders', 'Bucket teeth and pins'],
  LOAD: ['Tyre condition and pressure', 'Bucket edge and linkage', 'Articulation joint'],
  DOZ: ['Track and idler wear', 'Blade and push arms', 'Ripper shanks'],
  GRD: ['Moldboard and circle', 'Tyre condition', 'Scarifier teeth']
}

function checklistFor(machineType) {
  return [...(TYPE_CHECKS[machineType] ?? []), ...COMMON_CHECKS]
}

router.get('/today', requireAuth, async (req, res) => {
  const shift = await Shift.findOne({
    operatorId: req.operatorId,
    startedAt: { $gte: startOfToday() }
  }).lean()
  res.json({ shift: shift ?? null })
})

router.post('/start', requireAuth, async (req, res) => {
  const { machineId } = req.body

  const existing = await Shift.findOne({
    operatorId: req.operatorId,
    startedAt: { $gte: startOfToday() }
  }).lean()
  if (existing) return res.json({ shift: existing, checklist: existing.checklist })

  // Default to the machine on the operator's first task today.
  let machine = machineId
  if (!machine) {
    const first = await Task.findOne({
      operatorId: req.operatorId,
      scheduledDate: { $gte: startOfToday() }
    }).lean()
    machine = first?.machineId
  }
  const machineDoc = machine ? await Machine.findOne({ machineId: machine }).lean() : null

  const shift = await Shift.create({
    shiftId: `SH-${req.operatorId}-${Date.now().toString(36)}`,
    operatorId: req.operatorId,
    machineId: machine,
    startedAt: new Date(),
    checklist: checklistFor(machineDoc?.machineType).map((item) => ({ item, passed: false })),
    seatbeltConfirmed: false
  })

  res.json({ shift: shift.toObject(), machine: machineDoc })
})

router.post('/checklist', requireAuth, async (req, res) => {
  const { shiftId, items = [], seatbeltConfirmed = false, photoUrl } = req.body

  const shift = await Shift.findOneAndUpdate(
    { shiftId, operatorId: req.operatorId },
    { checklist: items, seatbeltConfirmed, checklistPhotoUrl: photoUrl },
    { new: true }
  ).lean()
  if (!shift) return res.status(404).json({ error: 'shift not found' })

  // The gate is explicit: a failed item or an unconfirmed restraint blocks task start. A
  // checklist that cannot stop you is a form, not a safety control.
  const failed = items.filter((i) => !i.passed).map((i) => i.item)
  const blockers = [...failed]
  if (!seatbeltConfirmed) blockers.push('Seat restraint not confirmed')

  res.json({ shift, passed: blockers.length === 0, blockers })
})

/** End-of-shift report. Where the loop closes for the operator. */
router.get('/report', requireAuth, async (req, res) => {
  const today = startOfToday()

  const [operator, tasks, shift] = await Promise.all([
    Operator.findOne({ operatorId: req.operatorId }, '-pinHash').lean(),
    Task.find({ operatorId: req.operatorId, scheduledDate: { $gte: today } }).lean(),
    Shift.findOne({ operatorId: req.operatorId, startedAt: { $gte: today } }).lean()
  ])
  if (!operator) return res.status(404).json({ error: 'operator not found' })

  const done = tasks.filter((t) => t.status === 'done')
  const completedToday = (operator.completedLessons ?? []).filter(
    (c) => new Date(c.completedAt) >= today
  )
  const lessonDocs = await Lesson.find({
    lessonId: { $in: completedToday.map((c) => c.lessonId) }
  }).lean()

  const anomalies = await Anomaly.find({
    operatorId: req.operatorId,
    detectedAt: { $gte: today }
  }).lean()

  // DNA at the start of today vs now.
  const history = operator.dnaHistory ?? []
  const firstToday = history.find((h) => new Date(h.date) >= today)
  const dnaBefore = firstToday ?? history[history.length - 1] ?? operator.dnaScore
  const dnaAfter = operator.dnaScore

  const factorBefore = personalFactor(dnaBefore)
  const factorAfter = personalFactor(dnaAfter)

  res.json({
    shiftId: shift?.shiftId ?? null,
    operator: { name: operator.name, operatorId: operator.operatorId },
    tasksCompleted: done.length,
    tasksPlanned: tasks.length,
    cyclesDone: done.reduce((s, t) => s + (t.cyclesDone ?? 0), 0),
    idleMin: done.reduce((s, t) => s + (t.idleMin ?? 0), 0),
    idleCostInr: done.reduce((s, t) => s + (t.idleCostInr ?? 0), 0),
    idleCo2Kg: Math.round(done.reduce((s, t) => s + (t.idleCo2Kg ?? 0), 0) * 10) / 10,
    anomalies: anomalies.map((a) => ({ type: a.type, severity: a.severity })),
    lessonsCompleted: lessonDocs.map((l) => ({ lessonId: l.lessonId, title: l.title })),
    dnaBefore,
    dnaAfter,
    // What today's coaching buys on tomorrow's work.
    tomorrowEtaShiftPct: Math.round((factorAfter / factorBefore - 1) * 1000) / 10
  })
})

export default router
