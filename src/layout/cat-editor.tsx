import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  $addUpdateTag,
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  TextNode,
} from 'lexical'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'

import type {
  EditorConfig,
  ElementNode,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedTextNode,
} from 'lexical'

import { cn } from '@/lib/utils'

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

// ─── Rule highlight type ──────────────────────────────────────────────────────

// Discriminated annotation union — allows TypeScript narrowing in popovers
interface SpellCheckAnnotation {
  type: 'spellcheck'
  id: string
  data: ISpellCheckValidation
}

interface LexiQAAnnotation {
  type: 'lexiqa'
  id: string
  data: { term: string }
}

interface TBTargetAnnotation {
  type: 'tb-target'
  id: string
  data: ITBTargetEntry
}

interface SpecialCharAnnotation {
  type: 'special-char'
  id: string
  data: { name: string; char: string; codePoint: string }
}

/**
 * Visual display symbols for special / invisible characters.
 * Used in both the popover and inline badges so users can
 * immediately recognise the character without memorising code-points.
 */
export const SPECIAL_CHAR_DISPLAY_MAP: Record<string, string> = {
  Ampersand: '&',
  Tab: '⇥',
  'Non-Breaking Space': '⍽',
  'En Space': '␣',
  'Em Space': '␣',
  'Thin Space': '·',
  'Ideographic Space': '□',
  'Hair Space': '·',
  'Zero-Width Space': '∅',
  'Zero-Width Non-Joiner': '⊘',
  'Zero-Width Joiner': '⊕',
  'Word Joiner': '⁀',
  'BOM / Zero-Width No-Break Space': '◊',
  'Carriage Return': '↵',
  'Form Feed': '␌',
  'Null Character': '␀',
  'Line Break': '↩',
}

/**
 * Reverse lookup: code-point → visible display symbol.
 * Used by HighlightNode to replace invisible characters with
 * visible placeholders in the editor DOM.
 */
const CODEPOINT_DISPLAY_MAP: Record<number, string> = {
  0x0000: '␀',
  0x0009: '⇥',
  0x000a: '↩',
  0x000c: '␌',
  0x000d: '↵',
  0x00a0: '⍽',
  0x2002: '␣',
  0x2003: '␣',
  0x2009: '·',
  0x200a: '·',
  0x200b: '∅',
  0x200c: '⊘',
  0x200d: '⊕',
  0x2060: '⁀',
  0x3000: '□',
  0xfeff: '◊',
}

/** Replace invisible / special characters with visible display symbols. */
function replaceInvisibleChars(text: string): string {
  let result = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    result += CODEPOINT_DISPLAY_MAP[cp] ?? ch
  }
  return result
}

type RuleAnnotation =
  | SpellCheckAnnotation
  | LexiQAAnnotation
  | TBTargetAnnotation
  | SpecialCharAnnotation

// Raw range from rule matching (before nesting resolution)
interface RawRange {
  start: number
  end: number
  annotation: RuleAnnotation
}

// Non-overlapping segment with potentially nested annotations
interface HighlightSegment {
  start: number
  end: number
  annotations: Array<RuleAnnotation>
}

// ─── HighlightNode ────────────────────────────────────────────────────────────

/** Prefix for line-break indicator node ruleIds — used to skip them when
 *  collecting text so they don't duplicate on re-highlight passes. */
const NL_MARKER_PREFIX = '__nl-'

interface SerializedHighlightNode extends SerializedTextNode {
  highlightTypes: string
  ruleIds: string
}

export class HighlightNode extends TextNode {
  __highlightTypes: string
  __ruleIds: string

  static getType(): string {
    return 'highlight'
  }

  static clone(node: HighlightNode): HighlightNode {
    return new HighlightNode(
      node.__text,
      node.__highlightTypes,
      node.__ruleIds,
      node.__key,
    )
  }

