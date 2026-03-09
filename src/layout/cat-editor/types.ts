// ─── Types ────────────────────────────────────────────────────────────────────

import { z } from 'zod'
import type { EditorUpdateOptions, LexicalEditor } from 'lexical'
import type React from 'react'
import { DetectQuotesOptionsSchema } from '@/utils/detect-quotes'

/** A structured suggestion with an explicit `value` property. */
export const SuggestionObjectSchema = z.object({
  value: z.string(),
})

/**
 * A suggestion can be either a plain string or an object `{ value: string }`.
 * Both forms are accepted in every `suggestions` array throughout the API.
 */
export const SuggestionSchema = z.union([SuggestionObjectSchema, z.string()])
export type ISuggestion = z.infer<typeof SuggestionSchema>

// ─── Suggestion helpers ───────────────────────────────────────────────────────

/** Resolve a single suggestion entry to its string value. */
export function resolveSuggestionValue(s: ISuggestion): string {
  return typeof s === 'string' ? s : s.value
}

/** Normalize a mixed `ISuggestion[]` to `{ value: string }[]`. */
export function normalizeSuggestions(
  suggestions: Array<ISuggestion>,
): Array<{ value: string }> {
  return suggestions.map((s) => (typeof s === 'string' ? { value: s } : s))
}

// ─── Shared QA validation base ────────────────────────────────────────────────
// Common fields between spellcheck and lexiqa validations.
// Not used as a standalone schema — exists for documentation & DRY.

export const QAValidationBaseSchema = z.object({
  start: z.number(),
  end: z.number(),
  suggestions: z.array(SuggestionSchema),
  categoryId: z.string().optional(),
  message: z.string().optional(),
  shortMessage: z.string().optional(),
  dictionaries: z.array(z.string()).optional(),
})
export type IQAValidationBase = z.infer<typeof QAValidationBaseSchema>

// ─── Spellcheck ───────────────────────────────────────────────────────────────

export const SpellCheckValidationSchema = z.object({
  categoryId: z.string(),
  start: z.number(),
  end: z.number(),
  content: z.string(),
  message: z.string(),
  shortMessage: z.string(),
  suggestions: z.array(SuggestionSchema),
  dictionaries: z.array(z.string()).optional(),
})
export type ISpellCheckValidation = z.infer<typeof SpellCheckValidationSchema>

/** @deprecated Use `RangeHighlightRuleSchema` instead. */
export const SpellCheckRuleSchema = z.object({
  type: z.literal('spellcheck'),
  validations: z.array(SpellCheckValidationSchema),
})
/** @deprecated Use `IRangeHighlightRule` instead. */
export type ISpellCheckRule = z.infer<typeof SpellCheckRuleSchema>

// ─── LexiQA ──────────────────────────────────────────────────────────────────

export const LexiQAValidationSchema = z.object({
  category: z.string(),
  end: z.number(),
  errorid: z.string(),
  ignored: z.boolean(),
  insource: z.boolean(),
  length: z.number(),
  module: z.string(),
  start: z.number(),
  msg: z.string(),
  categoryId: z.string().optional(),
  suggestions: z.array(SuggestionSchema),
  rowId: z.string().optional(),
  columnId: z.string().optional(),
  shortMessage: z.string().optional(),
  dictionaries: z.array(z.string()).optional(),
  message: z.string().optional(),
})
export type ILexiQAValidation = z.infer<typeof LexiQAValidationSchema>

/** @deprecated Use `RangeHighlightRuleSchema` instead. */
export const LexiQARuleSchema = z.object({
  type: z.literal('lexiqa'),
  validations: z.array(LexiQAValidationSchema),
})
/** @deprecated Use `IRangeHighlightRule` instead. */
export type ILexiQARule = z.infer<typeof LexiQARuleSchema>

// ─── Range Highlight (unified QA rule) ────────────────────────────────────────
// Replaces SpellCheckRule + LexiQARule with a single, extensible rule type.
// Consumers may use `type: 'spellcheck'`, `type: 'lexiqa'`, or any custom
// string to identify the validation source.

