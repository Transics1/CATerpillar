import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { Operator } from '../models/index.js'
import { sign, requireAuth } from '../middleware/auth.js'

const router = Router()

router.post('/login', async (req, res) => {
  const { operatorId, pin } = req.body
  if (!operatorId || !pin) return res.status(400).json({ error: 'operatorId and pin required' })

  const operator = await Operator.findOne({ operatorId })
  // Same response for both, so the endpoint cannot enumerate valid operator IDs.
  if (!operator || !(await bcrypt.compare(pin, operator.pinHash || ''))) {
    return res.status(401).json({ error: 'Incorrect ID or PIN' })
  }
  if (!operator.available && operator.role === 'operator') {
    return res.status(403).json({
      error: `You are marked ${operator.unavailability?.reason || 'unavailable'}. See your supervisor.`
    })
  }

  const safe = operator.toObject()
  delete safe.pinHash
  res.json({ token: sign(operator.operatorId, operator.role), operator: safe })
})

router.get('/me', requireAuth, async (req, res) => {
  const operator = await Operator.findOne({ operatorId: req.operatorId }, '-pinHash').lean()
  if (!operator) return res.status(404).json({ error: 'not found' })
  res.json({ operator })
})

// Names and roles only - never PINs or hashes.
router.get('/directory', async (_req, res) => {
  const operators = await Operator.find({}, 'operatorId name skillLevel language role available')
    .sort({ role: -1, operatorId: 1 })
    .limit(40)
    .lean()
  res.json({ operators })
})

export default router
