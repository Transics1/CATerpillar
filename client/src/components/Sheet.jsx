import { X } from 'lucide-react'

// Actions stay in thumb reach rather than at the top of a tall screen.
export default function Sheet({ open, title, subtitle, onClose, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-cat-panel border-t border-cat-border rounded-t-3xl max-h-[85vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="sticky top-0 bg-cat-panel px-4 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-cat-border">
          <div className="min-w-0">
            <h2 className="text-lg font-bold truncate">{title}</h2>
            {subtitle && <p className="text-cat-muted text-sm">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-cat-dark">
            <X size={20} />
          </button>
        </div>
        <div className="px-4 pt-4">{children}</div>
      </div>
    </div>
  )
}
