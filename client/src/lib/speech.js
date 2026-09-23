import { getOperator } from './api.js'

const LANG = { en: 'en-IN', hi: 'hi-IN' }

// Hands are on the levers, so anything urgent has to be audible, not just visible.
// Guarded throughout - speechSynthesis is missing or blocked in some browsers.
export function speak(text, { lang } = {}) {
  try {
    if (!('speechSynthesis' in window) || !text) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang || LANG[getOperator()?.language] || 'en-IN'
    utterance.rate = 1.0
    utterance.volume = 1.0
    window.speechSynthesis.cancel() // never queue a stale alert behind a new one
    window.speechSynthesis.speak(utterance)
  } catch {
    /* audio unavailable - the visual alert still stands */
  }
}
