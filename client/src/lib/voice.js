import { getOperator } from './api.js'

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

export const speechSupported = () => !!SR

const LANG = { en: 'en-IN', hi: 'hi-IN' }

/** One-shot dictation. Resolves with the transcript, rejects if the mic is unavailable. */
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

/**
 * Maps a spoken phrase to one of a small set of intents.
 *
 * Deliberately local keyword matching rather than an LLM call. It costs nothing, answers
 * instantly, and - the part that matters on a jobsite - still works when the signal drops.
 * An assistant that needs the cloud is useless in the dead zone where operators actually work.
 */
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
