import jwt from 'jsonwebtoken'

const SECRET = () => process.env.JWT_SECRET || 'dev-secret'

export function sign(operatorId) {
  return jwt.sign({ operatorId }, SECRET(), { expiresIn: '12h' })
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'missing token' })
  try {
    req.operatorId = jwt.verify(token, SECRET()).operatorId
    next()
  } catch {
    res.status(401).json({ error: 'invalid token' })
  }
}
