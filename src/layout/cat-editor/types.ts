// ─── Types ────────────────────────────────────────────────────────────────────

export interface ISuggestion {
  value: string
}

export interface ISpellCheckValidation {
  categoryId: string
  start: number
  end: number
  content: string
  message: string
  shortMessage: string
  suggestions: Array<ISuggestion>
  dictionaries?: Array<string>
}

export interface ISpellCheckRule {
  type: 'spellcheck'
  validations: Array<ISpellCheckValidation>
}

// ─── Glossary (generic term-matching) ─────────────────────────────────────────
// Covers LexiQA, TB Target, keyword search, and any future term-match rule.

export interface IGlossaryEntry {
  term: string
  description?: string
}

/** Generic term-highlighting rule.
 *  `label` controls CSS class (`cat-highlight-glossary-{label}`) and badge text.
 *  Examples: label='lexiqa', label='tb-target', label='search' */
export interface IGlossaryRule {
  type: 'glossary'
  label: string
  entries: Array<IGlossaryEntry>
}

export interface ISpecialCharEntry {
  /** Human-readable name shown in the popover, e.g. "Non-Breaking Space" */
  name: string
  /** Regex that matches one occurrence of this character */
  pattern: RegExp
}

export interface ISpecialCharRule {
  type: 'special-char'
  entries: Array<ISpecialCharEntry>
}

// ─── Tag collapsing ───────────────────────────────────────────────────────────
// Detects paired HTML tags and allows collapsing them to <1>, </1>, etc.

export interface ITagRule {
  type: 'tag'
  /** When true (default), innermost tag pairs are matched first. */
  detectInner?: boolean
  /** When true, tags become atomic (other highlights inside them are
   *  suppressed) and the CSS collapsed rendering kicks in.
   *  When false/undefined, tags can be split by search/glossary highlights. */
  collapsed?: boolean
}

export type MooRule =
  | ISpellCheckRule
  | IGlossaryRule
  | ISpecialCharRule
  | ITagRule

// ─── Rule highlight annotations ───────────────────────────────────────────────

export interface SpellCheckAnnotation {
  type: 'spellcheck'
  id: string
  data: ISpellCheckValidation
}

export interface GlossaryAnnotation {
  type: 'glossary'
  id: string
  data: { label: string; term: string; description?: string }
}

export interface SpecialCharAnnotation {
  type: 'special-char'
  id: string
  data: { name: string; char: string; codePoint: string }
}

export interface TagAnnotation {
  type: 'tag'
  id: string
  data: {
    tagNumber: number
    tagName: string
    isClosing: boolean
    isSelfClosing: boolean
    originalText: string
    displayText: string // e.g. '<1>', '</1>', '<2/>'
  }
}

export type RuleAnnotation =
  | SpellCheckAnnotation
  | GlossaryAnnotation
  | SpecialCharAnnotation
  | TagAnnotation

// Raw range from rule matching (before nesting resolution)
export interface RawRange {
  start: number
  end: number
  annotation: RuleAnnotation
}

// Non-overlapping segment with potentially nested annotations
export interface HighlightSegment {
  start: number
  end: number
  annotations: Array<RuleAnnotation>
}

// ─── Popover state ────────────────────────────────────────────────────────────

export interface PopoverState {
  visible: boolean
  x: number
  y: number
  ruleIds: Array<string>
}

// ─── Custom popover renderer ──────────────────────────────────────────────────

/** Props passed to the custom popover content renderer.
 *  Use this to fully replace the built-in popover UI for any annotation. */
export interface PopoverContentRendererProps {
  annotation: RuleAnnotation
  /** Call with a suggestion string to apply it (only relevant for spellcheck) */
  onSuggestionClick: (suggestion: string) => void
}

/** Render function for custom popover content.
 *  Return `undefined` / `null` to fall back to the default built-in renderer. */
export type PopoverContentRenderer = (
  props: PopoverContentRendererProps,
) => React.ReactNode

// ─── Imperative handle ────────────────────────────────────────────────────────

/** Imperative API exposed via `ref` on `<CATEditor>`. */
export interface CATEditorRef {
  /** Insert text at the current (or last saved) cursor position. */
  insertText: (text: string) => void
  /** Focus the editor. */
  focus: () => void
  /** Get the full plain-text content. */
  getText: () => string
}
