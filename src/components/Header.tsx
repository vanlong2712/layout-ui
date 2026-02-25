import { Link } from '@tanstack/react-router'

import { useState } from 'react'
import { Home, Menu, X } from 'lucide-react'
import { ThemeToggle } from '../components/ThemeToggle'
import { layoutDemos } from '../data/layout-demos'

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)
  // No longer needed: groupedExpanded state

  return (
    <>
      <header className="p-4 flex items-center bg-background border-b border-border text-foreground shadow-sm">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 hover:bg-accent rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>
        <h1 className="ml-4 text-xl font-semibold flex-1">
          <Link to="/">
            <img
              src="/tanstack-word-logo-white.svg"
              alt="TanStack Logo"
              className="h-10 dark:invert-0 invert"
            />
          </Link>
        </h1>
        <ThemeToggle />
      </header>

      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-sidebar text-sidebar-foreground shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
          <h2 className="text-xl font-bold">Navigation</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-sidebar-accent rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-sidebar-accent transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 transition-colors mb-2',
            }}
          >
            <Home size={20} />
            <span className="font-medium">Home</span>
          </Link>

          {/* Layout Demo Links (shared) */}
          {layoutDemos.map((demo) =>
            demo.disabled ? (
              <div
                key={demo.name}
                className="flex items-center gap-3 p-3 rounded-lg bg-sidebar-accent/60 border border-sidebar-border opacity-60 cursor-not-allowed select-none mb-2"
                aria-disabled="true"
              >
                <span className="shrink-0">{demo.icon}</span>
                <span className="font-medium">{demo.name}</span>
              </div>
            ) : (
              <Link
                key={demo.to}
                to={demo.to}
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-sidebar-accent transition-colors mb-2"
                activeProps={{
                  className:
                    'flex items-center gap-3 p-3 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 transition-colors mb-2',
                }}
              >
                <span className="shrink-0">{demo.icon}</span>
                <span className="font-medium">{demo.name}</span>
              </Link>
            ),
          )}
        </nav>
      </aside>
    </>
  )
}
