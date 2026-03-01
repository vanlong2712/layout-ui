import { createFileRoute } from '@tanstack/react-router'
import { CATEditorPerfDemo } from '@/layout/cat-editor-perf-demo'

export const Route = createFileRoute('/demo/cat-editor-perf')({
  component: CATEditorPerfDemo,
})
