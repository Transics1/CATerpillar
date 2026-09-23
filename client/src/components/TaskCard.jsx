import { ArrowUpRight, ArrowDownRight, Play, Sun, CloudRain, Cloud, Wind } from 'lucide-react'
import EtaBand from './EtaBand.jsx'

const WEATHER_ICON = { Sunny: Sun, Rainy: CloudRain, Cloudy: Cloud, Windy: Wind }

function DriverChip({ driver }) {
  const up = driver.direction === 'up'
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${
        up ? 'bg-state-warn/15 text-state-warn' : 'bg-state-ok/15 text-state-ok'
      }`}
    >
      <Icon size={13} strokeWidth={2.6} />
      {driver.feature} {driver.value}
      <span className="tabular-nums opacity-80">
        {up ? '+' : ''}
        {driver.deltaMin}m
      </span>
    </span>
  )
}

export default function TaskCard({ task, onStart }) {
  const { prediction: p } = task
  const Weather = WEATHER_ICON[task.weather] || Sun

  return (
    <article className="panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-cat-muted text-xs font-semibold">
            <span className="bg-cat-yellow text-black rounded-md px-1.5 py-0.5 tabular-nums">
              {task.order}
            </span>
            <span className="uppercase tracking-wide">{task.shiftPeriod}</span>
            <Weather size={13} />
            <span>{task.weather}</span>
          </div>
          <h2 className="text-lg font-bold mt-1.5 truncate">{task.taskType}</h2>
          <p className="text-cat-muted text-sm">
            {task.machineId} · {task.siteZone}
          </p>
        </div>
      </div>

      <EtaBand p10={p.p10} p50={p.p50} p90={p.p90} />

      {p.drivers?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {p.drivers.map((d) => (
            <DriverChip key={d.feature} driver={d} />
          ))}
        </div>
      )}

      <p className="text-cat-muted text-xs mt-3 leading-relaxed">{task.whyOrdered}</p>

      <button className="btn-primary w-full mt-4" onClick={() => onStart(task)}>
        <Play size={20} strokeWidth={2.6} fill="currentColor" />
        Start task
      </button>

      {p.source === 'fallback' && (
        <p className="text-[10px] text-cat-muted mt-2 text-center">estimate from local model</p>
      )}
    </article>
  )
}