  constructor(
    text: string,
    highlightTypes: string,
    ruleIds: string,
    key?: NodeKey,
  ) {
    super(text, key)
    this.__highlightTypes = highlightTypes
    this.__ruleIds = ruleIds
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config)
    dom.classList.add('cat-highlight')
    for (const t of this.__highlightTypes.split(',')) {
      dom.classList.add(`cat-highlight-${t}`)
    }
    if (this.__highlightTypes.includes(',')) {
      dom.classList.add('cat-highlight-nested')
    }
    dom.dataset.highlightTypes = this.__highlightTypes
    dom.dataset.ruleIds = this.__ruleIds

    // NL-marker nodes are purely decorative — prevent selection but allow
    // cursor placement nearby (no contentEditable=false, which would block carets)
    if (this.__ruleIds.startsWith(NL_MARKER_PREFIX)) {
      dom.style.userSelect = 'none'
      dom.classList.add('cat-highlight-nl-marker')
    }

    // Special-char nodes in token mode: cursor can only sit before/after,
    // so it's safe to replace textContent with the visible display symbol.
    if (this.__highlightTypes.split(',').includes('special-char')) {
      const replaced = replaceInvisibleChars(this.__text)
      if (replaced !== this.__text) {
        dom.textContent = replaced
      }
    }

    return dom
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const updated = super.updateDOM(prevNode, dom, config)
    if (prevNode.__highlightTypes !== this.__highlightTypes) {
      for (const t of prevNode.__highlightTypes.split(',')) {
        dom.classList.remove(`cat-highlight-${t}`)
      }
      dom.classList.remove('cat-highlight-nested')
      for (const t of this.__highlightTypes.split(',')) {
        dom.classList.add(`cat-highlight-${t}`)
      }
      if (this.__highlightTypes.includes(',')) {
        dom.classList.add('cat-highlight-nested')
      }
      dom.dataset.highlightTypes = this.__highlightTypes
    }
    if (prevNode.__ruleIds !== this.__ruleIds) {
      dom.dataset.ruleIds = this.__ruleIds
    }

    // Re-apply invisible char replacement after any DOM updates
    if (this.__highlightTypes.split(',').includes('special-char')) {
      const replaced = replaceInvisibleChars(this.__text)
      if (replaced !== this.__text) {
        dom.textContent = replaced
      }
    }

    return updated
  }

  static importJSON(json: SerializedHighlightNode): HighlightNode {
    const node = new HighlightNode(json.text, json.highlightTypes, json.ruleIds)
    node.setFormat(json.format)
    node.setDetail(json.detail)
    node.setMode(json.mode)
    node.setStyle(json.style)
    return node
  }

  exportJSON(): SerializedHighlightNode {
    return {
      ...super.exportJSON(),
      type: 'highlight',
      highlightTypes: this.__highlightTypes,
      ruleIds: this.__ruleIds,
    }
  }

  /** NL-marker nodes must not leak the display symbol ↩ into
   *  clipboard or getTextContent() calls — they are purely visual. */
  getTextContent(): string {
    if (this.__ruleIds.startsWith(NL_MARKER_PREFIX)) return ''
    return super.getTextContent()
  }

  canInsertTextBefore(): boolean {
    if (this.__ruleIds.startsWith(NL_MARKER_PREFIX)) return false
    return true
  }

  canInsertTextAfter(): boolean {
    if (this.__ruleIds.startsWith(NL_MARKER_PREFIX)) return false
    return true
  }

  isTextEntity(): boolean {
    return false
  }
}

function $createHighlightNode(
  text: string,
  highlightTypes: string,
  ruleIds: string,
): HighlightNode {
  const node = new HighlightNode(text, highlightTypes, ruleIds)
  // Special-char and NL-marker nodes are atomic — cannot be split or typed into
  if (
    highlightTypes.split(',').includes('special-char') ||
    ruleIds.startsWith(NL_MARKER_PREFIX)
  ) {
    node.setMode('token')
  }
  return node
}

function $isHighlightNode(
  node: LexicalNode | null | undefined,
): node is HighlightNode {
  return node instanceof HighlightNode
}

// ─── Highlight computation (sweep-line with nesting) ──────────────────────────