/** A single QA-style range highlight entry. */
export const RangeHighlightSchema = z.object({
  /** Identifies the validation source: `'spellcheck'`, `'lexiqa'`, or a custom string. */
  type: z.string(),
  /** Start character offset (global, 0-based). */
  start: z.number(),
  /** End character offset (exclusive). */
  end: z.number(),
  /** The original validation payload — either SpellCheck or LexiQA data.
   *  Custom integrations may extend this union. */
  validation: z.union([SpellCheckValidationSchema, LexiQAValidationSchema]),
})
export type IRangeHighlight = z.infer<typeof RangeHighlightSchema>

/** Unified range-highlight rule.  Pass an array of `RangeHighlight` items
 *  covering spellcheck, LexiQA, or any custom QA source. */
export const RangeHighlightRuleSchema = z.object({
  type: z.literal('range-highlight'),
  highlights: z.array(RangeHighlightSchema),
})
export type IRangeHighlightRule = z.infer<typeof RangeHighlightRuleSchema>

// ─── Keywords (generic term-matching) ─────────────────────────────────────────
// Covers LexiQA, TB Target, keyword search, missing keywords, and any future
// term-match rule.

/** Schema for a single keyword entry used for pattern-based matching. */
export const KeywordsEntrySchema = z.object({
  /** Exact string to match.  Takes priority over `pattern`.
   *  The match is literal (no regex interpretation).
   *  Pass an empty string to skip exact matching and rely on `pattern`. */
  keyword: z.string(),
  /** Regex source string used for matching.
   *  Example: `'hello|hi'` matches both "hello" and "hi".
   *  Ignored when `keyword` is provided. */
  pattern: z.string().optional(),
  /** Optional description shown in the popover. */
  description: z.string().optional(),
  /** When `true`, the highlighted node is atomic — the caret cannot be
   *  placed inside it and it behaves as a single indivisible unit.
   *  Use this for invisible / special characters, markers, etc. */
  atomic: z.boolean().optional(),
  /** Optional visible symbol to display in the editor instead of the
   *  raw matched text.  Only meaningful when `atomic` is `true`.
   *  Overrides the built-in `CODEPOINT_DISPLAY_MAP` for the matched
   *  character's code-point(s). */
  displaySymbol: z.string().optional(),
})
export type IKeywordsEntry = z.infer<typeof KeywordsEntrySchema>

/** Generic term-highlighting rule.
 *  `label` controls CSS class (`cat-highlight-keyword-{label}`) and badge text.
 *  Examples: label='lexiqa', label='tb-target', label='search' */
export const KeywordsRuleSchema = z.object({
  type: z.literal('keyword'),
  label: z.string(),
  entries: z.array(KeywordsEntrySchema),
})
export type IKeywordsRule = z.infer<typeof KeywordsRuleSchema>

/** @deprecated Use `KeywordsEntrySchema` instead. */
export const GlossaryEntrySchema = KeywordsEntrySchema
/** @deprecated Use `IKeywordsEntry` instead. */
export type IGlossaryEntry = IKeywordsEntry
/** @deprecated Use `KeywordsRuleSchema` instead. */
export const GlossaryRuleSchema = KeywordsRuleSchema
/** @deprecated Use `IKeywordsRule` instead. */
export type IGlossaryRule = IKeywordsRule

/** @deprecated Use `KeywordsEntrySchema` with `atomic: true` instead. */
export const SpecialCharEntrySchema = z.object({
  name: z.string(),
  pattern: z.instanceof(RegExp),
  displaySymbol: z.string().optional(),
})
/** @deprecated Use `IKeywordsEntry` with `atomic: true` instead. */
export type ISpecialCharEntry = z.infer<typeof SpecialCharEntrySchema>

/** @deprecated Use `IKeywordsRule` with atomic entries instead. */
export const SpecialCharRuleSchema = z.object({
  type: z.literal('special-char'),
  entries: z.array(SpecialCharEntrySchema),
})
/** @deprecated Use `IKeywordsRule` with atomic entries instead. */
export type ISpecialCharRule = z.infer<typeof SpecialCharRuleSchema>

