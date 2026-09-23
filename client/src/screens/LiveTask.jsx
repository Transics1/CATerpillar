import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, ChevronLeft } from 'lucide-react'
import PaceTracker from '../components/PaceTracker.jsx'
import IdleWasteMeter from '../components/IdleWasteMeter.jsx'
import { api } from '../lib/api.js'
import { onEvent } from '../lib/socket.js'
import { speak } from '../lib/speech.js'

const NUDGE_AFTER_MIN = 3

export default function LiveTask() {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const [pace, setPace] = useState(null)
  const [task, setTask] = useState(null)
  const [finishing, setFinishing] = useState(false)
  const nudgedRef = useRef(false)

  useEffect(() => {
    api.task(taskId).then((r) => setTask(r.task)).catch(() => {})
    api.pace(taskId).then((r) => setPace(r.pace)).catch(() => {})

    return onEvent('pace:update', (p) => {
      if (p.taskId !== taskId) return
      setPace(p)

      // Once per streak - hands are on the levers, so a visual-only alert goes unseen.
      if (p.idleStreakMin >= NUDGE_AFTER_MIN && !nudgedRef.current) {
        nudgedRef.current = true
        navigator.vibrate?.([200, 100, 200])
        speak(`Idling ${p.idleStreakMin} minutes. Shut down to save fuel.`)
      }
      if (p.idleStreakMin === 0) nudgedRef.current = false
    })
  }, [taskId])

  async function finish() {
    setFinishing(true)
    try {
      await api.completeTask(taskId)
      navigate('/tasks')
    } catch {
      setFinishing(false)
    }
  }

  return (
    <div className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <button
        onClick={() => navigate('/tasks')}
        className="flex items-center gap-1 text-cat-muted min-h-touch -ml-2 px-2"
      >
        <ChevronLeft size={20} /> Today's plan
      </button>

      <h1 className="text-2xl font-extrabold tracking-tight mt-1">
        {task?.taskType ?? 'Task in progress'}
      </h1>
      <p className="text-cat-muted text-sm mb-4">
        {task ? `${task.machineId} · ${task.siteZone}` : ''}
      </p>

      {!pace && <div className="panel text-cat-muted">Waiting for machine data...</div>}

      {pace && (
        <div className="space-y-3">
          <PaceTracker pace={pace} />
          <IdleWasteMeter pace={pace} />

          <button className="btn-primary w-full" onClick={finish} disabled={finishing}>
            <CheckCircle2 size={20} strokeWidth={2.6} />
            {finishing ? 'Finishing...' : 'Finish task'}
          </button>
        </div>
      )}
    </div>
  )
}
