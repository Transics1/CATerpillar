import { Router } from 'express'
import { Incident, Anomaly } from '../models/index.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

/**
 * Creates or replays an incident.
 *
 * Upserting on clientId is what makes the offline queue safe. The phone generates the id
 * before the report ever leaves the device, so a queue that flushes twice - a flaky
 * reconnect, a retried request, the user reopening the app mid-sync - converges on one
 * record instead of three.
 */
async function upsertIncident(operatorId, body) {
  const {
    clientId,
    machineId,
    type = 'observation',
    severity = 'medium',
    rawText,
    description,
    lat,
    lng,
    photoUrl,
    occurredAt,
    source = 'online'
  } = body

  if (!clientId) throw new Error('clientId is required')

  return Incident.findOneAndUpdate(
    { clientId },
    {
      $setOnInsert: {
        clientId,
        operatorId,
        machineId,
        type,
        severity,
        rawText,
        description: description || rawText,
        lat,
        lng,
        photoUrl,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
        source
      },
      $set: { syncedAt: new Date() }
    },
    { new: true, upsert: true }
  ).lean()
}

router.post('/', requireAuth, async (req, res) => {
  try {
    const incident = await upsertIncident(req.operatorId, req.body)
    req.app.get('io')?.emit('incident:logged', { incident })
    res.json({ incident })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.get('/', requireAuth, async (req, res) => {
  const filter = req.role === 'supervisor' ? {} : { operatorId: req.operatorId }
  const incidents = await Incident.find(filter).sort({ occurredAt: -1 }).limit(50).lean()
  res.json({ incidents })
})

/** Today's detections, so the Safety screen shows what the machine noticed too. */
router.get('/alerts', requireAuth, async (req, res) => {
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  const alerts = await Anomaly.find({ operatorId: req.operatorId, detectedAt: { $gte: since } })
    .sort({ detectedAt: -1 })
    .limit(30)
    .lean()
  res.json({ alerts })
})

/**
 * Flushes a queue of operations captured while offline. Each is applied independently so one
 * bad row cannot block the rest of the queue from syncing.
 */
router.post('/sync', requireAuth, async (req, res) => {
  const { operations = [] } = req.body
  const results = []

  for (const op of operations) {
    try {
      if (op.kind === 'incident') {
        const incident = await upsertIncident(req.operatorId, { ...op.payload, source: 'offline-queue' })
        results.push({ clientId: op.payload.clientId, ok: true, id: incident._id })
      } else {
        results.push({ clientId: op.payload?.clientId, ok: false, error: `unknown kind ${op.kind}` })
      }
    } catch (e) {
      results.push({ clientId: op.payload?.clientId, ok: false, error: e.message })
    }
  }

  if (results.some((r) => r.ok)) req.app.get('io')?.emit('incident:logged', { synced: results.length })
  res.json({ results, synced: results.filter((r) => r.ok).length })
})

export default router