// ─── Tag collapsing ───────────────────────────────────────────────────────────
// Detects paired HTML tags and allows collapsing them to <1>, </1>, etc.

export const TagRuleSchema = z.object({
  type: z.literal('tag'),
  /** Alias used for CSS class scoping and UI identification.
   *  When set, tag nodes receive `cat-highlight-tag-{alias}` CSS class. */
  alias: z.string().optional(),
  detectInner: z.boolean().optional(),
  collapsed: z.boolean().optional(),
  collapseScope: z.enum(['all', 'html-only']).optional(),
  pattern: z.string().optional(),
  /** When `true`, matched tags not found in `expectedTags` are flagged
   *  with the `cat-highlight-tag-{alias}-missing` CSS class. */
  checkExpectedTags: z.boolean().optional(),
  /** List of expected tag strings.  Only used when `checkExpectedTags` is `true`.
   *  Matched tags whose `originalText` is NOT in this list are marked missing. */
  expectedTags: z.array(z.string()).optional(),
})
export type ITagRule = z.infer<typeof TagRuleSchema>

// ─── Quote detection ──────────────────────────────────────────────────────────
// Uses detect-quotes utility and replaces matched quotes with configured chars.

export const QuoteRuleMappingSchema = z.object({
  opening: z.string(),
  closing: z.string(),
})
export type IQuoteRuleMapping = z.infer<typeof QuoteRuleMappingSchema>

export const QuoteRuleSchema = z.object({
  type: z.literal('quote'),
  singleQuote: QuoteRuleMappingSchema,
  doubleQuote: QuoteRuleMappingSchema,
  detectInTags: z.boolean().optional(),
  detectOptions: DetectQuotesOptionsSchema.optional(),
})
export type IQuoteRule = z.infer<typeof QuoteRuleSchema>

// ─── Link detection ───────────────────────────────────────────────────────────

export const LinkRuleSchema = z.object({
  type: z.literal('link'),
  pattern: z.string().optional(),
})
export type ILinkRule = z.infer<typeof LinkRuleSchema>

// ─── Mention detection ────────────────────────────────────────────────────────

/** A user that can be mentioned via the @ trigger. */
export const MentionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z
    .custom<() => React.ReactNode>((v) => typeof v === 'function')
    .optional(),
})
export type IMentionUser = z.infer<typeof MentionUserSchema>

export const MentionRuleSchema = z.object({
  type: z.literal('mention'),
  users: z.array(MentionUserSchema),
  trigger: z.string().optional(),
})
export type IMentionRule = z.infer<typeof MentionRuleSchema>

export const MooRuleSchema = z.discriminatedUnion('type', [
  SpellCheckRuleSchema,
  LexiQARuleSchema,
  RangeHighlightRuleSchema,
  KeywordsRuleSchema,
  TagRuleSchema,
  QuoteRuleSchema,
  LinkRuleSchema,
  MentionRuleSchema,
])
export type MooRule = z.infer<typeof MooRuleSchema>

// ─── Rule highlight annotations ───────────────────────────────────────────────

/** @deprecated Use `RangeHighlightAnnotationSchema` instead. */
export const SpellCheckAnnotationSchema = z.object({
  type: z.literal('spellcheck'),
  id: z.string(),
  data: SpellCheckValidationSchema,
})
/** @deprecated Use `RangeHighlightAnnotation` instead. */
export type SpellCheckAnnotation = z.infer<typeof SpellCheckAnnotationSchema>

/** @deprecated Use `RangeHighlightAnnotationSchema` instead. */
export const LexiQAAnnotationSchema = z.object({
  type: z.literal('lexiqa'),
  id: z.string(),
  data: LexiQAValidationSchema,
})
/** @deprecated Use `RangeHighlightAnnotation` instead. */
export type LexiQAAnnotation = z.infer<typeof LexiQAAnnotationSchema>

