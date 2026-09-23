import { useEffect, useState } from 'react'
import { HardHat } from 'lucide-react'
import { api, setSession } from '../lib/api.js'

export default function Login({ onLoggedIn }) {
  const [operators, setOperators] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    api.listOperators().then((r) => setOperators(r.operators)).catch((e) => setError(e.message))
  }, [])

  async function pick(operatorId) {
    setBusy(operatorId)
    try {
      const { token, operator } = await api.login(operatorId)
      setSession(token, operator)
      onLoggedIn(operator)
    } catch (e) {
      setError(e.message)
      setBusy(null)
    }
  }

  return (
    <div className="px-4 pt-[calc(env(safe-area-inset-top)+3rem)]">
      <div className="flex items-center gap-2 text-cat-yellow">
        <HardHat size={28} strokeWidth={2.4} />
        <span className="text-xl font-extrabold tracking-tight">CAT Copilot</span>
      </div>
      <h1 className="text-3xl font-extrabold mt-6 leading-tight">Who is operating today?</h1>
      <p className="text-cat-muted mt-1 mb-6">Tap your name to start the shift.</p>

      {error && <div className="panel border-state-danger text-state-danger mb-4">{error}</div>}

      <div className="space-y-2">
        {operators.map((o) => (
          <button
            key={o.operatorId}
            onClick={() => pick(o.operatorId)}
            disabled={busy}
            className="btn-ghost w-full justify-between disabled:opacity-40"
          >
            <span className="flex flex-col items-start">
              <span className="font-bold">{o.name}</span>
              <span className="text-cat-muted text-xs font-medium">
                {o.operatorId} · {o.skillLevel}
              </span>
            </span>
            {busy === o.operatorId && <span className="text-cat-muted text-sm">...</span>}
          </button>
        ))}
        {!operators.length && !error && <p className="text-cat-muted">Loading operators...</p>}
      </div>
    </div>
  )
}
