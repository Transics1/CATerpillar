import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import BottomNav from './components/BottomNav.jsx'
import AlertHost from './components/AlertHost.jsx'
import Login from './screens/Login.jsx'
import Board from './screens/admin/Board.jsx'
import { getOperator } from './lib/api.js'
import Shift from './screens/Shift.jsx'
import Tasks from './screens/Tasks.jsx'
import LiveTask from './screens/LiveTask.jsx'
import Safety from './screens/Safety.jsx'
import Learn from './screens/Learn.jsx'
import Me from './screens/Me.jsx'
import Report from './screens/Report.jsx'

export default function App() {
  const [operator, setOperator] = useState(getOperator)

  if (!operator) return <Login onLoggedIn={setOperator} />

  // Supervisors get their own shell. The operator bottom nav (Shift / Tasks / Safety / Learn)
  // is meaningless for someone managing a site rather than running a machine.
  if (operator.role === 'supervisor') return <Board />

  return (
    <div className="min-h-screen flex flex-col">
      <AlertHost />
      <main className="flex-1 pb-24">
        <Routes>
          <Route path="/" element={<Navigate to="/tasks" replace />} />
          <Route path="/shift" element={<Shift />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/tasks/:taskId/live" element={<LiveTask />} />
          <Route path="/safety" element={<Safety />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/me" element={<Me />} />
          <Route path="/report" element={<Report />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}
