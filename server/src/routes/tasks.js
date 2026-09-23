import { Router } from 'express'
import { Task, Operator } from '../models/index.js'
import { requireAuth } from '../middleware/auth.js'
import { predictTaskTime } from '../services/predict.js'
import { ensureTodaysTasks } from '../services/roster.js'
import { startSession, stopSession, getPace } from '../services/simulator.js'
import { personalise } from '../services/personalisation.js'

const router = Router()

/**
 * Ordering heuristic: demanding work early, while alertness is highest and before the
 * afternoon heat. Explainable on purpose - the operator sees why their day is in this order,
 * which is the difference between a plan and a list.
 */
function orderTasks(tasks) {
  const periodRank = { morning: 0, afternoon: 1, night: 2 }
  const sorted = [...tasks].sort((a, b) => {
    const p = (periodRank[a.shiftPeriod] ?? 1) - (periodRank[b.shiftPeriod] ?? 1)
    if (p !== 0) return p
    return (b.prediction?.p50 ?? 0) - (a.prediction?.p50 ?? 0)
  })

  // Labels are derived from the actual comparison rather than from position. Sorting is
  // period-first, so "longest job first" was false whenever an afternoon task ran longer than
  // every morning one - the operator would see the claim contradicted by the numbers below it.
  const longestInPeriod = {}
  for (const t of sorted) {
    const cur = longestInPeriod[t.shiftPeriod]
    if (!cur || (t.prediction?.p50 ?? 0) > (cur.prediction?.p50 ?? 0)) longestInPeriod[t.shiftPeriod] = t
  }

  return sorted.map((t, i) => {
    const isLongest = longestInPeriod[t.shiftPeriod]?.taskId === t.taskId
    let whyOrdered
    if (isLongest && t.shiftPeriod === 'morning') {
      whyOrdered = 'Heaviest morning job, scheduled while you are freshest'
    } else if (isLongest) {
      whyOrdered = `Heaviest job in the ${t.shiftPeriod} block`
    } else {
      whyOrdered = `Fits the ${t.shiftPeriod} window`
    }
    return { ...t, order: i + 1, whyOrdered }
  })
}

router.get('/today', requireAuth, async (req, res) => {
  const operatorId = req.query.operatorId || req.operatorId
  const operator = await Operator.findOne({ operatorId }).lean()
  const tasks = await ensureTodaysTasks(operatorId)

  const withPredictions = await Promise.all(
    tasks.map(async (t) => {
      const base = await predictTaskTime({
        taskType: t.taskType,
        weather: t.weather,
        operatorSkill: operator?.skillLevel || t.operatorSkill,
        terrainType: t.terrainType,
        shiftPeriod: t.shiftPeriod,
        machineAgeYrs: t.machineAgeYrs,
        targetVolumeM3: t.targetVolumeM3,
        terrainSlope: t.terrainSlope,
        ambientTempC: t.ambientTempC
      })
      // Scale by how this operator is currently performing, so a completed lesson visibly
      // moves tomorrow's estimate.
      return { ...t, prediction: personalise(base, operator?.dnaScore) }
    })
  )

  res.json({ tasks: orderTasks(withPredictions) })
})

router.get('/:taskId', requireAuth, async (req, res) => {
  const task = await Task.findOne({ taskId: req.params.taskId }).lean()
  if (!task) return res.status(404).json({ error: 'not found' })
  res.json({ task })
})

router.post('/:taskId/start', requireAuth, async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { taskId: req.params.taskId },
    { status: 'active', startedAt: new Date() },
    { new: true }
  ).lean()
  if (!task) return res.status(404).json({ error: 'not found' })

  // Pace is judged against the estimate the operator was actually shown on the card - the
  // model's P50 with their personal factor applied - not the planner's naive estimatedTimeMin
  // and not the unpersonalised prediction. Measuring against a number nobody saw makes every
  // variance reading meaningless.
  const operator = await Operator.findOne({ operatorId: task.operatorId }).lean()
  const base = await predictTaskTime({
    taskType: task.taskType,
    weather: task.weather,
    operatorSkill: task.operatorSkill,
    terrainType: task.terrainType,
    shiftPeriod: task.shiftPeriod,
    machineAgeYrs: task.machineAgeYrs,
    targetVolumeM3: task.targetVolumeM3,
    terrainSlope: task.terrainSlope,
    ambientTempC: task.ambientTempC
  })
  const prediction = personalise(base, operator?.dnaScore)

  const initial = await startSession({
    task: { ...task, predictedMin: prediction.p50 },
    io: req.app.get('io')
  })
  res.json({ taskId: task.taskId, startedAt: task.startedAt, pace: initial })
})

router.get('/:taskId/pace', requireAuth, async (req, res) => {
  const pace = getPace(req.params.taskId)
  if (!pace) return res.status(404).json({ error: 'no active session' })
  res.json({ pace })
})

router.post('/:taskId/complete', requireAuth, async (req, res) => {
  const final = stopSession(req.params.taskId)
  const task = await Task.findOneAndUpdate(
    { taskId: req.params.taskId },
    {
      status: 'done',
      completedAt: new Date(),
      actualTimeMin: req.body.actualTimeMin ?? final?.elapsedMin,
      idleMin: final?.idleMin ?? 0,
      idleCostInr: final?.idleCostInr ?? 0,
      idleCo2Kg: final?.idleCo2Kg ?? 0,
      cyclesDone: final?.cyclesDone ?? 0
    },
    { new: true }
  ).lean()
  if (!task) return res.status(404).json({ error: 'not found' })
  res.json({ task, summary: final })
})

export default router
