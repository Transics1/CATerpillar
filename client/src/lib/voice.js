import { getOperator } from './api.js'

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

export const speechSupported = () => !!SR

const LANG = { en: 'en-IN', hi: 'hi-IN' }

// One-shot dictation. Rejects if the mic is unavailable.
export function listenOnce({ lang } = {}) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error('speech recognition unavailable'))
    const rec = new SR()
    rec.lang = lang || LANG[getOperator()?.language] || 'en-IN'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e) => resolve(e.results[0][0].transcript)
    rec.onerror = (e) => reject(new Error(e.error))
    rec.onend = () => reject(new Error('no speech'))
    try {
      rec.start()
    } catch (e) {
      reject(e)
    }
  })
}

// Local keyword matching rather than an LLM call: no cost, instant, and it still works when
// the signal drops. An assistant that needs the cloud is useless in a dead zone.
const INTENTS = [
  { intent: 'start_task', keywords: ['start', 'begin', 'shuru'] },
  { intent: 'log_incident', keywords: ['incident', 'report', 'near miss', 'accident'] },
  { intent: 'status', keywords: ['status', 'how am i', 'pace', 'progress', 'kaisa'] },
  { intent: 'finish_task', keywords: ['finish', 'complete', 'done', 'khatam'] }
]

export function parseIntent(text) {
  const t = (text || '').toLowerCase()
  for (const { intent, keywords } of INTENTS) {
    if (keywords.some((k) => t.includes(k))) return { intent, text }
  }
  return { intent: null, text }
}