function computeHighlightSegments(
  text: string,
  rules: Array<MooRule>,
): Array<HighlightSegment> {
  // 1. Collect all raw ranges from rules
  const rawRanges: Array<RawRange> = []

  for (const rule of rules) {
    if (rule.type === 'spellcheck') {
      for (const v of rule.validations) {
        if (v.start >= 0 && v.end <= text.length && v.start < v.end) {
          rawRanges.push({
            start: v.start,
            end: v.end,
            annotation: {
              type: 'spellcheck',
              id: `sc-${v.start}-${v.end}`,
              data: v,
            },
          })
        }
      }
    } else if (rule.type === 'lexiqa') {
      for (const term of rule.terms) {
        if (!term) continue
        const lowerText = text.toLowerCase()
        const lowerTerm = term.toLowerCase()
        let idx = 0
        while ((idx = lowerText.indexOf(lowerTerm, idx)) !== -1) {
          rawRanges.push({
            start: idx,
            end: idx + term.length,
            annotation: {
              type: 'lexiqa',
              id: `lq-${idx}-${idx + term.length}`,
              data: { term },
            },
          })
          idx += term.length
        }
      }
    } else if (rule.type === 'tb-target') {
      for (const entry of rule.entries) {
        if (!entry.term) continue
        const lowerText = text.toLowerCase()
        const lowerTerm = entry.term.toLowerCase()
        let idx = 0
        while ((idx = lowerText.indexOf(lowerTerm, idx)) !== -1) {
          rawRanges.push({
            start: idx,
            end: idx + entry.term.length,
            annotation: {
              type: 'tb-target',
              id: `tb-${idx}-${idx + entry.term.length}`,
              data: entry,
            },
          })
          idx += entry.term.length
        }
      }
    } else {
      // special-char
      for (const entry of rule.entries) {
        // Make a global copy of the pattern so we can iterate all matches
        const flags = entry.pattern.flags.includes('g')
          ? entry.pattern.flags
          : entry.pattern.flags + 'g'
        const re = new RegExp(entry.pattern.source, flags)
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const matchStr = m[0]
          const cp = matchStr
            .split('')
            .map(
              (c) =>
                'U+' +
                (c.codePointAt(0) ?? 0)
                  .toString(16)
                  .toUpperCase()
                  .padStart(4, '0'),
            )
            .join(' ')
          rawRanges.push({
            start: m.index,
            end: m.index + matchStr.length,
            annotation: {
              type: 'special-char',
              id: `sp-${m.index}-${m.index + matchStr.length}`,
              data: { name: entry.name, char: matchStr, codePoint: cp },
            },
          })
        }
      }
    }
  }

  if (rawRanges.length === 0) return []

  // 2. Sweep-line: collect all unique boundary points
  const points = new Set<number>()
  for (const r of rawRanges) {
    points.add(r.start)
    points.add(r.end)
  }
  const sortedPoints = [...points].sort((a, b) => a - b)

  // 3. For each pair of consecutive points, find all covering ranges
  //    This naturally handles nesting: overlapping ranges produce segments
  //    that carry ALL applicable annotations.
  const segments: Array<HighlightSegment> = []
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const segStart = sortedPoints[i]
    const segEnd = sortedPoints[i + 1]
    const annotations = rawRanges
      .filter((r) => r.start <= segStart && r.end >= segEnd)
      .map((r) => r.annotation)
    if (annotations.length > 0) {
      segments.push({ start: segStart, end: segEnd, annotations })
    }
  }

  return segments
}

// ─── Highlights Plugin ────────────────────────────────────────────────────────

interface HighlightsPluginProps {
  rules: Array<MooRule>
  annotationMapRef: React.MutableRefObject<Map<string, RuleAnnotation>>
}

// ─── Selection ↔ global-offset helpers ────────────────────────────────────────

/** Map a Lexical selection point (nodeKey + offset) to a global char offset,
 *  skipping NL-marker indicator nodes. */
