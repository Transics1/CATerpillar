export default function Screen({ title, subtitle, children, action }) {
  return (
    <div className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <header className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="text-cat-muted text-sm mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </div>
  )
}
