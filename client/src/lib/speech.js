import { getOperator } from './api.js'

const LANG = { en: 'en-IN', hi: 'hi-IN' }

/**
 * Speaks an alert aloud. The operator's hands are on the levers and their eyes are on the
 * site, so anything urgent has to be audible rather than only visible.
 *
 * Guarded throughout: speechSynthesis is missing or silently blocked in some browsers, and a
 * failed alert must never take the screen down with it.
 */
export function speak(text, { lang } = {}) {
  try {
    if (!('speechSynthesis' in window) || !text) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang || LANG[getOperator()?.language] || 'en-IN'
    utterance.rate = 1.0
    utterance.volume = 1.0
    window.speechSynthesis.cancel() // never queue stale alerts behind a new one
    window.speechSynthesis.speak(utterance)
  } catch {
    /* audio unavailable - the visual alert still stands */
  }
}