function $pointToGlobalOffset(nodeKey: string, offset: number): number {
  const root = $getRoot()
  const paragraphs = root.getChildren()
  let global = 0

  for (let pi = 0; pi < paragraphs.length; pi++) {
    if (pi > 0) global += 1 // \n between paragraphs
    const p = paragraphs[pi]

    // Selection sits on the paragraph element itself (e.g. empty paragraph)
    if (p.getKey() === nodeKey) {
      if ('getChildren' in p) {
        const children = (p as ElementNode).getChildren()
        let childChars = 0
        for (let ci = 0; ci < Math.min(offset, children.length); ci++) {
          const child = children[ci]
          if (
            $isHighlightNode(child) &&
            child.__ruleIds.startsWith(NL_MARKER_PREFIX)
          )
            continue
          childChars += child.getTextContent().length
        }
        return global + childChars
      }
      return global
    }

    if (!('getChildren' in p)) continue
    for (const child of (p as ElementNode).getChildren()) {
      const isNlMarker =
        $isHighlightNode(child) && child.__ruleIds.startsWith(NL_MARKER_PREFIX)

      if (child.getKey() === nodeKey) {
        // If cursor landed on a NL-marker node, clamp to end-of-line
        // (= current global offset, which is past all real text in this para)
        if (isNlMarker) return global
        return global + offset
      }

      if (isNlMarker) continue
      global += child.getTextContent().length
    }
  }
  return global
}

/** Map a global character offset back to a Lexical node key + offset. */
function $globalOffsetToPoint(
  target: number,
): { key: string; offset: number; type: 'text' | 'element' } | null {
  const root = $getRoot()
  const paragraphs = root.getChildren()
  let remaining = target

  for (let pi = 0; pi < paragraphs.length; pi++) {
    if (pi > 0) {
      if (remaining <= 0) {
        const p = paragraphs[pi]
        if ('getChildren' in p) {
          for (const child of (p as ElementNode).getChildren()) {
            if (
              $isHighlightNode(child) &&
              child.__ruleIds.startsWith(NL_MARKER_PREFIX)
            )
              continue
            return { key: child.getKey(), offset: 0, type: 'text' }
          }
        }
        return { key: paragraphs[pi].getKey(), offset: 0, type: 'element' }
      }
      remaining -= 1 // \n
    }

    const p = paragraphs[pi]
    if (!('getChildren' in p)) continue

    for (const child of (p as ElementNode).getChildren()) {
      if (
        $isHighlightNode(child) &&
        child.__ruleIds.startsWith(NL_MARKER_PREFIX)
      )
        continue
      const len = child.getTextContent().length
      if (remaining <= len) {
        return { key: child.getKey(), offset: remaining, type: 'text' }
      }
      remaining -= len
    }
  }

  // Fallback: end of last text node
  for (let pi = paragraphs.length - 1; pi >= 0; pi--) {
    const p = paragraphs[pi]
    if ('getChildren' in p) {
      const children = (p as ElementNode).getChildren()
      for (let ci = children.length - 1; ci >= 0; ci--) {
        const child = children[ci]
        if (
          $isHighlightNode(child) &&
          child.__ruleIds.startsWith(NL_MARKER_PREFIX)
        )
          continue
        return {
          key: child.getKey(),
          offset: child.getTextContent().length,
          type: 'text',
        }
      }
    }
  }

  return null
}

