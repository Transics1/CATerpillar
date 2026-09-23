import jwt from 'jsonwebtoken'

const SECRET = () => process.env.JWT_SECRET || 'dev-secret'

export function sign(operatorId, role) {
  return jwt.sign({ operatorId, role }, SECRET(), { expiresIn: '12h' })
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'missing token' })
  try {
    const claims = jwt.verify(token, SECRET())
    req.operatorId = claims.operatorId
    req.role = claims.role || 'operator'
    next()
  } catch {
    res.status(401).json({ error: 'invalid token' })
  }
}

/**
 * Role gate for supervisor-only routes. The role comes from the signed token rather than the
 * request body, so an operator cannot reach the admin endpoints by editing a client payload.
 */
export function requireRole(role) {
  return (req, res, next) => {
    if (req.role !== role) return res.status(403).json({ error: `requires ${role} role` })
    next()
  }
}
