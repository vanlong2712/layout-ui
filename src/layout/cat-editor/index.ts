// ─── Public API ──────────────────────────────────────────────────────────────

import './style.css'

export { CATEditor, default } from './CATEditor'
export type { CATEditorProps } from './CATEditor'

export { CODEPOINT_DISPLAY_MAP, getEffectiveCodepointMap } from './constants'
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
export { MentionPlugin } from './mention-plugin'
export type { MentionPluginProps } from './mention-plugin'

export {
  GlossaryEntrySchema,
  GlossaryRuleSchema,
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
  SpecialCharAnnotationSchema,
  SpecialCharEntrySchema,
  SpecialCharRuleSchema,
  SpellCheckAnnotationSchema,
  SpellCheckRuleSchema,
  SpellCheckValidationSchema,
  SuggestionSchema,
  TagAnnotationSchema,
  TagRuleSchema,
} from './types'

export type {
  CATEditorRef,
  GlossaryAnnotation,
  HighlightSegment,
  IGlossaryEntry,
  IGlossaryRule,
  IKeywordsEntry,
  IKeywordsRule,
  ILinkRule,
  IMentionRule,
  IMentionUser,
  IQuoteRule,
  IQuoteRuleMapping,
  ISpecialCharEntry,
  ISpecialCharRule,
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
  SpecialCharAnnotation,
  TagAnnotation,
} from './types'
