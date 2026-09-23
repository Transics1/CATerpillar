import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Screen from '../components/Screen.jsx'
import TaskCard from '../components/TaskCard.jsx'
import { api, getOperator } from '../lib/api.js'

export default function Tasks() {
  const [tasks, setTasks] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()
  const operator = getOperator()

  useEffect(() => {
    api.todaysTasks().then((r) => setTasks(r.tasks)).catch((e) => setError(e.message))
  }, [])

  async function start(task) {
    await api.startTask(task.taskId).catch(() => {})
    navigate(`/tasks/${task.taskId}/live`)
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
    >
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