function HighlightsPlugin({ rules, annotationMapRef }: HighlightsPluginProps) {
  const [editor] = useLexicalComposerContext()
  const rafRef = useRef<number | null>(null)

  const applyHighlights = useCallback(() => {
    editor.update(
      () => {
        // Tag so our own listener skips this update
        $addUpdateTag('cat-highlights')

        const root = $getRoot()

        // 1. Collect plain text content (flatten paragraphs).
        //    Skip line-break marker nodes (prefixed __nl-) so that
        //    the ↩ display symbol doesn't compound on each pass.
        const paragraphs = root.getChildren()
        const lines: Array<string> = []
        for (const p of paragraphs) {
          let lineText = ''
          if ('getChildren' in p) {
            for (const child of (p as ElementNode).getChildren()) {
              if (
                $isHighlightNode(child) &&
                child.__ruleIds.startsWith(NL_MARKER_PREFIX)
              ) {
                continue
              }
              lineText += child.getTextContent()
            }
          } else {
            lineText = p.getTextContent()
          }
          lines.push(lineText)
        }
        const fullText = lines.join('\n')

        // 2. Compute highlight segments (supports nesting)
        const segments = computeHighlightSegments(fullText, rules)

        // 3. Update annotation map for popover
        const newMap = new Map<string, RuleAnnotation>()
        for (const seg of segments) {
          for (const ann of seg.annotations) {
            newMap.set(ann.id, ann)
          }
        }
        annotationMapRef.current = newMap

        // ── Save selection as global offsets before rebuilding ──
        const prevSelection = $getSelection()
        let savedAnchor: number | null = null
        let savedFocus: number | null = null
        if ($isRangeSelection(prevSelection)) {
          savedAnchor = $pointToGlobalOffset(
            prevSelection.anchor.key,
            prevSelection.anchor.offset,
          )
          savedFocus = $pointToGlobalOffset(
            prevSelection.focus.key,
            prevSelection.focus.offset,
          )
        }

        // 4. Rebuild the content tree with highlights
        root.clear()

        if (fullText.length === 0) {
          const p = $createParagraphNode()
          p.append($createTextNode(''))
          root.append(p)
          return
        }

        const textLines = fullText.split('\n')
        let globalOffset = 0

        for (const line of textLines) {
          const paragraph = $createParagraphNode()
          const lineStart = globalOffset
          const lineEnd = globalOffset + line.length

          // Filter segments within this line
          const lineSegments = segments.filter(
            (s) => s.start < lineEnd && s.end > lineStart,
          )

          let pos = lineStart
          for (const seg of lineSegments) {
            const sStart = Math.max(seg.start, lineStart)
            const sEnd = Math.min(seg.end, lineEnd)

            // Plain text before highlight
            if (sStart > pos) {
              paragraph.append($createTextNode(fullText.slice(pos, sStart)))
            }

            // Highlighted text — carries all annotation types & IDs
            const types = [...new Set(seg.annotations.map((a) => a.type))].join(
              ',',
            )
            const ids = seg.annotations.map((a) => a.id).join(',')
            paragraph.append(
              $createHighlightNode(fullText.slice(sStart, sEnd), types, ids),
            )

            pos = sEnd
          }

          // Remaining plain text after last highlight
          if (pos < lineEnd) {
            paragraph.append($createTextNode(fullText.slice(pos, lineEnd)))
          }

          // Line-break indicator: \n sits at lineEnd in fullText but is a
          // paragraph boundary in Lexical — it never appears as inline text.
          // Append a visible ↩ symbol with a __nl- prefixed ruleId so we
          // can skip it when collecting text on the next pass.
          const nlPos = lineEnd
          if (nlPos < fullText.length && fullText[nlPos] === '\n') {
            const nlSegments = segments.filter(
              (s) => s.start <= nlPos && s.end > nlPos,
            )
            if (nlSegments.length > 0) {
              const nlAnns = nlSegments.flatMap((s) => s.annotations)
              const types = [...new Set(nlAnns.map((a) => a.type))].join(',')
              const ids = nlAnns.map((a) => a.id).join(',')
              const symbol = CODEPOINT_DISPLAY_MAP[0x000a]
              // Ensure there's a text node before the NL marker so the
              // cursor has a landing spot (NL markers are contentEditable=false)
              if (paragraph.getChildrenSize() === 0) {
                paragraph.append($createTextNode(''))
              }
              paragraph.append(
                $createHighlightNode(symbol, types, NL_MARKER_PREFIX + ids),
              )
            }
          }

          // Ensure paragraph has at least one child
          if (paragraph.getChildrenSize() === 0) {
            paragraph.append($createTextNode(''))
          }

          root.append(paragraph)
          globalOffset = lineEnd + 1 // +1 for \n
        }

        // ── Restore selection at the equivalent position ──
        if (savedAnchor !== null && savedFocus !== null) {
          const anchorPt = $globalOffsetToPoint(savedAnchor)
          const focusPt = $globalOffsetToPoint(savedFocus)
          if (anchorPt && focusPt) {
            const sel = $createRangeSelection()
            sel.anchor.set(anchorPt.key, anchorPt.offset, anchorPt.type)
            sel.focus.set(focusPt.key, focusPt.offset, focusPt.type)
            $setSelection(sel)
          }
        }
      },
      { tag: 'historic' },
    )
  }, [editor, rules, annotationMapRef])

  // Run on mount and when rules change
  useEffect(() => {
    applyHighlights()
  }, [applyHighlights])

  // Re-run highlights after any content change (typing, paste, undo, …).
  // Skip our own 'cat-highlights' updates to avoid infinite loops.
  // The 'historic' tag keeps recomputation out of the undo stack.
  useEffect(() => {
    const unregister = editor.registerUpdateListener(({ tags }) => {
      if (tags.has('cat-highlights')) return
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        applyHighlights()
      })
    })
    return () => {
      unregister()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [editor, applyHighlights])

  return null
}

