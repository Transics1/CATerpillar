import { Task, Operator } from '../models/index.js'

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

const PERIODS = ['morning', 'morning', 'afternoon', 'afternoon']

// The dataset is completed history; a shift needs pending work, so tasks are promoted into
// today. Idempotent.
export async function ensureTodaysTasks(operatorId) {
  const today = startOfToday()
  const existing = await Task.find({ operatorId, scheduledDate: { $gte: today } }).lean()
  if (existing.length) return existing

  const source = await Task.find({ operatorId, status: 'done' })
    .sort({ scheduledDate: -1 })
    .limit(4)
    .lean()
  if (!source.length) return []

  const created = source.map((t, i) => ({
    ...t,
    _id: undefined,
    taskId: `TD-${operatorId}-${today.getTime().toString(36)}-${i}`,
    scheduledDate: today,
    shiftPeriod: PERIODS[i] ?? 'afternoon',
    status: 'pending',
    actualTimeMin: undefined,
    startedAt: undefined,
    completedAt: undefined
  }))
  await Task.insertMany(created)
  return created
}

// Run at seed time so the supervisor board has a full day, not just operators who logged in.
export async function ensureTodaysTasksForAll() {
  const operators = await Operator.find({ role: 'operator' }, 'operatorId').lean()
  let total = 0
  for (const o of operators) {
    const tasks = await ensureTodaysTasks(o.operatorId)
    total += tasks.length
  }
  return total
}
