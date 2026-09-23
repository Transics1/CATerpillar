import { Routes, Route, Navigate } from 'react-router-dom'
import BottomNav from './components/BottomNav.jsx'
import Shift from './screens/Shift.jsx'
import Tasks from './screens/Tasks.jsx'
import LiveTask from './screens/LiveTask.jsx'
import Safety from './screens/Safety.jsx'
import Learn from './screens/Learn.jsx'
import Me from './screens/Me.jsx'
import Report from './screens/Report.jsx'
import Supervisor from './screens/Supervisor.jsx'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 pb-24">
        <Routes>
          <Route path="/" element={<Navigate to="/tasks" replace />} />
          <Route path="/shift" element={<Shift />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/tasks/:taskId/live" element={<LiveTask />} />
          <Route path="/safety" element={<Safety />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/me" element={<Me />} />
          <Route path="/report/:shiftId" element={<Report />} />
          <Route path="/supervisor" element={<Supervisor />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}
