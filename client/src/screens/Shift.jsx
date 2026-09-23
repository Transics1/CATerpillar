import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Circle, ShieldCheck, AlertTriangle, FileText } from 'lucide-react'
import Screen from '../components/Screen.jsx'
import { api } from '../lib/api.js'

// Gates task start: a checklist that cannot stop you is a form, not a safety control.
export default function Shift() {
  const [shift, setShift] = useState(null)
  const [items, setItems] = useState([])
  const [seatbelt, setSeatbelt] = useState(false)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api
      .startShift()
      .then(({ shift }) => {
        setShift(shift)
        setItems(shift.checklist ?? [])
        setSeatbelt(!!shift.seatbeltConfirmed)
        if (shift.seatbeltConfirmed && (shift.checklist ?? []).every((i) => i.passed)) {
          setResult({ passed: true, blockers: [] })
        }
      })
      .catch(() => {})
  }, [])

  const toggle = (idx) =>
    setItems((list) => list.map((it, i) => (i === idx ? { ...it, passed: !it.passed } : it)))

  async function submit() {
    setBusy(true)
    try {
      const r = await api.submitChecklist(shift.shiftId, items, seatbelt)
      setResult(r)
    } finally {
      setBusy(false)
    }
  }

  const allChecked = items.length > 0 && items.every((i) => i.passed) && seatbelt
  const done = result?.passed

  return (
    <Screen
      title="Start of shift"
      subtitle={shift ? `Walkaround · ${shift.machineId ?? 'machine'}` : 'Preparing...'}
      action={
        done && (
          <button
            onClick={() => navigate('/report')}
            className="w-11 h-11 rounded-lg bg-cat-panel flex items-center justify-center"
          >
            <FileText size={18} />
          </button>
        )
      }
    >
      {done && (
        <div className="panel border-state-ok mb-4 flex items-center gap-2">
          <ShieldCheck size={20} className="text-state-ok shrink-0" />
          <div>
            <p className="font-bold text-state-ok">Machine cleared</p>
            <p className="text-cat-muted text-xs">You are signed on and can start work.</p>
          </div>
        </div>
      )}

      {result && !result.passed && (
        <div className="panel border-state-danger mb-4">
          <p className="flex items-center gap-2 font-bold text-state-danger">
            <AlertTriangle size={18} /> Cannot start work
          </p>
          <ul className="mt-2 space-y-1">
            {result.blockers.map((b) => (
              <li key={b} className="text-sm text-cat-muted">
                · {b}
              </li>
            ))}
          </ul>
          <p className="text-cat-muted text-xs mt-2">Report these to your supervisor before operating.</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((it, idx) => (
          <button
            key={it.item}
            onClick={() => toggle(idx)}
            className={`panel w-full flex items-center gap-3 text-left py-4 ${
              it.passed ? 'border-state-ok/50' : ''
            }`}
          >
            {it.passed ? (
              <CheckCircle2 size={24} className="text-state-ok shrink-0" />
            ) : (
              <Circle size={24} className="text-cat-muted shrink-0" />
            )}
            <span className="font-semibold text-sm leading-snug">{it.item}</span>
          </button>
        ))}
      </div>

      {items.length > 0 && (
        <>
          <button
            onClick={() => setSeatbelt((s) => !s)}
            className={`panel w-full flex items-center gap-3 text-left py-4 mt-4 ${
              seatbelt ? 'border-cat-yellow' : 'border-state-warn'
            }`}
          >
            {seatbelt ? (
              <CheckCircle2 size={24} className="text-cat-yellow shrink-0" />
            ) : (
              <Circle size={24} className="text-state-warn shrink-0" />
            )}
            <span className="font-bold text-sm">I have fastened my seat restraint</span>
          </button>

          <button className="btn-primary w-full mt-4" disabled={!allChecked || busy} onClick={submit}>
            {busy ? 'Signing on...' : allChecked ? 'Sign on and start shift' : 'Complete all checks'}
          </button>
        </>
      )}

      {!items.length && <div className="panel text-cat-muted">Loading walkaround...</div>}
    </Screen>
  )
}
