import { Fuel, AlertCircle } from 'lucide-react'

const NUDGE_AFTER_MIN = 3

export default function IdleWasteMeter({ pace }) {
  const nudging = pace.idleStreakMin >= NUDGE_AFTER_MIN

  return (
    <div className={`panel ${nudging ? 'border-state-warn' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="label-muted">Idle waste</span>
        <Fuel size={16} className={nudging ? 'text-state-warn' : 'text-cat-muted'} />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div>
          <p className="text-2xl font-extrabold tabular-nums">{pace.idleMin}</p>
          <p className="label-muted">min idle</p>
        </div>
        <div>
          <p className="text-2xl font-extrabold tabular-nums text-state-warn">
            {'₹'}
            {pace.idleCostInr}
          </p>
          <p className="label-muted">wasted</p>
        </div>
        <div>
          <p className="text-2xl font-extrabold tabular-nums">{pace.idleCo2Kg}</p>
          <p className="label-muted">kg CO{'₂'}</p>
        </div>
      </div>

      {nudging && (
        <p className="flex items-start gap-2 mt-3 text-sm text-state-warn font-semibold leading-snug">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          Idling {pace.idleStreakMin} min — shut down to save fuel.
        </p>
      )}
    </div>
  )
}
