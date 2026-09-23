import { useEffect, useState } from 'react'
import { HardHat, ChevronLeft, ShieldCheck } from 'lucide-react'
import { api, setSession } from '../lib/api.js'
import PinPad from '../components/PinPad.jsx'

export default function Login({ onLoggedIn }) {
  const [people, setPeople] = useState([])
  const [selected, setSelected] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.directory().then((r) => setPeople(r.operators)).catch((e) => setError(e.message))
  }, [])

  // Submit as soon as the PIN is complete - no extra confirm tap.
  useEffect(() => {
    if (pin.length !== 4 || !selected || busy) return
    setBusy(true)
    setError(null)
    api
      .login(selected.operatorId, pin)
      .then(({ token, operator }) => {
        setSession(token, operator)
        onLoggedIn(operator)
      })
      .catch((e) => {
        setError(e.message)
        setPin('')
        setBusy(false)
      })
  }, [pin, selected, busy, onLoggedIn])

  if (selected) {
    return (
      <div className="px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <button
          className="flex items-center gap-1 text-cat-muted min-h-touch -ml-2 px-2"
          onClick={() => {
            setSelected(null)
            setPin('')
            setError(null)
          }}
        >
          <ChevronLeft size={20} /> Back
        </button>

        <h1 className="text-2xl font-extrabold mt-2">{selected.name}</h1>
        <p className="text-cat-muted mb-8">
          {selected.role === 'supervisor' ? 'Supervisor' : selected.skillLevel} · Enter your PIN
        </p>

        {error && (
          <div className="panel border-state-danger text-state-danger mb-5 text-sm">{error}</div>
        )}

        <PinPad value={pin} onChange={setPin} />
      </div>
    )
  }

  const supervisors = people.filter((p) => p.role === 'supervisor')
  const operators = people.filter((p) => p.role !== 'supervisor')

  return (
    <div className="px-4 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-8">
      <div className="flex items-center gap-2 text-cat-yellow">
        <HardHat size={28} strokeWidth={2.4} />
        <span className="text-xl font-extrabold tracking-tight">CAT Copilot</span>
      </div>
      <h1 className="text-3xl font-extrabold mt-6 leading-tight">Who is on site today?</h1>
      <p className="text-cat-muted mt-1 mb-6">Select your name to begin.</p>

      {error && <div className="panel border-state-danger text-state-danger mb-4">{error}</div>}

      {supervisors.length > 0 && (
        <>
          <p className="label-muted mb-2">Supervisor</p>
          <div className="space-y-2 mb-6">
            {supervisors.map((p) => (
              <button
                key={p.operatorId}
                onClick={() => setSelected(p)}
                className="btn-ghost w-full justify-start gap-3 border-cat-yellow/40"
              >
                <ShieldCheck size={20} className="text-cat-yellow shrink-0" />
                <span className="flex flex-col items-start">
                  <span className="font-bold">{p.name}</span>
                  <span className="text-cat-muted text-xs font-medium">{p.operatorId}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <p className="label-muted mb-2">Operators</p>
      <div className="space-y-2">
        {operators.map((p) => (
          <button
            key={p.operatorId}
            onClick={() => setSelected(p)}
            className={`btn-ghost w-full justify-between ${p.available ? '' : 'opacity-45'}`}
          >
            <span className="flex flex-col items-start">
              <span className="font-bold">{p.name}</span>
              <span className="text-cat-muted text-xs font-medium">
                {p.operatorId} · {p.skillLevel}
              </span>
            </span>
            {!p.available && <span className="text-state-warn text-xs font-semibold">OUT</span>}
          </button>
        ))}
        {!people.length && !error && <p className="text-cat-muted">Loading...</p>}
      </div>
    </div>
  )
}
