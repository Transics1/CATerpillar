import { Router } from 'express'
import { Operator } from '../models/index.js'
import { sign, requireAuth } from '../middleware/auth.js'

const router = Router()

// Hackathon auth: operatorId + shared PIN. Not a credential system, and deliberately so -
// a real deployment would federate to the site's identity provider.
router.post('/login', async (req, res) => {
  const { operatorId, pin } = req.body
  const operator = await Operator.findOne({ operatorId }).lean()
  if (!operator) return res.status(404).json({ error: 'unknown operator' })
  if (pin && pin !== '1234') return res.status(401).json({ error: 'bad pin' })
  res.json({ token: sign(operatorId), operator })
})

router.get('/me', requireAuth, async (req, res) => {
  const operator = await Operator.findOne({ operatorId: req.operatorId }).lean()
  if (!operator) return res.status(404).json({ error: 'not found' })
  res.json({ operator })
})

// Demo convenience: the login screen lists real seeded operators instead of making you
// remember an ID.
router.get('/operators', async (_req, res) => {
  const operators = await Operator.find({}, 'operatorId name skillLevel language').limit(30).lean()
  res.json({ operators })
})

export default router
