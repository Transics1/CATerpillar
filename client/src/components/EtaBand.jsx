// The band gets its own visual: a bare number hides how certain the model actually is.
export default function EtaBand({ p10, p50, p90 }) {
  const span = Math.max(p90 - p10, 1)
  const markerPct = ((p50 - p10) / span) * 100

  return (
    <div className="mt-3">
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-extrabold tabular-nums leading-none">{Math.round(p50)}</span>
        <span className="text-cat-muted font-semibold">min</span>
      </div>

      <div className="relative h-2 mt-3 rounded-full bg-cat-yellow/25">
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1 h-4 rounded-full bg-cat-yellow"
          style={{ left: `${Math.min(100, Math.max(0, markerPct))}%` }}
        />
      </div>

      <div className="flex justify-between mt-1.5 text-[11px] font-medium text-cat-muted tabular-nums">
        <span>{Math.round(p10)} min</span>
        <span className="uppercase tracking-wide">80% likely range</span>
        <span>{Math.round(p90)} min</span>
      </div>
    </div>
  )
}
