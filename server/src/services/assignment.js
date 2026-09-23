import { Operator, Task, Machine } from '../models/index.js'

const SHIFT_MINUTES = 480

const SKILL_FIT = { Expert: 1.0, Intermediate: 0.8, Beginner: 0.55 }

// Tasks that genuinely punish inexperience. A beginner on a demolition job is a different
// proposition from a beginner moving material, and the ranking should say so.
const DEMANDING_TASKS = new Set(['Demolition', 'Earth Excavation'])

const CERT_FOR_TYPE = { EXC: 'Excavator-L1', LOAD: 'Loader-L1', DOZ: 'Dozer-L1' }

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Ranks available operators to take over a task.
 *
 * The score is a weighted blend of four signals, and every candidate carries the reasons that
 * produced it. A supervisor reassigning work under pressure needs to see why the system is
 * recommending someone, not just a sorted list - an unexplained ranking is one they will
 * override on instinct, which defeats the point.
 */
export async function rankCandidates(task, { limit = 5 } = {}) {
  const today = startOfToday()

  const operators = await Operator.find({ role: 'operator', available: true }).lean()
  const eligible = operators.filter((o) => o.operatorId !== task.operatorId)

  // Current load and machine-type familiarity, in two queries rather than per candidate.
  const loads = await Task.aggregate([
    { $match: { scheduledDate: { $gte: today }, status: { $in: ['pending', 'active'] } } },
    { $group: { _id: '$operatorId', minutes: { $sum: '$estimatedTimeMin' }, count: { $sum: 1 } } }
  ])
  const loadBy = Object.fromEntries(loads.map((l) => [l._id, l]))

  const history = await Task.aggregate([
    { $match: { status: 'done' } },
    { $group: { _id: { op: '$operatorId', type: '$machineType' }, n: { $sum: 1 } } }
  ])
  const historyBy = {}
  for (const h of history) {
    historyBy[h._id.op] ??= { total: 0, byType: {} }
    historyBy[h._id.op].total += h.n
    historyBy[h._id.op].byType[h._id.type] = h.n
  }

  const scored = eligible.map((o) => {
    const reasons = []

    const dnaNorm = (o.dnaScore?.overall ?? 70) / 100

    let skillFit = SKILL_FIT[o.skillLevel] ?? 0.7
    if (DEMANDING_TASKS.has(task.taskType) && o.skillLevel === 'Beginner') skillFit *= 0.6

    // Certification for the machine type is close to a hard requirement in real operations -
    // you do not put an uncertified operator on a loader. Treating it as a small bonus ranked
    // a certified operator with 28 loader jobs BELOW an uncertified one, which is the wrong
    // answer for a supervisor to be handed.
    const requiredCert = CERT_FOR_TYPE[task.machineType]
    const certified = requiredCert ? o.certifications?.includes(requiredCert) : true
    if (requiredCert) {
      if (certified) reasons.push(`Certified ${requiredCert}`)
      else skillFit *= 0.55
    }

    const load = loadBy[o.operatorId]
    const assignedMin = load?.minutes ?? 0
    const loadHeadroom = 1 - Math.min(1, assignedMin / SHIFT_MINUTES)

    const hist = historyBy[o.operatorId]
    const onType = hist?.byType?.[task.machineType] ?? 0
    const familiarity = hist?.total ? Math.min(1, onType / Math.max(1, hist.total * 0.4)) : 0

    // Can they do THIS job well (skill + certification + familiarity) is weighted above their
    // general track record. DNA says who is a good operator; the rest says who suits this task.
    const score = 0.3 * skillFit + 0.25 * dnaNorm + 0.25 * loadHeadroom + 0.2 * familiarity

    if (requiredCert && !certified) reasons.push(`Not certified ${requiredCert}`)
    if (onType >= 15) reasons.push(`${onType} past ${task.machineType} jobs`)
    if (o.skillLevel === 'Expert') reasons.push('Expert level')
    if ((o.dnaScore?.overall ?? 0) >= 90) reasons.push(`DNA ${o.dnaScore.overall}`)
    if (assignedMin === 0) reasons.push('No work assigned yet')
    else reasons.push(`${Math.round(assignedMin)} min already booked`)
    if (DEMANDING_TASKS.has(task.taskType) && o.skillLevel === 'Beginner') {
      reasons.push(`Beginner on a ${task.taskType.toLowerCase()} job`)
    }

    return {
      operatorId: o.operatorId,
      name: o.name,
      skillLevel: o.skillLevel,
      dna: o.dnaScore?.overall ?? null,
      assignedMin: Math.round(assignedMin),
      assignedCount: load?.count ?? 0,
      familiarJobs: onType,
      score: Math.round(score * 1000) / 10,
      reasons: reasons.slice(0, 3)
    }
  })

  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}

/**
 * Machines of the same type that are up and carrying the least work today.
 */
export async function rankMachineAlternatives(task, { limit = 5 } = {}) {
  const today = startOfToday()

  const machines = await Machine.find({
    machineType: task.machineType,
    available: true,
    machineId: { $ne: task.machineId }
  }).lean()

  const loads = await Task.aggregate([
    { $match: { scheduledDate: { $gte: today }, status: { $in: ['pending', 'active'] } } },
    { $group: { _id: '$machineId', minutes: { $sum: '$estimatedTimeMin' }, count: { $sum: 1 } } }
  ])
  const loadBy = Object.fromEntries(loads.map((l) => [l._id, l]))

  return machines
    .map((m) => {
      const assignedMin = loadBy[m.machineId]?.minutes ?? 0
      const headroom = 1 - Math.min(1, assignedMin / SHIFT_MINUTES)
      // Newer machines score slightly better; age drives both breakdown risk and task time.
      const ageScore = 1 - Math.min(1, (m.ageYears ?? 3) / 10)
      return {
        machineId: m.machineId,
        model: m.model,
        ageYears: m.ageYears,
        assignedMin: Math.round(assignedMin),
        score: Math.round((0.7 * headroom + 0.3 * ageScore) * 1000) / 10,
        reasons: [
          assignedMin === 0 ? 'Idle today' : `${Math.round(assignedMin)} min booked`,
          `${m.ageYears} yr old`
        ]
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
