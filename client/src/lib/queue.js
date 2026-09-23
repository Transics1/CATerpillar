import { openDB } from 'idb'
import { getToken } from './api.js'

/**
 * Offline write queue.
 *
 * A jobsite loses signal constantly, and an incident report that fails because the bars
 * dropped is an incident report that never gets written. Writes land in IndexedDB first and
 * sync when the connection returns.
 *
 * Every queued item carries a clientId generated here, on the device. The server upserts on
 * it, so a queue that flushes twice - flaky reconnect, retried request, app reopened
 * mid-sync - converges on one record rather than duplicating.
 */

const DB_NAME = 'cat-copilot'
const STORE = 'outbox'

let dbPromise
const listeners = new Set()

function db() {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(STORE, { keyPath: 'clientId' })
    }
  })
  return dbPromise
}

export function newClientId() {
  return crypto.randomUUID?.() ?? `c-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function onQueueChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

async function notify() {
  const n = await pendingCount()
  listeners.forEach((fn) => fn(n))
}

export async function pendingCount() {
  try {
    return await (await db()).count(STORE)
  } catch {
    return 0
  }
}

export async function enqueue(kind, payload) {
  const item = { clientId: payload.clientId ?? newClientId(), kind, payload, queuedAt: Date.now() }
  item.payload.clientId = item.clientId
  await (await db()).put(STORE, item)
  await notify()
  // Try immediately - if we are actually online this behaves like a normal write.
  flush().catch(() => {})
  return item
}

export async function flush() {
  if (!navigator.onLine) return { synced: 0, skipped: 'offline' }
  const token = getToken()
  if (!token) return { synced: 0, skipped: 'no-session' }

  const d = await db()
  const items = await d.getAll(STORE)
  if (!items.length) return { synced: 0 }

  const res = await fetch('/api/incidents/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ operations: items.map(({ kind, payload }) => ({ kind, payload })) })
  })
  if (!res.ok) throw new Error('sync failed')

  const { results = [] } = await res.json()
  // Only clear rows the server confirmed. A failed row stays queued for the next attempt
  // rather than being silently dropped.
  for (const r of results) {
    if (r.ok && r.clientId) await d.delete(STORE, r.clientId)
  }
  await notify()
  return { synced: results.filter((r) => r.ok).length }
}

export function startAutoSync() {
  window.addEventListener('online', () => flush().catch(() => {}))
  flush().catch(() => {})
}
