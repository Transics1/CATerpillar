import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Fuel, GraduationCap, TrendingDown, ArrowRight } from 'lucide-react'
import Screen from '../components/Screen.jsx'
import { api } from '../lib/api.js'

function Stat({ label, value, sub, accent }) {
  return (
    <div className="panel flex-1 py-3">
      <p className={`text-2xl font-extrabold tabular-nums ${accent ?? ''}`}>{value}</p>
      <p className="label-muted mt-0.5">{label}</p>
      {sub && <p className="text-cat-muted text-[11px] mt-0.5">{sub}</p>}
    </div>
  )
}

export default function Report() {
  const [r, setR] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.shiftReport().then(setR).catch((e) => setError(e.message))
  }, [])

  if (error) {
    return (
      <Screen title="Shift report">
        <div className="panel border-state-danger text-state-danger">{error}</div>
      </Screen>
    )
  }
  if (!r) {
    return (
      <Screen title="Shift report">
        <div className="panel text-cat-muted">Building your report...</div>
      </Screen>
    )
  }

  const dnaDelta = Math.round(((r.dnaAfter?.overall ?? 0) - (r.dnaBefore?.overall ?? 0)) * 10) / 10

  return (
    <Screen title="Shift report" subtitle={`${r.operator?.name} · today`}>
      <div className="flex gap-2 mb-3">
        <Stat label="Tasks done" value={`${r.tasksCompleted}/${r.tasksPlanned}`} />
        <Stat label="Cycles" value={r.cyclesDone} />
        <Stat label="Flags" value={r.anomalies.length} accent={r.anomalies.length ? 'text-state-warn' : ''} />
      </div>

      <div className="panel mb-3">
        <p className="label-muted flex items-center gap-1.5">
          <Fuel size={14} /> Idle waste today
        </p>
        <div className="flex items-baseline gap-3 mt-1">
          <span className="text-4xl font-extrabold tabular-nums">{r.idleMin}</span>
          <span className="text-cat-muted font-semibold">min idle</span>
        </div>
        <p className="text-state-warn font-bold text-lg mt-1 tabular-nums">
          {'₹'}{r.idleCostInr} · {r.idleCo2Kg} kg CO{'₂'}
        </p>
      </div>

      {/* The loop closing: coaching received today, and what it changes tomorrow. */}
      <div className="panel mb-3 border-cat-yellow/40">
        <p className="label-muted flex items-center gap-1.5">
          <GraduationCap size={14} /> Coaching today
        </p>

        {r.lessonsCompleted.length ? (
          <div className="space-y-1.5 mt-2">
            {r.lessonsCompleted.map((l) => (
              <p key={l.lessonId} className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 size={16} className="text-state-ok shrink-0" />
                {l.title}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-cat-muted text-sm mt-1">No lessons completed today.</p>
        )}

        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-cat-border">
          <div>
            <p className="label-muted">DNA</p>
            <p className="text-2xl font-extrabold tabular-nums">
              {r.dnaBefore?.overall}
              <ArrowRight size={16} className="inline mx-1.5 text-cat-muted" />
              <span className={dnaDelta > 0 ? 'text-state-ok' : ''}>{r.dnaAfter?.overall}</span>
            </p>
          </div>
          {dnaDelta !== 0 && (
            <span className="ml-auto text-state-ok font-bold text-sm bg-state-ok/15 px-2.5 py-1.5 rounded-lg">
              {dnaDelta > 0 ? '+' : ''}
              {dnaDelta}
            </span>
          )}
        </div>

        {r.tomorrowEtaShiftPct !== 0 && (
          <p className="flex items-start gap-2 text-sm mt-3 text-state-ok font-semibold leading-snug">
            <TrendingDown size={18} className="shrink-0 mt-0.5" />
            Tomorrow's estimates adjust {r.tomorrowEtaShiftPct}% — the system has learned how you
            work today.
          </p>
        )}
      </div>

      <button className="btn-ghost w-full" onClick={() => navigate('/tasks')}>
        Back to today's plan
      </button>
    </Screen>
  )
}
