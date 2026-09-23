import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic } from 'lucide-react'
import Screen from '../components/Screen.jsx'
import TaskCard from '../components/TaskCard.jsx'
import { api, getOperator } from '../lib/api.js'
import { listenOnce, parseIntent, speechSupported } from '../lib/voice.js'
import { speak } from '../lib/speech.js'

export default function Tasks() {
  const [tasks, setTasks] = useState(null)
  const [error, setError] = useState(null)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState(null)
  const navigate = useNavigate()
  const operator = getOperator()

  useEffect(() => {
    api.todaysTasks().then((r) => setTasks(r.tasks)).catch((e) => setError(e.message))
  }, [])

  async function start(task) {
    await api.startTask(task.taskId).catch(() => {})
    navigate(`/tasks/${task.taskId}/live`)
  }

  /**
   * Hands-free start. The operator names a task type ("start trenching") and we match it
   * against today's plan - so the command works without them knowing a task ID.
   */
  async function voiceCommand() {
    setListening(true)
    setHeard(null)
    try {
      const text = await listenOnce()
      setHeard(text)
      const { intent } = parseIntent(text)

      if (intent === 'start_task') {
        const spoken = text.toLowerCase()
        const match =
          tasks?.find((t) => spoken.includes(t.taskType.toLowerCase().split(' ')[0])) ?? tasks?.[0]
        if (match) {
          speak(`Starting ${match.taskType}`)
          await start(match)
          return
        }
      }
      if (intent === 'status') {
        const total = tasks?.reduce((s, t) => s + (t.prediction?.p50 ?? 0), 0) ?? 0
        speak(`You have ${tasks?.length ?? 0} tasks today, about ${Math.round(total / 60)} hours of work.`)
      } else if (intent === 'log_incident') {
        navigate('/safety')
      } else if (!intent) {
        speak('Sorry, I did not catch that. Try: start trenching.')
      }
    } catch {
      setHeard(null)
    } finally {
      setListening(false)
    }
  }

  const totalMin = tasks?.reduce((s, t) => s + (t.prediction?.p50 ?? 0), 0) ?? 0

  return (
    <Screen
      title="Today's Plan"
      subtitle={
        tasks
          ? `${tasks.length} tasks · about ${Math.round(totalMin / 60)}h ${Math.round(totalMin % 60)}m of work`
          : operator?.name
      }
      action={
        speechSupported() && (
          <button
            onClick={voiceCommand}
            aria-label="Voice command"
            className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
              listening ? 'bg-state-danger animate-pulse' : 'bg-cat-yellow text-black'
            }`}
          >
            <Mic size={22} strokeWidth={2.6} />
          </button>
        )
      }
    >
      {heard && (
        <div className="panel mb-3 py-2.5 text-sm">
          <span className="text-cat-muted">Heard: </span>
          <span className="font-semibold">{heard}</span>
        </div>
      )}
      {listening && (
        <div className="panel mb-3 py-2.5 text-sm text-cat-yellow font-semibold">
          Listening — try "start trenching"
        </div>
      )}

      {error && <div className="panel border-state-danger text-state-danger">{error}</div>}
      {!tasks && !error && <div className="panel text-cat-muted">Loading your plan...</div>}

      <div className="space-y-3">
        {tasks?.map((t) => (
          <TaskCard key={t.taskId} task={t} onStart={start} />
        ))}
      </div>

      {tasks?.length === 0 && (
        <div className="panel text-cat-muted">No tasks scheduled for today.</div>
      )}
    </Screen>
  )
}
