import { useEffect, useState } from 'react'
import { UserCheck, Truck, Check } from 'lucide-react'
import Sheet from '../../components/Sheet.jsx'
import { api } from '../../lib/api.js'

function ScoreBar({ score }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-cat-dark mt-2">
      <div className="h-full rounded-full bg-cat-yellow" style={{ width: `${score}%` }} />
    </div>
  )
}

export default function ReassignSheet({ task, onClose, onDone }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const [mode, setMode] = useState('operator')

  useEffect(() => {
    if (!task) return
    setData(null)
    setError(null)
    api.candidates(task.taskId).then(setData).catch((e) => setError(e.message))
  }, [task])

  async function apply(body, key) {
    setBusy(key)
    try {
      await api.reassign(task.taskId, body)
      onDone()
    } catch (e) {
      setError(e.message)
      setBusy(null)
    }
  }

  return (
    <Sheet
      open={!!task}
      title={task ? `Reassign ${task.taskType}` : ''}
      subtitle={task ? `${task.machineId} · ${task.estimatedTimeMin ?? '?'} min planned` : ''}
      onClose={onClose}
    >
      <div className="flex gap-2 mb-4">
        {[
          ['operator', 'Operator', UserCheck],
          ['machine', 'Machine', Truck]
        ].map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className={`flex-1 min-h-12 rounded-xl font-semibold flex items-center justify-center gap-2 ${
              mode === k ? 'bg-cat-yellow text-black' : 'bg-cat-dark text-cat-muted'
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      {error && <div className="panel border-state-danger text-state-danger mb-3 text-sm">{error}</div>}
      {!data && !error && <p className="text-cat-muted pb-6">Ranking candidates...</p>}

      {data && mode === 'operator' && (
        <div className="space-y-2 pb-4">
          {data.operators.map((c) => (
            <button
              key={c.operatorId}
              disabled={busy}
              onClick={() => apply({ operatorId: c.operatorId }, c.operatorId)}
              className="w-full text-left panel bg-cat-dark active:scale-[0.99] transition-transform disabled:opacity-40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold truncate">{c.name}</p>
                  <p className="text-cat-muted text-xs">
                    {c.skillLevel} · DNA {c.dna} · {c.assignedMin} min booked
                  </p>
                </div>
                <span className="shrink-0 text-cat-yellow font-extrabold tabular-nums">
                  {busy === c.operatorId ? <Check size={18} /> : c.score}
                </span>
              </div>
              <ScoreBar score={c.score} />
              <p className="text-[11px] text-cat-muted mt-2 leading-relaxed">
                {c.reasons.join(' · ')}
              </p>
            </button>
          ))}
          {!data.operators.length && <p className="text-cat-muted">No available operators.</p>}
        </div>
      )}

      {data && mode === 'machine' && (
        <div className="space-y-2 pb-4">
          {data.machines.map((m) => (
            <button
              key={m.machineId}
              disabled={busy}
              onClick={() => apply({ machineId: m.machineId }, m.machineId)}
              className="w-full text-left panel bg-cat-dark active:scale-[0.99] transition-transform disabled:opacity-40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{m.machineId}</p>
                  <p className="text-cat-muted text-xs">{m.model}</p>
                </div>
                <span className="text-cat-yellow font-extrabold tabular-nums">
                  {busy === m.machineId ? <Check size={18} /> : m.score}
                </span>
              </div>
              <ScoreBar score={m.score} />
              <p className="text-[11px] text-cat-muted mt-2">{m.reasons.join(' · ')}</p>
            </button>
          ))}
          {!data.machines.length && <p className="text-cat-muted">No other machines of this type.</p>}
        </div>
      )}
    </Sheet>
  )
}
