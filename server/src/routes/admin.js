import { Router } from 'express'
import { Operator, Machine, Task } from '../models/index.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { rankCandidates, rankMachineAlternatives } from '../services/assignment.js'

const router = Router()
router.use(requireAuth, requireRole('supervisor'))

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Everything the supervisor needs for the day in one payload. */
router.get('/board', async (_req, res) => {
  const today = startOfToday()

  const [tasks, operators, machines] = await Promise.all([
    Task.find({ scheduledDate: { $gte: today } }).lean(),
    Operator.find({ role: 'operator' }, '-pinHash').lean(),
    Machine.find().lean()
  ])

  const tasksByOperator = {}
  for (const t of tasks) {
    tasksByOperator[t.operatorId] ??= []
    tasksByOperator[t.operatorId].push(t)
  }

  const roster = operators
    .map((o) => {
      const assigned = tasksByOperator[o.operatorId] ?? []
      return {
        operatorId: o.operatorId,
        name: o.name,
        skillLevel: o.skillLevel,
        dna: o.dnaScore?.overall ?? null,
        available: o.available !== false,
        unavailability: o.unavailability,
        tasks: assigned.map((t) => ({
          taskId: t.taskId,
          taskType: t.taskType,
          machineId: t.machineId,
          machineType: t.machineType,
          shiftPeriod: t.shiftPeriod,
          estimatedTimeMin: t.estimatedTimeMin,
          status: t.status
        })),
        loadMin: Math.round(assigned.reduce((s, t) => s + (t.estimatedTimeMin ?? 0), 0))
      }
    })
    // Unavailable operators who still hold work float to the top - that is the supervisor's
    // actual problem, and it should not need hunting for.
    .sort((a, b) => {
      const aUrgent = !a.available && a.tasks.length > 0
      const bUrgent = !b.available && b.tasks.length > 0
      if (aUrgent !== bUrgent) return aUrgent ? -1 : 1
      return b.loadMin - a.loadMin
    })

  const downMachines = machines.filter((m) => m.available === false)
  const strandedTasks = tasks.filter(
    (t) => downMachines.some((m) => m.machineId === t.machineId) && t.status !== 'done'
  )

  res.json({
    date: today,
    roster,
    machines: machines.map((m) => ({
      machineId: m.machineId,
      machineType: m.machineType,
      model: m.model,
      ageYears: m.ageYears,
      available: m.available !== false,
      fault: m.fault
    })),
    summary: {
      totalTasks: tasks.length,
      operatorsOut: operators.filter((o) => o.available === false).length,
      machinesDown: downMachines.length,
      // Work that cannot currently be done: its operator is out or its machine is down.
      tasksNeedingAction:
        strandedTasks.length +
        tasks.filter(
          (t) =>
            t.status !== 'done' &&
            operators.some((o) => o.operatorId === t.operatorId && o.available === false)
        ).length
    }
  })
})

router.post('/operators/:operatorId/availability', async (req, res) => {
  const { available, reason, note } = req.body
  const operator = await Operator.findOneAndUpdate(
    { operatorId: req.params.operatorId },
    available
      ? { available: true, $unset: { unavailability: 1 } }
      : { available: false, unavailability: { reason: reason || 'unavailable', since: new Date(), note } },
    { new: true, projection: '-pinHash' }
  ).lean()
  if (!operator) return res.status(404).json({ error: 'operator not found' })

  const affected = available
    ? []
    : await Task.find({
        operatorId: operator.operatorId,
        scheduledDate: { $gte: startOfToday() },
        status: { $ne: 'done' }
      }).lean()

  res.json({ operator, affectedTasks: affected })
})

router.post('/machines/:machineId/availability', async (req, res) => {
  const { available, reason, note } = req.body
  const machine = await Machine.findOneAndUpdate(
    { machineId: req.params.machineId },
    available
      ? { available: true, status: 'idle', $unset: { fault: 1 } }
      : { available: false, status: 'maintenance', fault: { reason: reason || 'fault', since: new Date(), note } },
    { new: true }
  ).lean()
  if (!machine) return res.status(404).json({ error: 'machine not found' })

  const affected = available
    ? []
    : await Task.find({
        machineId: machine.machineId,
        scheduledDate: { $gte: startOfToday() },
        status: { $ne: 'done' }
      }).lean()

  res.json({ machine, affectedTasks: affected })
})

/** Ranked replacement operators and machines for one task. */
router.get('/tasks/:taskId/candidates', async (req, res) => {
  const task = await Task.findOne({ taskId: req.params.taskId }).lean()
  if (!task) return res.status(404).json({ error: 'task not found' })

  const [operators, machines] = await Promise.all([
    rankCandidates(task),
    rankMachineAlternatives(task)
  ])
  res.json({ task, operators, machines })
})

router.post('/tasks/:taskId/reassign', async (req, res) => {
  const { operatorId, machineId } = req.body
  if (!operatorId && !machineId) {
    return res.status(400).json({ error: 'operatorId or machineId required' })
  }

  const update = {}
  if (operatorId) {
    const target = await Operator.findOne({ operatorId }).lean()
    if (!target) return res.status(404).json({ error: 'target operator not found' })
    if (target.available === false) {
      return res.status(409).json({ error: `${target.name} is also marked unavailable` })
    }
    update.operatorId = operatorId
    update.operatorSkill = target.skillLevel
  }
  if (machineId) {
    const target = await Machine.findOne({ machineId }).lean()
    if (!target) return res.status(404).json({ error: 'target machine not found' })
    if (target.available === false) {
      return res.status(409).json({ error: `${target.machineId} is also out of service` })
    }
    update.machineId = machineId
    update.machineAgeYrs = target.ageYears
  }

  const task = await Task.findOneAndUpdate({ taskId: req.params.taskId }, update, { new: true }).lean()
  if (!task) return res.status(404).json({ error: 'task not found' })

  req.app.get('io')?.to(`operator:${task.operatorId}`).emit('task:reassigned', { task })
  res.json({ task })
})

export default router
