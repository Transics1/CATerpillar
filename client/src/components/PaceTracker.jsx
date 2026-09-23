import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const STATE = {
  ahead: { label: 'Ahead of pace', cls: 'text-state-ok', Icon: TrendingDown },
  'on-track': { label: 'On pace', cls: 'text-cat-muted', Icon: Minus },
  behind: { label: 'Behind pace', cls: 'text-state-warn', Icon: TrendingUp }
}

export default function PaceTracker({ pace }) {
  const s = STATE[pace.state] ?? STATE['on-track']
  const { Icon } = s

  return (
    <div className="panel">
      <div className="flex items-center justify-between">
        <span className="label-muted">Pace</span>
        <span className={`flex items-center gap-1 text-sm font-bold ${s.cls}`}>
          <Icon size={16} strokeWidth={2.6} />
          {s.label}
        </span>
      </div>

      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-4xl font-extrabold tabular-nums leading-none">{pace.cyclesDone}</span>
        <span className="text-cat-muted font-semibold">/ {pace.cyclesTarget} cycles</span>
      </div>

      <div className="h-2.5 rounded-full bg-cat-dark mt-3 overflow-hidden">
        <div
          className="h-full rounded-full bg-cat-yellow transition-[width] duration-500"
          style={{ width: `${pace.progressPct}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4 text-center">
        <div>
          <p className="text-xl font-bold tabular-nums">{pace.elapsedMin}</p>
          <p className="label-muted">elapsed</p>
        </div>
        <div>
          <p className="text-xl font-bold tabular-nums">{pace.revisedEtaMin}</p>
          <p className="label-muted">revised eta</p>
        </div>
        <div>
          <p className={`text-xl font-bold tabular-nums ${s.cls}`}>
            {pace.varianceMin > 0 ? '+' : ''}
            {pace.varianceMin}
          </p>
          <p className="label-muted">vs plan</p>
        </div>
      </div>
    </div>
  )
}
