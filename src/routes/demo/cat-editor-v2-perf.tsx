import { createFileRoute } from '@tanstack/react-router'
import { CATEditorV2PerfDemo } from '@/layout/cat-editor-v2-perf-demo'

export const Route = createFileRoute('/demo/cat-editor-v2-perf')({
  component: CATEditorV2PerfDemo,
})