/** Annotation emitted by a `range-highlight` rule. */
export const RangeHighlightAnnotationSchema = z.object({
  type: z.literal('range-highlight'),
  id: z.string(),
  data: z.object({
    /** The source kind: `'spellcheck'`, `'lexiqa'`, or custom. */
    highlightType: z.string(),
    /** Original validation payload. */
    validation: z.union([SpellCheckValidationSchema, LexiQAValidationSchema]),
  }),
})
export type RangeHighlightAnnotation = z.infer<
  typeof RangeHighlightAnnotationSchema
>

export const KeywordsAnnotationSchema = z.object({
  type: z.literal('keyword'),
  id: z.string(),
  data: z.object({
    label: z.string(),
    /** The keyword (exact match) that produced this annotation. */
    keyword: z.string(),
    pattern: z.string().optional(),
    description: z.string().optional(),
    /** When `true`, the highlight node is atomic (caret cannot enter). */
    atomic: z.boolean().optional(),
    /** Display symbol override for the matched text. */
    displaySymbol: z.string().optional(),
    /** The matched character(s) — populated for atomic entries. */
    matchedText: z.string().optional(),
    /** Unicode codepoint(s) string (e.g. "U+00A0") — populated for atomic entries. */
    codePoint: z.string().optional(),
  }),
})
export type KeywordsAnnotation = z.infer<typeof KeywordsAnnotationSchema>

/** @deprecated Use `KeywordsAnnotation` instead. */
export type GlossaryAnnotation = KeywordsAnnotation

/** @deprecated Use `KeywordsAnnotationSchema` with `atomic: true` instead. */
export const SpecialCharAnnotationSchema = z.object({
  type: z.literal('special-char'),
  id: z.string(),
  data: z.object({
    name: z.string(),
    char: z.string(),
    codePoint: z.string(),
  }),
})
/** @deprecated Use `KeywordsAnnotation` with `atomic: true` instead. */
export type SpecialCharAnnotation = z.infer<typeof SpecialCharAnnotationSchema>

export const TagAnnotationSchema = z.object({
  type: z.literal('tag'),
  id: z.string(),
  data: z.object({
    tagNumber: z.number(),
    tagName: z.string(),
    isClosing: z.boolean(),
    isSelfClosing: z.boolean(),
    originalText: z.string(),
    displayText: z.string(),
    isHtml: z.boolean(),
    /** Rule alias — passed through from `ITagRule.alias`. */
    alias: z.string().optional(),
    /** `true` when `checkExpectedTags` is enabled and the matched tag
     *  was NOT found in `expectedTags`. */
    isMissing: z.boolean().optional(),
  }),
})
export type TagAnnotation = z.infer<typeof TagAnnotationSchema>

export const QuoteAnnotationSchema = z.object({
  type: z.literal('quote'),
  id: z.string(),
  data: z.object({
    quoteType: z.union([z.literal('single'), z.literal('double')]),
    position: z.union([z.literal('opening'), z.literal('closing')]),
    originalChar: z.string(),
    replacementChar: z.string(),
  }),
})
export type QuoteAnnotation = z.infer<typeof QuoteAnnotationSchema>

export const LinkAnnotationSchema = z.object({
  type: z.literal('link'),
  id: z.string(),
  data: z.object({
    url: z.string(),
    displayText: z.string(),
  }),
})
export type LinkAnnotation = z.infer<typeof LinkAnnotationSchema>

export const RuleAnnotationSchema = z.discriminatedUnion('type', [
  SpellCheckAnnotationSchema,
  LexiQAAnnotationSchema,
  RangeHighlightAnnotationSchema,
  KeywordsAnnotationSchema,
  TagAnnotationSchema,
  QuoteAnnotationSchema,
  LinkAnnotationSchema,
])
export type RuleAnnotation = z.infer<typeof RuleAnnotationSchema>

/** Raw range from rule matching (before nesting resolution). */
export const RawRangeSchema = z.object({
  start: z.number(),
  end: z.number(),
  annotation: RuleAnnotationSchema,
})
export type RawRange = z.infer<typeof RawRangeSchema>

