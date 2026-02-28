// ─── CATEditor v2 — Public API ───────────────────────────────────────────────
// Modular architecture: plugins, hooks, and composition.
// Import CSS from v1 (shared styles).

import '../cat-editor/style.css'

export { CATEditor, default } from './CATEditor'
export type { CATEditorProps } from './CATEditor'

// Constants
export {
  CODEPOINT_DISPLAY_MAP,
  getEffectiveCodepointMap,
} from '../cat-editor/constants'

// Mention node (re-export from v1)
export {
  MentionNode,
  $createMentionNode,
  $isMentionNode,
  setMentionNodeConfig,
  getMentionModelText,
  getMentionPattern,
} from '../cat-editor/mention-node'
export type {
  SerializedMentionNode,
  MentionDOMRenderer,
  MentionNodeConfig,
} from '../cat-editor/mention-node'

// Mention plugin
export { MentionPlugin } from '../cat-editor/mention-plugin'
export type { MentionPluginProps } from '../cat-editor/mention-plugin'

// Types (clean — no deprecated)
export {
  HighlightSegmentSchema,
  KeywordsAnnotationSchema,
  KeywordsEntrySchema,
  KeywordsRuleSchema,
  LinkAnnotationSchema,
  LinkRuleSchema,
  MentionRuleSchema,
  MentionUserSchema,
  MooRuleSchema,
  PopoverStateSchema,
  QuoteAnnotationSchema,
  QuoteRuleMappingSchema,
  QuoteRuleSchema,
  RawRangeSchema,
  RuleAnnotationSchema,
  SpellCheckAnnotationSchema,
  SpellCheckRuleSchema,
  SpellCheckValidationSchema,
  SuggestionSchema,
  TagAnnotationSchema,
  TagRuleSchema,
} from '../cat-editor/types'

export type {
  CATEditorRef,
  HighlightSegment,
  IKeywordsEntry,
  IKeywordsRule,
  ILinkRule,
  IMentionRule,
  IMentionUser,
  IQuoteRule,
  IQuoteRuleMapping,
  ISpellCheckRule,
  ISpellCheckValidation,
  ISuggestion,
  ITagRule,
  KeywordsAnnotation,
  LinkAnnotation,
  MooRule,
  PopoverContentRenderer,
  PopoverContentRendererProps,
  PopoverState,
  QuoteAnnotation,
  RawRange,
  RuleAnnotation,
  SpellCheckAnnotation,
  TagAnnotation,
} from '../cat-editor/types'

// Plugins (available for advanced composition)
export {
  EditorRefPlugin,
  HighlightsPlugin,
  NLMarkerNavigationPlugin,
  DirectionPlugin,
  KeyDownPlugin,
  PasteCleanupPlugin,
  ReadOnlySelectablePlugin,
} from './plugins'

// Hooks (available for custom editor builds)
export { useFlash } from './hooks/use-flash'
export type { FlashControls } from './hooks/use-flash'
export { usePopoverHover } from './hooks/use-popover-hover'
export type {
  PopoverHoverOptions,
  PopoverHoverReturn,
} from './hooks/use-popover-hover'
export { useEditorHandle } from './hooks/use-editor-handle'