// ─── Editor Ref Plugin ────────────────────────────────────────────────────────

function EditorRefPlugin({
  editorRef,
}: {
  editorRef: React.MutableRefObject<LexicalEditor | null>
}) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    editorRef.current = editor
  }, [editor, editorRef])
  return null
}

// ─── Popover Components ───────────────────────────────────────────────────────

interface PopoverState {
  visible: boolean
  x: number
  y: number
  ruleIds: Array<string>
}

function SpellCheckPopoverContent({
  data,
  onSuggestionClick,
}: {
  data: ISpellCheckValidation
  onSuggestionClick: (suggestion: string) => void
}) {
  return (
    <div className="space-y-2.5 p-3 max-w-sm">
      <div className="flex items-center gap-2">
        <span className="cat-badge cat-badge-spell">
          {data.shortMessage || 'Spelling'}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {data.categoryId}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-foreground">{data.message}</p>
      {data.content && (
        <p className="text-xs text-muted-foreground">
          Found:{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-destructive-foreground">
            {data.content}
          </code>
        </p>
      )}
      {data.suggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Suggestions:
          </p>
          <div className="flex flex-wrap gap-1">
            {data.suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                className="cat-suggestion-btn"
                onClick={() => onSuggestionClick(s.value)}
              >
                {s.value}
              </button>
            ))}
          </div>
        </div>
      )}
      {data.dictionaries && data.dictionaries.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Dictionaries: {data.dictionaries.join(', ')}
        </p>
      )}
    </div>
  )
}

function LexiQAPopoverContent({ data }: { data: { term: string } }) {
  return (
    <div className="p-3 max-w-xs space-y-2">
      <span className="cat-badge cat-badge-lexiqa">LexiQA</span>
      <p className="text-sm leading-relaxed text-foreground">
        Term flagged:{' '}
        <strong className="font-semibold text-foreground">{data.term}</strong>
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        This term has been flagged by LexiQA quality assurance. Please review
        for consistency and accuracy.
      </p>
    </div>
  )
}

function TBTargetPopoverContent({ data }: { data: ITBTargetEntry }) {
  return (
    <div className="p-3 max-w-xs space-y-2">
      <span className="cat-badge cat-badge-tb-target">TB Target</span>
      <p className="text-sm leading-relaxed text-foreground">
        Terminology:{' '}
        <strong className="font-semibold text-foreground">{data.term}</strong>
      </p>
      {data.description ? (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {data.description}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground leading-relaxed">
          This term is tracked by the Term Base. Verify correct usage and
          consistency with approved terminology.
        </p>
      )}
    </div>
  )
}

function SpecialCharPopoverContent({
  data,
}: {
  data: { name: string; char: string; codePoint: string }
}) {
  const displaySymbol =
    SPECIAL_CHAR_DISPLAY_MAP[data.name] ??
    (data.char.trim() === '' ? '·' : data.char)

  return (
    <div className="p-3 max-w-xs space-y-3">
      <span className="cat-badge cat-badge-special-char">Special Char</span>

      {/* Large centered visual symbol */}
      <div className="flex items-center justify-center">
        <span className="inline-flex items-center justify-center min-w-12 min-h-12 rounded-lg border-2 border-border bg-muted px-3 py-2 text-2xl font-bold font-mono text-foreground select-none">
          {displaySymbol}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-foreground text-center">
        <strong className="font-semibold">{data.name}</strong>
      </p>
      <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
          {data.codePoint}
        </code>
      </div>
    </div>
  )
}

