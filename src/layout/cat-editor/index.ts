// ─── Public API ──────────────────────────────────────────────────────────────

export { CATEditor, default } from './CATEditor'
export type { CATEditorProps } from './CATEditor'

export { CODEPOINT_DISPLAY_MAP, getEffectiveCodepointMap } from './constants'

export type {
  CATEditorRef,
  GlossaryAnnotation,
  HighlightSegment,
  IGlossaryEntry,
  IGlossaryRule,
  IQuoteRule,
  IQuoteRuleMapping,
  ISpecialCharEntry,
  ISpecialCharRule,
  ISpellCheckRule,
  ISpellCheckValidation,
  ISuggestion,
  ITagRule,
  MooRule,
  PopoverContentRenderer,
  PopoverContentRendererProps,
  PopoverState,
  QuoteAnnotation,
  RawRange,
  RuleAnnotation,
  SpellCheckAnnotation,
  SpecialCharAnnotation,
  TagAnnotation,
} from './types'
