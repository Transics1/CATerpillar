import { useCallback, useEffect, useState } from 'react'
import { GraduationCap, AlertTriangle, CheckCircle2, TrendingUp, Fuel } from 'lucide-react'
import Screen from '../components/Screen.jsx'
import Sheet from '../components/Sheet.jsx'
import { api } from '../lib/api.js'
import { onEvent } from '../lib/socket.js'

const REASON_LABEL = {
  EXCESSIVE_IDLE: 'Excessive idling',
  SEATBELT_VIOLATION: 'Restraint unfastened',
  HARSH_OPERATION: 'Harsh operation',
  PROXIMITY_BREACH: 'Proximity breach',
  OVERHEAT: 'Engine overheat',
  FUEL_ANOMALY: 'High fuel per cycle',
  UNUSUAL_PATTERN: 'Unusual pattern' 
}

function evidenceText(reason) {
  if (!reason?.evidence) return null
  const e = reason.evidence
  if (e.idleRatio != null) return `You were idle ${Math.round(e.idleRatio * 100)}% of a 30-minute window`
  if (e.vibrationEvents != null) return `${e.vibrationEvents} harsh impacts in 30 minutes`
  if (e.nearestPersonnelM != null) return `Someone came within ${e.nearestPersonnelM} m while you were swinging`
  if (e.engineTempC != null) return `Engine reached ${e.engineTempC} C`
  if (e.violations != null) return `${e.violations} readings with the restraint unfastened`
  if (e.drivers) return `Flagged by the model: ${e.drivers.join(', ')}`
  return null
}

function LessonCard({ lesson, onOpen }) {
  const reason = lesson.reason
  return (
    <button onClick={() => onOpen(lesson)} className="panel w-full text-left border-cat-yellow/40">
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="text-state-warn shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-state-warn text-xs font-bold uppercase tracking-wide">
            {REASON_LABEL[reason?.type] ?? 'Assigned to you'}
          </p>
          <h3 className="font-bold mt-1 leading-snug">{lesson.title}</h3>
          {evidenceText(reason) && (
            <p className="text-cat-muted text-xs mt-1.5 leading-relaxed">{evidenceText(reason)}</p>
          )}
          <p className="text-cat-muted text-xs mt-2">
            {Math.round((lesson.durationSec ?? 90) / 60)} min
            {reason?.machineId ? ` · on ${reason.machineId}` : ''}
          </p>
        </div>
      </div>
    </button>
  )
}

export default function Learn() {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)

  const load = useCallback(() => {
    api.lessons().then(setData).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    return onEvent('lesson:assigned', load)
  }, [load])

  async function submit() {
    const quiz = open.quiz ?? []
    const correct = quiz.filter((q, i) => answers[i] === q.answerIndex).length
    const score = quiz.length ? Math.round((correct / quiz.length) * 100) : 100
    const r = await api.completeLesson(open.lessonId, score)
    setResult({ ...r, score })
    setOpen(null)
    setAnswers({})
    load()
  }

  const assigned = data?.assigned ?? []
  const completed = data?.completed ?? []

  return (
    <Screen
      title="Learn"
      subtitle={assigned.length ? `${assigned.length} assigned from your telemetry` : 'Nothing assigned right now'}
    >
      {!data && <div className="panel text-cat-muted">Loading...</div>}

      {assigned.length > 0 && (
        <div className="space-y-3 mb-6">
          {assigned.map((l) => (
            <LessonCard key={l.lessonId} lesson={l} onOpen={setOpen} />
          ))}
        </div>
      )}

      {data && !assigned.length && (
        <div className="panel text-cat-muted mb-6">
          <GraduationCap size={20} className="mb-2" />
          No coaching assigned. Lessons appear here automatically when your machine data shows a
          pattern worth fixing.
        </div>
      )}

      {completed.length > 0 && (
        <>
          <p className="label-muted mb-2">Completed</p>
          <div className="space-y-2">
            {completed.map((l) => (
              <div key={l.lessonId} className="panel flex items-center gap-2 py-3">
                <CheckCircle2 size={18} className="text-state-ok shrink-0" />
                <span className="text-sm font-semibold">{l.title}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* lesson + quiz */}
      <Sheet open={!!open} title={open?.title} subtitle={open?.reason ? REASON_LABEL[open.reason.type] : ''} onClose={() => setOpen(null)}>
        {open && (
          <div className="pb-4">
            <p className="text-sm leading-relaxed mb-5">{open.body}</p>

            {(open.quiz ?? []).map((q, i) => (
              <div key={i} className="mb-4">
                <p className="font-semibold text-sm mb-2">{q.q}</p>
                <div className="space-y-1.5">
                  {q.options.map((opt, oi) => (
                    <button
                      key={oi}
                      onClick={() => setAnswers((a) => ({ ...a, [i]: oi }))}
                      className={`w-full text-left min-h-12 px-4 rounded-xl border text-sm font-medium ${
                        answers[i] === oi
                          ? 'bg-cat-yellow text-black border-cat-yellow'
                          : 'bg-cat-dark border-cat-border'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <button
              className="btn-primary w-full mt-2"
              disabled={(open.quiz ?? []).some((_, i) => answers[i] == null)}
              onClick={submit}
            >
              Finish lesson
            </button>
          </div>
        )}
      </Sheet>

      {/* what completing it changed */}
      <Sheet open={!!result} title="Lesson complete" onClose={() => setResult(null)}>
        {result && (
          <div className="pb-4 space-y-4">
            <div className="panel bg-cat-dark">
              <p className="label-muted">Quiz</p>
              <p className="text-2xl font-extrabold">{result.score}%</p>
            </div>

            <div className="panel bg-cat-dark">
              <p className="label-muted flex items-center gap-1.5">
                <TrendingUp size={14} /> {result.affected} score
              </p>
              <p className="text-3xl font-extrabold tabular-nums">
                {result.dnaBefore[result.affected]}
                <span className="text-cat-muted mx-2">{'→'}</span>
                <span className="text-state-ok">{result.dnaAfter[result.affected]}</span>
              </p>
              <p className="text-cat-muted text-xs mt-1">
                Overall DNA {result.dnaBefore.overall} {'→'} {result.dnaAfter.overall}
              </p>
            </div>

            {result.projection && (
              <div className="panel bg-cat-dark border-state-ok">
                <p className="label-muted flex items-center gap-1.5">
                  <Fuel size={14} /> What this is worth
                </p>
                <p className="text-lg font-bold mt-1 leading-snug">{result.projection.headline}</p>
                {result.projection.costInr != null && (
                  <p className="text-state-ok font-extrabold text-2xl mt-1 tabular-nums">
                    {'₹'}
                    {result.projection.costInr}
                    <span className="text-cat-muted text-sm font-semibold"> · {result.projection.co2Kg} kg CO</span>
                    <span className="text-cat-muted text-sm font-semibold">{'₂'} saved/week</span>
                  </p>
                )}
                {result.projection.note && (
                  <p className="text-cat-muted text-xs mt-2">{result.projection.note}</p>
                )}
                <p className="text-cat-muted text-[11px] mt-2">Based on {result.projection.basis}</p>
              </div>
            )}

            {result.etaShiftPctPerTask !== 0 && (
              <p className="text-cat-muted text-xs text-center">
                Your task estimates adjust by {result.etaShiftPctPerTask}% from the next job.
              </p>
            )}

            <button className="btn-primary w-full" onClick={() => setResult(null)}>
              Done
            </button>
          </div>
        )}
      </Sheet>
    </Screen>
  )
}
