import { useEffect, useState } from 'react'
import { LogOut, Shield, Gauge, Wrench } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts'
import Screen from '../components/Screen.jsx'
import { api, clearSession, getOperator } from '../lib/api.js'

const SUBS = [
  { key: 'safety', label: 'Safety', Icon: Shield, hint: 'Restraint use, alerts, proximity' },
  { key: 'efficiency', label: 'Efficiency', Icon: Gauge, hint: 'Idling and fuel per cycle' },
  { key: 'skill', label: 'Skill', Icon: Wrench, hint: 'Pace against estimates' }
]

function Ring({ value }) {
  const pct = Math.max(0, Math.min(100, value ?? 0))
  return (
    <div className="relative w-28 h-28">
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3" className="text-cat-border" />
        <circle
          cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3"
          strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" className="text-cat-yellow"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold tabular-nums leading-none">{Math.round(pct)}</span>
        <span className="label-muted mt-1">DNA</span>
      </div>
    </div>
  )
}

export default function Me() {
  const [operator, setOperator] = useState(getOperator())

  useEffect(() => {
    api.me().then((r) => setOperator(r.operator)).catch(() => {})
  }, [])

  const dna = operator?.dnaScore ?? {}
  const history = (operator?.dnaHistory ?? []).slice(-20).map((h, i) => ({ i, ...h }))

  return (
    <Screen
      title={operator?.name ?? 'Me'}
      subtitle={`${operator?.operatorId ?? ''} · ${operator?.skillLevel ?? ''}`}
      action={
        <button
          onClick={() => {
            clearSession()
            location.reload()
          }}
          className="w-11 h-11 rounded-lg bg-cat-panel flex items-center justify-center"
        >
          <LogOut size={18} />
        </button>
      }
    >
      <div className="panel flex items-center gap-5">
        <Ring value={dna.overall} />
        <div className="flex-1 space-y-2.5">
          {SUBS.map(({ key, label, Icon }) => (
            <div key={key}>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Icon size={14} className="text-cat-muted" />
                  {label}
                </span>
                <span className="font-bold tabular-nums">{dna[key] ?? '-'}</span>
              </div>
              <div className="h-1.5 rounded-full bg-cat-dark mt-1">
                <div className="h-full rounded-full bg-cat-yellow" style={{ width: `${dna[key] ?? 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {history.length > 1 && (
        <div className="panel mt-3">
          <p className="label-muted mb-2">Your trend</p>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <YAxis domain={['dataMin - 3', 'dataMax + 3']} hide />
                <Tooltip
                  contentStyle={{ background: '#1C1C1C', border: '1px solid #2E2E2E', borderRadius: 12 }}
                  labelFormatter={() => ''}
                />
                <Line type="monotone" dataKey="overall" stroke="#FFCD11" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="panel mt-3">
        <p className="label-muted mb-2">How this is scored</p>
        <ul className="space-y-1.5">
          {SUBS.map(({ key, label, hint }) => (
            <li key={key} className="text-sm">
              <span className="font-semibold">{label}</span>
              <span className="text-cat-muted"> — {hint}</span>
            </li>
          ))}
        </ul>
        <p className="text-cat-muted text-xs mt-3 leading-relaxed">
          Safety is weighted heaviest at 50%, then efficiency 30% and skill 20%.
        </p>
      </div>

      {operator?.completedLessons?.length > 0 && (
        <div className="panel mt-3">
          <p className="label-muted mb-1">Lessons completed</p>
          <p className="text-3xl font-extrabold tabular-nums">{operator.completedLessons.length}</p>
        </div>
      )}
    </Screen>
  )
}
