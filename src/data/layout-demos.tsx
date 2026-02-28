// Shared layout demo definitions for use in navbar and routes
import { FileText, Layers, Quote, SquareFunction, Zap } from 'lucide-react'

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
    // Markdown text for features (used by README/docs and demo pages)
    featuresMd:
      `
- **Single & multiple selection** with chip-based display
- **Virtualized list** via ` +
      '@tanstack/react-virtual' +
      ` — handles 10,000+ options smoothly
- **Drag-and-drop sorting** (flat & grouped) via ` +
      '@dnd-kit' +
      `
- **Grouped options** with visual headers
- **Intelligent chip overflow** — auto-detects available space, shows partial (truncated) chips, and collapses into a \`+N\` overflow badge with tooltip
- **Async option loading** via \`queryFn\`
- **Search / filter** built-in
- **Keyboard accessible** — full keyboard navigation
- **Fully typed** — comprehensive TypeScript definitions
- **Tailwind CSS v4** — themeable via CSS custom properties (shadcn/ui compatible)
`,
  },
  {
    name: 'Detect Quotes',
    description:
      'Analyze text for single and double quote ranges with contraction escaping, nesting control, and inner-quote detection.',
    to: '/demo/detect-quotes',
    icon: (
      <Quote className="w-8 h-8 text-cyan-400" aria-label="Detect Quotes" />
    ),
  },
  {
    name: 'CAT Editor',
    description:
      'A Lexical-powered Computer-Assisted Translation editor with rule-based highlighting for spellcheck errors and LexiQA quality assurance terms.',
    to: '/demo/cat-editor',
    icon: (
      <FileText className="w-8 h-8 text-cyan-400" aria-label="CAT Editor" />
    ),
  },
  {
    name: 'CAT Editor Perf',
    description:
      'Stress-test: 1000 virtualized CAT editor rows with shared rule configuration and @tanstack/react-virtual.',
    to: '/demo/cat-editor-perf',
    icon: (
      <Zap className="w-8 h-8 text-amber-400" aria-label="CAT Editor Perf" />
    ),
  },
  {
    name: 'CAT Editor v2',
    description:
      'Modular CATEditor v2 — same functionality, refactored architecture with composable plugins and hooks.',
    to: '/demo/cat-editor-v2',
    icon: (
      <Layers className="w-8 h-8 text-cyan-400" aria-label="CAT Editor v2" />
    ),
  },
  {
    name: 'CAT Editor v2 Perf',
    description:
      'Performance stress-test using CATEditor v2 modular architecture with 1000 virtualized rows.',
    to: '/demo/cat-editor-v2-perf',
    icon: (
      <Zap className="w-8 h-8 text-amber-400" aria-label="CAT Editor v2 Perf" />
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
