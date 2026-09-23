import { io } from 'socket.io-client'
import { getOperator } from './api.js'

let socket

export function getSocket() {
  if (socket) return socket
  // Same origin: Vite proxies /socket.io, so one tunnel URL covers both.
  socket = io({ transports: ['websocket', 'polling'] })
  socket.on('connect', () => {
    const operator = getOperator()
    if (operator) socket.emit('subscribe:operator', { operatorId: operator.operatorId })
  })
  return socket
}

// Returns the cleanup function.
export function onEvent(event, handler) {
  const s = getSocket()
  s.on(event, handler)
  return () => s.off(event, handler)
}
