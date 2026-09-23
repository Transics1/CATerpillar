import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert, CloudOff, Radio, Mic, Check } from 'lucide-react'
import Screen from '../components/Screen.jsx'
import Sheet from '../components/Sheet.jsx'
import { api } from '../lib/api.js'
import { enqueue, pendingCount, onQueueChange, newClientId } from '../lib/queue.js'
import { listenOnce, speechSupported } from '../lib/voice.js'

const TYPES = ['Near miss', 'Equipment damage', 'Ground condition', 'Injury', 'Other']
const SEVERITIES = ['low', 'medium', 'high']

const ALERT_LABEL = {
  EXCESSIVE_IDLE: 'Excessive idling',
  SEATBELT_VIOLATION: 'Restraint unfastened',
  HARSH_OPERATION: 'Harsh operation',
  PROXIMITY_BREACH: 'Proximity breach',
  OVERHEAT: 'Engine overheat',
  UNUSUAL_PATTERN: 'Unusual pattern'
}

export default function Safety() {
  const [incidents, setIncidents] = useState([])
  const [alerts, setAlerts] = useState([])
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ type: TYPES[0], severity: 'medium', rawText: '' })
  const [listening, setListening] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => {
    api.incidents().then((r) => setIncidents(r.incidents)).catch(() => {})
    api.alerts().then((r) => setAlerts(r.alerts)).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    pendingCount().then(setPending)
    const offQueue = onQueueChange((n) => {
      setPending(n)
      if (n === 0) load()
    })
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      offQueue()
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [load])

  async function dictate() {
    setListening(true)
    try {
      const text = await listenOnce()
      setForm((f) => ({ ...f, rawText: `${f.rawText} ${text}`.trim() }))
    } catch {
      /* mic unavailable - typing still works */
    }
    setListening(false)
  }

  async function submit() {
    const payload = {
      clientId: newClientId(),
      type: form.type,
      severity: form.severity,
      rawText: form.rawText,
      occurredAt: new Date().toISOString()
    }
    // Always through the queue, so the offline path is the tested one.
    await enqueue('incident', payload)
    setOpen(false)
    setForm({ type: TYPES[0], severity: 'medium', rawText: '' })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    load()
  }

  return (
    <Screen
      title="Safety"
      subtitle={online ? 'Connected' : 'Offline — reports will sync'}
      action={
        !online || pending > 0 ? (
          <span className="flex items-center gap-1.5 text-state-warn text-xs font-bold bg-state-warn/15 px-2 py-1.5 rounded-lg">
            <CloudOff size={14} />
            {pending} queued
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-state-ok text-xs font-bold bg-state-ok/15 px-2 py-1.5 rounded-lg">
            <Radio size={14} /> Synced
          </span>
        )
      }
    >
      {saved && (
        <div className="panel border-state-ok text-state-ok mb-3 flex items-center gap-2 text-sm font-semibold">
          <Check size={18} /> Report saved{!online && ' — will sync when back online'}
        </div>
      )}

      <button className="btn-primary w-full mb-5" onClick={() => setOpen(true)}>
        <ShieldAlert size={20} strokeWidth={2.6} />
        Report an incident
      </button>

      {alerts.length > 0 && (
        <>
          <p className="label-muted mb-2">Detected today</p>
          <div className="space-y-2 mb-6">
            {alerts.map((a) => (
              <div key={a.anomalyId} className="panel py-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{ALERT_LABEL[a.type] ?? a.type}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      a.severity === 'high'
                        ? 'bg-state-danger/20 text-state-danger'
                        : 'bg-state-warn/20 text-state-warn'
                    }`}
                  >
                    {a.severity.toUpperCase()}
                  </span>
                </div>
                <p className="text-cat-muted text-xs mt-1">
                  {a.machineId} · {new Date(a.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="label-muted mb-2">My reports</p>
      <div className="space-y-2">
        {incidents.map((i) => (
          <div key={i.clientId} className="panel py-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{i.type}</span>
              <span className="text-cat-muted text-[10px] font-bold uppercase">{i.source}</span>
            </div>
            {i.description && <p className="text-cat-muted text-xs mt-1">{i.description}</p>}
          </div>
        ))}
        {!incidents.length && <p className="text-cat-muted text-sm">No reports yet.</p>}
      </div>

      <Sheet open={open} title="Report an incident" subtitle="Works offline" onClose={() => setOpen(false)}>
        <div className="pb-4 space-y-4">
          <div>
            <p className="label-muted mb-2">What happened</p>
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                  className={`min-h-12 rounded-xl text-sm font-semibold px-2 ${
                    form.type === t ? 'bg-cat-yellow text-black' : 'bg-cat-dark text-cat-muted'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label-muted mb-2">Severity</p>
            <div className="flex gap-2">
              {SEVERITIES.map((s) => (
                <button
                  key={s}
                  onClick={() => setForm((f) => ({ ...f, severity: s }))}
                  className={`flex-1 min-h-12 rounded-xl text-sm font-semibold capitalize ${
                    form.severity === s ? 'bg-cat-yellow text-black' : 'bg-cat-dark text-cat-muted'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="label-muted">Description</p>
              {speechSupported() && (
                <button
                  onClick={dictate}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg ${
                    listening ? 'bg-state-danger text-white' : 'bg-cat-dark text-cat-yellow'
                  }`}
                >
                  <Mic size={14} />
                  {listening ? 'Listening...' : 'Speak'}
                </button>
              )}
            </div>
            <textarea
              value={form.rawText}
              onChange={(e) => setForm((f) => ({ ...f, rawText: e.target.value }))}
              rows={4}
              placeholder="Describe what happened..."
              className="w-full bg-cat-dark border border-cat-border rounded-xl p-3 text-base"
            />
          </div>

          <button className="btn-primary w-full" disabled={!form.rawText.trim()} onClick={submit}>
            Save report
          </button>
        </div>
      </Sheet>
    </Screen>
  )
}
