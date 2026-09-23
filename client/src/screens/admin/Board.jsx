import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, LogOut, Users, Truck, RefreshCw } from 'lucide-react'
import { api, clearSession, getOperator } from '../../lib/api.js'
import Sheet from '../../components/Sheet.jsx'
import ReassignSheet from './ReassignSheet.jsx'

const OUT_REASONS = ['sick', 'injured', 'leave', 'training']
const FAULT_REASONS = ['breakdown', 'maintenance', 'hydraulic fault', 'awaiting parts']

function Stat({ label, value, alert }) {
  return (
    <div className={`panel flex-1 py-3 ${alert && value > 0 ? 'border-state-warn' : ''}`}>
      <p className={`text-2xl font-extrabold tabular-nums ${alert && value > 0 ? 'text-state-warn' : ''}`}>
        {value}
      </p>
      <p className="label-muted mt-0.5">{label}</p>
    </div>
  )
}

export default function Board() {
  const [board, setBoard] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('roster')
  const [personSheet, setPersonSheet] = useState(null)
  const [machineSheet, setMachineSheet] = useState(null)
  const [reassignTask, setReassignTask] = useState(null)
  const me = getOperator()

  const load = useCallback(() => {
    api.board().then(setBoard).catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  async function toggleOperator(op, reason) {
    await api.setOperatorAvailability(op.operatorId, reason ? { available: false, reason } : { available: true })
    setPersonSheet(null)
    load()
  }

  async function toggleMachine(m, reason) {
    await api.setMachineAvailability(m.machineId, reason ? { available: false, reason } : { available: true })
    setMachineSheet(null)
    load()
  }

  const s = board?.summary

  return (
    <div className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-8">
      <header className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Command Center</h1>
          <p className="text-cat-muted text-sm">{me?.name} · today</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="w-11 h-11 rounded-lg bg-cat-panel flex items-center justify-center">
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => {
              clearSession()
              location.reload()
            }}
            className="w-11 h-11 rounded-lg bg-cat-panel flex items-center justify-center"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {error && <div className="panel border-state-danger text-state-danger mb-3">{error}</div>}
      {!board && !error && <div className="panel text-cat-muted">Loading board...</div>}

      {board && (
        <>
          <div className="flex gap-2 mb-4">
            <Stat label="Tasks" value={s.totalTasks} />
            <Stat label="Out" value={s.operatorsOut} alert />
            <Stat label="Down" value={s.machinesDown} alert />
            <Stat label="To fix" value={s.tasksNeedingAction} alert />
          </div>

          <div className="flex gap-2 mb-4">
            {[
              ['roster', 'Roster', Users],
              ['machines', 'Machines', Truck]
            ].map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex-1 min-h-12 rounded-xl font-semibold flex items-center justify-center gap-2 ${
                  tab === k ? 'bg-cat-yellow text-black' : 'bg-cat-panel text-cat-muted'
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>

          {tab === 'roster' && (
            <div className="space-y-2">
              {board.roster.map((op) => {
                const stranded = !op.available && op.tasks.some((t) => t.status !== 'done')
                return (
                  <div key={op.operatorId} className={`panel ${stranded ? 'border-state-warn' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <button className="text-left min-w-0 flex-1" onClick={() => setPersonSheet(op)}>
                        <p className="font-bold truncate flex items-center gap-1.5">
                          {op.name}
                          {stranded && <AlertTriangle size={14} className="text-state-warn shrink-0" />}
                        </p>
                        <p className="text-cat-muted text-xs">
                          {op.skillLevel} · DNA {op.dna} · {op.loadMin} min
                          {!op.available && (
                            <span className="text-state-warn font-semibold">
                              {' '}
                              · {op.unavailability?.reason?.toUpperCase()}
                            </span>
                          )}
                        </p>
                      </button>
                    </div>

                    {op.tasks.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {op.tasks.map((t) => (
                          <button
                            key={t.taskId}
                            onClick={() => setReassignTask(t)}
                            className={`text-[11px] font-semibold rounded-lg px-2 py-1 ${
                              stranded ? 'bg-state-warn/20 text-state-warn' : 'bg-cat-dark text-cat-muted'
                            }`}
                          >
                            {t.taskType} · {t.machineId}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'machines' && (
            <div className="space-y-2">
              {board.machines.map((m) => (
                <button
                  key={m.machineId}
                  onClick={() => setMachineSheet(m)}
                  className={`panel w-full text-left ${m.available ? '' : 'border-state-danger'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold">{m.machineId}</p>
                      <p className="text-cat-muted text-xs">
                        {m.model} · {m.ageYears} yr
                        {!m.available && (
                          <span className="text-state-danger font-semibold">
                            {' '}
                            · {m.fault?.reason?.toUpperCase()}
                          </span>
                        )}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-lg ${
                        m.available ? 'bg-state-ok/15 text-state-ok' : 'bg-state-danger/15 text-state-danger'
                      }`}
                    >
                      {m.available ? 'UP' : 'DOWN'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <Sheet
        open={!!personSheet}
        title={personSheet?.name}
        subtitle={personSheet?.available ? 'Mark unavailable' : 'Currently unavailable'}
        onClose={() => setPersonSheet(null)}
      >
        <div className="space-y-2 pb-4">
          {personSheet?.available ? (
            OUT_REASONS.map((r) => (
              <button key={r} className="btn-ghost w-full capitalize" onClick={() => toggleOperator(personSheet, r)}>
                {r}
              </button>
            ))
          ) : (
            <button className="btn-primary w-full" onClick={() => toggleOperator(personSheet, null)}>
              Mark available again
            </button>
          )}
        </div>
      </Sheet>

      <Sheet
        open={!!machineSheet}
        title={machineSheet?.machineId}
        subtitle={machineSheet?.available ? 'Report a fault' : 'Currently out of service'}
        onClose={() => setMachineSheet(null)}
      >
        <div className="space-y-2 pb-4">
          {machineSheet?.available ? (
            FAULT_REASONS.map((r) => (
              <button key={r} className="btn-ghost w-full capitalize" onClick={() => toggleMachine(machineSheet, r)}>
                {r}
              </button>
            ))
          ) : (
            <button className="btn-primary w-full" onClick={() => toggleMachine(machineSheet, null)}>
              Back in service
            </button>
          )}
        </div>
      </Sheet>

      <ReassignSheet
        task={reassignTask}
        onClose={() => setReassignTask(null)}
        onDone={() => {
          setReassignTask(null)
          load()
        }}
      />
    </div>
  )
}
