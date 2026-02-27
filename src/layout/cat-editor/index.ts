// ─── Public API ──────────────────────────────────────────────────────────────

import './style.css'

export { CATEditor, default } from './CATEditor'
export type { CATEditorProps } from './CATEditor'

export { CODEPOINT_DISPLAY_MAP, getEffectiveCodepointMap } from './constants'

export type {
  CATEditorRef,
  GlossaryAnnotation,
  HighlightSegment,
  IGlossaryEntry,
  IGlossaryRule,
  ILinkRule,
  IMentionRule,
  IQuoteRule,
  IQuoteRuleMapping,
  ISpecialCharEntry,
  ISpecialCharRule,
  ISpellCheckRule,
  ISpellCheckValidation,
  ISuggestion,
  ITagRule,
  LinkAnnotation,
  MentionAnnotation,
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
