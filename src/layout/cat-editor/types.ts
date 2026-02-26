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

export interface ILexiQARule {
  type: 'lexiqa'
  terms: Array<string>
}

export interface ITBTargetEntry {
  term: string
  description?: string
}

export interface ITBTargetRule {
  type: 'tb-target'
  entries: Array<ITBTargetEntry>
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

export type MooRule =
  | ISpellCheckRule
  | ILexiQARule
  | ITBTargetRule
  | ISpecialCharRule

// ─── Rule highlight annotations ───────────────────────────────────────────────

// Discriminated annotation union — allows TypeScript narrowing in popovers

export interface SpellCheckAnnotation {
  type: 'spellcheck'
  id: string
  data: ISpellCheckValidation
}

export interface LexiQAAnnotation {
  type: 'lexiqa'
  id: string
  data: { term: string }
}

export interface TBTargetAnnotation {
  type: 'tb-target'
  id: string
  data: ITBTargetEntry
}

export interface SpecialCharAnnotation {
  type: 'special-char'
  id: string
  data: { name: string; char: string; codePoint: string }
}

export type RuleAnnotation =
  | SpellCheckAnnotation
  | LexiQAAnnotation
  | TBTargetAnnotation
  | SpecialCharAnnotation

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
