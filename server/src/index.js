import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { connectDB } from './db.js'

const app = express()
const httpServer = createServer(app)
const io = new SocketServer(httpServer, { cors: { origin: '*' } })

app.use(cors())
app.use(express.json({ limit: '10mb' })) // walkaround photos arrive as base64

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

io.on('connection', (socket) => {
  socket.on('subscribe:machine', ({ machineId }) => socket.join(`machine:${machineId}`))
  socket.on('subscribe:operator', ({ operatorId }) => socket.join(`operator:${operatorId}`))
})

app.set('io', io)

const PORT = process.env.PORT || 5000

connectDB()
  .then(() => {
    httpServer.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`))
  })
  .catch((err) => {
    console.error('[server] startup failed:', err.message)
    process.exit(1)
  })
