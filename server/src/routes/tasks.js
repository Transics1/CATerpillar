import { Router } from 'express'
import { Task, Operator } from '../models/index.js'
import { requireAuth } from '../middleware/auth.js'
import { predictTaskTime } from '../services/predict.js'

const router = Router()

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * The seeded dataset is 60 days of history, all completed. A shift needs pending work, so the
 * first call of the day promotes a few historical tasks into today. Idempotent: subsequent
 * calls return what already exists.
 */
async function ensureTodaysTasks(operatorId) {
  const today = startOfToday()
  const existing = await Task.find({ operatorId, scheduledDate: { $gte: today } }).lean()
  if (existing.length) return existing

  const source = await Task.find({ operatorId, status: 'done' })
    .sort({ scheduledDate: -1 })
    .limit(4)
    .lean()
  if (!source.length) return []

  const periods = ['morning', 'morning', 'afternoon', 'afternoon']
  const created = source.map((t, i) => ({
    ...t,
    _id: undefined,
    taskId: `TD${today.getTime().toString(36)}${i}`,
    scheduledDate: today,
    shiftPeriod: periods[i] ?? 'afternoon',
    status: 'pending',
    actualTimeMin: undefined,
    startedAt: undefined,
    completedAt: undefined
  }))
  await Task.insertMany(created)
  return created
}

/**
 * Ordering heuristic: demanding work early, while alertness is highest and before the
 * afternoon heat. Explainable on purpose - the operator sees why their day is in this order,
 * which is the difference between a plan and a list.
 */
function orderTasks(tasks) {
  const periodRank = { morning: 0, afternoon: 1, night: 2 }
  return [...tasks]
    .sort((a, b) => {
      const p = (periodRank[a.shiftPeriod] ?? 1) - (periodRank[b.shiftPeriod] ?? 1)
      if (p !== 0) return p
      return (b.prediction?.p50 ?? 0) - (a.prediction?.p50 ?? 0)
    })
    .map((t, i) => ({
      ...t,
      order: i + 1,
      whyOrdered:
        i === 0
          ? 'Longest job first, while you are freshest'
          : t.shiftPeriod === 'afternoon'
            ? 'Scheduled for the afternoon block'
            : 'Fits the morning window'
    }))
}

router.get('/today', requireAuth, async (req, res) => {
  const operatorId = req.query.operatorId || req.operatorId
  const operator = await Operator.findOne({ operatorId }).lean()
  const tasks = await ensureTodaysTasks(operatorId)

  const withPredictions = await Promise.all(
    tasks.map(async (t) => ({
      ...t,
      prediction: await predictTaskTime({
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
    }))
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
  res.json({ taskId: task.taskId, startedAt: task.startedAt })
})

router.post('/:taskId/complete', requireAuth, async (req, res) => {
  const { actualTimeMin } = req.body
  const task = await Task.findOneAndUpdate(
    { taskId: req.params.taskId },
    { status: 'done', completedAt: new Date(), actualTimeMin },
    { new: true }
  ).lean()
  if (!task) return res.status(404).json({ error: 'not found' })
  res.json({ task })
})

export default router
