import { Delete } from 'lucide-react'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

/**
 * Numeric keypad rather than a text input. A system keyboard on a phone is small, and the
 * operator may be wearing gloves in a vibrating cab - these keys are full-width thirds.
 */
export default function PinPad({ value, onChange, length = 4 }) {
  function press(key) {
    if (key === 'del') return onChange(value.slice(0, -1))
    if (!key || value.length >= length) return
    onChange(value + key)
  }

  return (
    <div>
      <div className="flex justify-center gap-3 mb-6">
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className={`w-4 h-4 rounded-full border-2 ${
              i < value.length ? 'bg-cat-yellow border-cat-yellow' : 'border-cat-border'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              onClick={() => press(k)}
              className="btn-ghost text-2xl font-bold h-16"
              aria-label={k === 'del' ? 'Delete' : k}
            >
              {k === 'del' ? <Delete size={24} /> : k}
            </button>
          )
        )}
      </div>
    </div>
  )
}
