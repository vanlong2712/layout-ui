// ─── CATEditor — Public API ──────────────────────────────────────────────────
// Modular architecture: plugins, hooks, and composition.

import './style.css'

export { CATEditor, default } from './CATEditor'
export type { CATEditorProps } from './CATEditor'

// Constants
export { CODEPOINT_DISPLAY_MAP, getEffectiveCodepointMap } from './constants'

// Mention node
export {
  MentionNode,
  $createMentionNode,
  $isMentionNode,
  setMentionNodeConfig,
  getMentionModelText,
  getMentionPattern,
} from './mention-node'
export type {
  SerializedMentionNode,
  MentionDOMRenderer,
  MentionNodeConfig,
} from './mention-node'

// Mention plugin
export { MentionPlugin } from './mention-plugin'
export type { MentionPluginProps } from './mention-plugin'

// Types & Zod schemas
export {
  HighlightSegmentSchema,
  KeywordsAnnotationSchema,
  KeywordsEntrySchema,
  KeywordsRuleSchema,
  LexiQAAnnotationSchema,
  LexiQARuleSchema,
  LexiQAValidationSchema,
  LinkAnnotationSchema,
  LinkRuleSchema,
  MentionRuleSchema,
  MentionUserSchema,
  MooRuleSchema,
  PopoverStateSchema,
  QAValidationBaseSchema,
  QuoteAnnotationSchema,
  QuoteRuleMappingSchema,
  QuoteRuleSchema,
  RangeHighlightAnnotationSchema,
  RangeHighlightRuleSchema,
  RangeHighlightSchema,
  RawRangeSchema,
  RuleAnnotationSchema,
  SpellCheckAnnotationSchema,
  SpellCheckRuleSchema,
  SpellCheckValidationSchema,
  SuggestionSchema,
  SuggestionObjectSchema,
  TagAnnotationSchema,
  TagRuleSchema,
  normalizeSuggestions,
  resolveSuggestionValue,
} from './types'

export type {
  CATEditorRef,
  HighlightSegment,
  IKeywordsEntry,
  IKeywordsRule,
  ILexiQARule,
  ILexiQAValidation,
  ILinkRule,
  IMentionRule,
  IMentionUser,
  IQAValidationBase,
  IRangeHighlight,
  IRangeHighlightRule,
  IQuoteRule,
  IQuoteRuleMapping,
  ISpellCheckRule,
  ISpellCheckValidation,
  ISuggestion,
  ITagRule,
  KeywordsAnnotation,
  LexiQAAnnotation,
  LinkAnnotation,
  MooRule,
  PopoverContentRenderer,
  PopoverContentRendererProps,
  PopoverState,
  QuoteAnnotation,
  RangeHighlightAnnotation,
  RawRange,
  RuleAnnotation,
  SpellCheckAnnotation,
  TagAnnotation,
} from './types'

// Plugins (available for advanced composition)
export {
  EditorRefPlugin,
  HighlightsPlugin,
  NLMarkerNavigationPlugin,
  DirectionPlugin,
  KeyDownPlugin,
  PasteCleanupPlugin,
  ReadOnlySelectablePlugin,
} from './plugins/index'

// Hooks (available for custom editor builds)
export { useFlash } from './hooks/use-flash'
export { FlashControlsSchema } from './hooks/use-flash'
export type { FlashControls } from './hooks/use-flash'
export { usePopoverHover } from './hooks/use-popover-hover'
export {
  PopoverHoverOptionsSchema,
  PopoverHoverReturnSchema,
} from './hooks/use-popover-hover'
export type {
  PopoverHoverOptions,
  PopoverHoverReturn,
} from './hooks/use-popover-hover'
export { useEditorHandle } from './hooks/use-editor-handle'