function HighlightPopover({
  state,
  annotationMap,
  onSuggestionClick,
  onDismiss,
  onPopoverEnter,
}: {
  state: PopoverState
  annotationMap: Map<string, RuleAnnotation>
  onSuggestionClick: (suggestion: string, ruleId: string) => void
  onDismiss: () => void
  onPopoverEnter: () => void
}) {
  const popoverRef = useRef<HTMLDivElement>(null)

  // Adjust position to stay within viewport
  const [adjustedPos, setAdjustedPos] = useState({ x: state.x, y: state.y })

  useEffect(() => {
    if (!state.visible || !popoverRef.current) {
      setAdjustedPos({ x: state.x, y: state.y })
      return
    }
    const rect = popoverRef.current.getBoundingClientRect()
    let x = state.x
    let y = state.y + 6

    if (x + rect.width > window.innerWidth - 16) {
      x = window.innerWidth - rect.width - 16
    }
    if (x < 16) x = 16
    if (y + rect.height > window.innerHeight - 16) {
      // Show above instead
      y = state.y - rect.height - 6
    }
    setAdjustedPos({ x, y })
  }, [state.visible, state.x, state.y])

  if (!state.visible) return null

  const annotations = state.ruleIds
    .map((id) => annotationMap.get(id))
    .filter((a): a is RuleAnnotation => a != null)

  if (annotations.length === 0) return null

  return (
    <div
      ref={popoverRef}
      className="cat-popover"
      style={{
        position: 'fixed',
        left: adjustedPos.x,
        top: adjustedPos.y,
        zIndex: 1000,
      }}
      onMouseEnter={() => onPopoverEnter()}
      onMouseLeave={() => onDismiss()}
    >
      {annotations.map((ann, i) => (
        <React.Fragment key={ann.id}>
          {i > 0 && <hr className="border-border my-0" />}
          {ann.type === 'spellcheck' ? (
            <SpellCheckPopoverContent
              data={ann.data}
              onSuggestionClick={(s) => onSuggestionClick(s, ann.id)}
            />
          ) : ann.type === 'lexiqa' ? (
            <LexiQAPopoverContent data={ann.data} />
          ) : ann.type === 'tb-target' ? (
            <TBTargetPopoverContent data={ann.data} />
          ) : (
            <SpecialCharPopoverContent data={ann.data} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

// ─── Main CATEditor Component ────────────────────────────────────────────────

export interface CATEditorProps {
  /** Initial text content for the editor */
  initialText?: string
  /** Rules to apply for highlighting */
  rules?: Array<MooRule>
  /** Called when editor content changes */
  onChange?: (text: string) => void
  /** Called when a suggestion is applied */
  onSuggestionApply?: (ruleId: string, suggestion: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Additional class name for the editor container */
  className?: string
  /** Whether the editor is read-only */
  readOnly?: boolean
}

export function CATEditor({
  initialText = '',
  rules = [],
  onChange,
  onSuggestionApply,
  placeholder = 'Start typing or paste text here…',
  className,
  readOnly = false,
}: CATEditorProps) {
  const annotationMapRef = useRef(new Map<string, RuleAnnotation>())
  const editorRef = useRef<LexicalEditor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [popoverState, setPopoverState] = useState<PopoverState>({
    visible: false,
    x: 0,
    y: 0,
    ruleIds: [],
  })

  const initialConfig = useMemo(
    () => ({
      namespace: 'CATEditor',
      theme: {
        root: 'cat-editor-root',
        paragraph: 'cat-editor-paragraph',
        text: {
          base: 'cat-editor-text',
        },
      },
      nodes: [HighlightNode],
      editable: !readOnly,
      onError: (error: Error) => {
        console.error('CATEditor Lexical error:', error)
      },
      editorState: () => {
        const root = $getRoot()
        const lines = initialText.split('\n')
        for (const line of lines) {
          const p = $createParagraphNode()
          p.append($createTextNode(line))
          root.append(p)
        }
      },
    }),
    [], // intentional: initialConfig should not change
  )

  // ── Popover hover logic ────────────────────────────────────────────────
  // We track whether the mouse is over a highlight or the popover itself.
  // A generous delay (400ms) avoids the popover closing while the user
  // drags the cursor across the gap between highlight → popover.
  const isOverHighlightRef = useRef(false)
  const isOverPopoverRef = useRef(false)

  const scheduleHide = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    dismissTimerRef.current = setTimeout(() => {
      if (!isOverHighlightRef.current && !isOverPopoverRef.current) {
        setPopoverState((prev) => ({ ...prev, visible: false }))
      }
    }, 400)
  }, [])

  const cancelHide = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
  }, [])

  // Handle hover over highlighted DOM elements
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.cat-highlight')
      if (!target) {
        // Left all highlights
        if (isOverHighlightRef.current) {
          isOverHighlightRef.current = false
          scheduleHide()
        }
        return
      }

      const ruleIdsAttr = target.getAttribute('data-rule-ids')
      if (!ruleIdsAttr) return

      // NL-marker ruleIds are prefixed with __nl- — strip it for annotation lookup
      const ruleIds = ruleIdsAttr
        .split(',')
        .map((id) =>
          id.startsWith(NL_MARKER_PREFIX)
            ? id.slice(NL_MARKER_PREFIX.length)
            : id,
        )

      isOverHighlightRef.current = true
      cancelHide()

      const rect = target.getBoundingClientRect()
      setPopoverState({
        visible: true,
        x: rect.left,
        y: rect.bottom,
        ruleIds,
      })
    }

    const handleMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null
      if (related?.closest('.cat-highlight')) return // moving between highlights
      isOverHighlightRef.current = false
      scheduleHide()
    }

    container.addEventListener('mouseover', handleMouseOver)
    container.addEventListener('mouseout', handleMouseOut)

    return () => {
      container.removeEventListener('mouseover', handleMouseOver)
      container.removeEventListener('mouseout', handleMouseOut)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [scheduleHide, cancelHide])

  // Handle suggestion click -> replace the highlighted text
  const handleSuggestionClick = useCallback(
    (suggestion: string, ruleId: string) => {
      const editor = editorRef.current
      if (!editor) return

      editor.update(() => {
        const root = $getRoot()
        const allNodes = root.getAllTextNodes()
        for (const node of allNodes) {
          if (
            $isHighlightNode(node) &&
            node.__ruleIds.split(',').includes(ruleId)
          ) {
            const textNode = $createTextNode(suggestion)
            node.replace(textNode)
            break
          }
        }
      })

      setPopoverState((prev) => ({ ...prev, visible: false }))
      onSuggestionApply?.(ruleId, suggestion)
    },
    [onSuggestionApply],
  )

  const handleChange = useCallback(
    (editorState: { read: (fn: () => void) => void }) => {
      if (!onChange) return
      editorState.read(() => {
        const root = $getRoot()
        onChange(root.getTextContent())
      })
    },
    [onChange],
  )

  return (
    <div ref={containerRef} className={cn('cat-editor-container', className)}>
      <LexicalComposer initialConfig={initialConfig}>
        <div className="cat-editor-inner">
          <PlainTextPlugin
            contentEditable={
              <ContentEditable className="cat-editor-editable" />
            }
            placeholder={
              <div className="cat-editor-placeholder">{placeholder}</div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <OnChangePlugin onChange={handleChange} />
          <HighlightsPlugin rules={rules} annotationMapRef={annotationMapRef} />
          <EditorRefPlugin editorRef={editorRef} />
        </div>
      </LexicalComposer>

      <HighlightPopover
        state={popoverState}
        annotationMap={annotationMapRef.current}
        onSuggestionClick={handleSuggestionClick}
        onDismiss={() => {
          isOverPopoverRef.current = false
          scheduleHide()
        }}
        onPopoverEnter={() => {
          isOverPopoverRef.current = true
          cancelHide()
        }}
      />
    </div>
  )
}

export default CATEditor
