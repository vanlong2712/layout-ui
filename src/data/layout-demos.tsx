// Shared layout demo definitions for use in navbar and routes
import { SquareFunction } from 'lucide-react'

export const layoutDemos = [
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
