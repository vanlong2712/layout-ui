import { createFileRoute, Link } from '@tanstack/react-router'
import { SquareFunction } from 'lucide-react'

export const Route = createFileRoute('/')({ component: App })

function App() {
  // Smart, extensible home with layout component links
  const layoutDemos = [
    {
      name: 'Virtualized Select',
      description:
        'Advanced select with drag-and-drop, virtualization, and custom rendering.',
      to: '/demo/layout-select',
      icon: (
        <SquareFunction
          className="w-8 h-8 text-cyan-400"
          aria-label="Virtualized Select"
        />
      ),
    },
    {
      name: 'More coming soon...',
      description: 'Stay tuned for additional layout components and demos!',
      to: '#',
      icon: (
        <span
          className="w-8 h-8 flex items-center justify-center text-cyan-400 opacity-50"
          aria-label="Coming Soon"
        >
          ...
        </span>
      ),
      disabled: true,
    },
  ]

  return (
    <main className="min-h-screen bg-linear-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-start px-4 py-16">
      <div className="max-w-2xl w-full text-center mb-12">
        {/* <img
          src="/tanstack-circle-logo.png"
          alt="Logo"
          className="mx-auto w-24 h-24 md:w-32 md:h-32 mb-4"
        /> */}
        <h1 className="text-5xl md:text-6xl font-black text-white mb-2">
          <span className="text-gray-300">UI Playground</span>
        </h1>
        {/* <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-6">
          Explore and interact with modern, extensible UI layout components.
          Quickly prototype, test, and experience advanced features like
          virtualization, drag-and-drop, and more—all in one place.
        </p> */}
      </div>

      <section className="w-full max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-white mb-6 text-left">
          Layout Components
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {layoutDemos.map((demo) =>
            demo.disabled ? (
              <div
                key={demo.name}
                className="flex items-center gap-4 p-6 rounded-xl bg-slate-800/40 border border-slate-700 opacity-60 cursor-not-allowed select-none"
                aria-disabled="true"
              >
                <span className="shrink-0">{demo.icon}</span>
                <span className="flex flex-col items-start">
                  <span className="text-lg font-semibold text-white">
                    {demo.name}
                  </span>
                  <span className="text-gray-400 text-sm mt-1">
                    {demo.description}
                  </span>
                </span>
              </div>
            ) : (
              <Link
                key={demo.to}
                to={demo.to}
                className="flex items-center gap-4 p-6 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-cyan-500/70 transition-all duration-200 shadow-md hover:shadow-cyan-500/10 group"
              >
                <span className="shrink-0">{demo.icon}</span>
                <span className="flex flex-col items-start">
                  <span className="text-lg font-semibold text-white group-hover:text-cyan-400 transition-colors">
                    {demo.name}
                  </span>
                  <span className="text-gray-400 text-sm mt-1">
                    {demo.description}
                  </span>
                </span>
              </Link>
            ),
          )}
        </div>
      </section>
    </main>
  )
}
