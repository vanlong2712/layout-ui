// ---------------------------------------------------------------------------
// layout-ui — public API
// ---------------------------------------------------------------------------
// Add new component exports here as the library grows.
// Each component module also has a dedicated deep-import entry point
// (e.g. "layout-ui/layout/select") configured in package.json "exports".
// ---------------------------------------------------------------------------

// Layout
export { LayoutSelect, default as LayoutSelectDefault } from './layout/select'
export { OptionSchema } from './layout/select'
export type { LayoutSelectProps, IOption, IconProp } from './layout/select'

// Layout — CATEditor
export { CATEditor } from './layout/cat-editor'
export type { CATEditorProps } from './layout/cat-editor'
export {
  KeywordsEntrySchema,
  KeywordsRuleSchema,
  MooRuleSchema,
  RuleAnnotationSchema,
  SpellCheckRuleSchema,
} from './layout/cat-editor'
export type {
  CATEditorRef,
  MooRule,
  ISpellCheckRule,
  IKeywordsRule,
  ISpecialCharRule,
  ITagRule,
  IQuoteRule,
  ILinkRule,
  IMentionRule,
  IMentionUser,
  RuleAnnotation,
  PopoverContentRenderer,
  PopoverContentRendererProps,
} from './layout/cat-editor'

// Utils — Detect Quotes
export { detectQuotes, BUILTIN_ESCAPE_PATTERNS } from './utils/detect-quotes'
export {
  QuoteRangeSchema,
  QuoteTypeSchema,
  DetectQuotesOptionsSchema,
  EscapePatternsSchema,
} from './utils/detect-quotes'
export type {
  QuoteRange,
  QuoteType,
  DetectQuotesOptions,
  EscapePatterns,
} from './utils/detect-quotes'
