import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, GraduationCap, X } from 'lucide-react'
import { onEvent } from '../lib/socket.js'
import { speak } from '../lib/speech.js'

const SEVERITY = {
  high: 'border-state-danger',
  medium: 'border-state-warn',
  low: 'border-cat-border'
}

// Alerts have to reach the operator wherever they are; burying them in a tab they would have
// to think to open defeats the point of detecting anything.
export default function AlertHost() {
  const [toasts, setToasts] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    const push = (t) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((list) => [...list.slice(-2), { ...t, id }])
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.ttl ?? 9000)
    }

    const offAnomaly = onEvent('anomaly:detected', (a) => {
      navigator.vibrate?.(a.severity === 'high' ? [300, 120, 300] : [200])
      speak(a.message)
      push({ kind: 'anomaly', severity: a.severity, title: a.message })
    })

    const offLesson = onEvent('lesson:assigned', (l) => {
      push({
        kind: 'lesson',
        severity: 'low',
        title: l.title,
        subtitle: 'Assigned from your machine data',
        action: () => navigate('/learn'),
        ttl: 12000
      })
    })

    return () => {
      offAnomaly()
      offLesson()
    }
  }, [navigate])

  if (!toasts.length) return null

  return (
    <div className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[60] space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => {
            t.action?.()
            setToasts((list) => list.filter((x) => x.id !== t.id))
          }}
          className={`panel bg-cat-panel/95 backdrop-blur border-2 ${SEVERITY[t.severity] ?? ''} flex items-start gap-3 shadow-2xl ${
            t.action ? 'active:scale-[0.99]' : ''
          }`}
        >
          {t.kind === 'lesson' ? (
            <GraduationCap size={20} className="text-cat-yellow shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={20} className="text-state-warn shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm leading-snug">{t.title}</p>
            {t.subtitle && <p className="text-cat-muted text-xs mt-0.5">{t.subtitle}</p>}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setToasts((list) => list.filter((x) => x.id !== t.id))
            }}
            className="shrink-0 text-cat-muted"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
