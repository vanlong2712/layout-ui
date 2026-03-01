// ─── Plugin re-exports ───────────────────────────────────────────────────────
// Each plugin is a focused Lexical component handling a single concern.

export { EditorRefPlugin } from './editor-ref-plugin'
export { HighlightsPlugin } from './highlights-plugin'
export { NLMarkerNavigationPlugin } from './navigation-plugin'
export {
  DirectionPlugin,
  KeyDownPlugin,
  PasteCleanupPlugin,
  ReadOnlySelectablePlugin,
} from './utility-plugins'

// Re-export mention plugin
export { MentionPlugin } from '../mention-plugin'
export type { MentionPluginProps } from '../mention-plugin'
