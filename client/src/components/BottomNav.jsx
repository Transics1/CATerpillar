import { NavLink } from 'react-router-dom'
import { ClipboardCheck, ListTodo, ShieldAlert, GraduationCap, User } from 'lucide-react'

const items = [
  { to: '/shift', label: 'Shift', Icon: ClipboardCheck },
  { to: '/tasks', label: 'Tasks', Icon: ListTodo },
  { to: '/safety', label: 'Safety', Icon: ShieldAlert },
  { to: '/learn', label: 'Learn', Icon: GraduationCap },
  { to: '/me', label: 'Me', Icon: User }
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-cat-panel border-t border-cat-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex">
        {items.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 min-h-touch flex flex-col items-center justify-center gap-1 ${
                isActive ? 'text-cat-yellow' : 'text-cat-muted'
              }`
            }
          >
            <Icon size={22} strokeWidth={2.2} />
            <span className="text-[11px] font-semibold">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