/** Non-overlapping segment with potentially nested annotations. */
export const HighlightSegmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  annotations: z.array(RuleAnnotationSchema),
})
export type HighlightSegment = z.infer<typeof HighlightSegmentSchema>

// ─── Popover state ────────────────────────────────────────────────────────────

export const PopoverStateSchema = z.object({
  visible: z.boolean(),
  x: z.number(),
  y: z.number(),
  anchorRect: z
    .object({
      top: z.number(),
      left: z.number(),
      bottom: z.number(),
      right: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  ruleIds: z.array(z.string()),
})
export type PopoverState = z.infer<typeof PopoverStateSchema>

// ─── Custom popover renderer ──────────────────────────────────────────────────

/** Props passed to the custom popover content renderer.
 *  Use this to fully replace the built-in popover UI for any annotation. */
export interface PopoverContentRendererProps {
  annotation: RuleAnnotation
  /** Call with a suggestion string to apply it (only relevant for spellcheck) */
  onSuggestionClick: (suggestion: string) => void
}

/** Render function for custom popover content.
 *  - Return a `ReactNode` (JSX) to replace the built-in popover UI.
 *  - Return `undefined` to fall back to the default built-in renderer.
 *  - Return `null` to suppress the popover entirely for this annotation. */
export type PopoverContentRenderer = (
  props: PopoverContentRendererProps,
) => React.ReactNode | undefined

// ─── Imperative handle ────────────────────────────────────────────────────────

/** Imperative API exposed via `ref` on `<CATEditor>`. */
export interface CATEditorRef {
  /** Insert text at the current (or last saved) cursor position. */
  insertText: (text: string) => void
  /** Focus the editor. */
  focus: () => void
  /** Get the full plain-text content. */
  getText: () => string
  /** Replace all occurrences of `search` with `replacement` in the editor
   *  content.  Returns the number of replacements made. */
  replaceAll: (search: string, replacement: string) => number
  /** Temporarily highlight editor elements matching `annotationId` with a
   *  pink "flash" overlay.  The highlight is automatically removed after
   *  `durationMs` (default 5 000 ms), when the user edits the text, or
   *  when `clearFlash` / another `flashHighlight` call is made. */
  flashHighlight: (annotationId: string, durationMs?: number) => void
  /** Temporarily highlight text between `start` and `end` (global character
   *  offsets, matching the positions used by rules / annotations) with a
   *  pink flash overlay.  Auto-removed after `durationMs` (default 5 000 ms),
   *  on user edit, or when `clearFlash` is called. */
  flashRange: (start: number, end: number, durationMs?: number) => void
  /** Remove any active flash highlight immediately. */
  clearFlash: () => void
  /** Replace all editor content with new text (supports newlines).
   *  Pass `options` to forward Lexical `EditorUpdateOptions` (e.g. `{ tag: 'my-tag' }`).
   */
  setText: (text: string, options?: EditorUpdateOptions) => void
  /** Return the current caret / selection as global character offsets.
   *  Returns `null` when the editor has no selection. */
  getSelection: () => { anchor: number; focus: number } | null
  /** Focus the editor and place the caret at the very start (offset 0). */
  focusStart: () => void
  /** Focus the editor and place the caret at the very end of the content. */
  focusEnd: () => void
  /** Set the selection using global character offsets.
   *  Pass the same `anchor` and `focus` for a collapsed caret.
   *  The editor is focused automatically. */
  setSelection: (anchor: number, focus: number) => void
  /** Return `true` when the Lexical editor's root element has DOM focus. */
  isFocused: () => boolean
  /** Return the underlying Lexical editor instance, or `null` if not yet
   *  mounted.  Useful for advanced scenarios such as dispatching commands
   *  (e.g. `UNDO_COMMAND` / `REDO_COMMAND`) or registering listeners
   *  externally when the built-in history plugin is disabled. */
  getEditor: () => LexicalEditor | null
}
