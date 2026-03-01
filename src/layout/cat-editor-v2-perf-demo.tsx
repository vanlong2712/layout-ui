import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import { Redo2, Undo2, Zap } from 'lucide-react'

import type { DetectQuotesOptions } from '@/utils/detect-quotes'
import type { Range, Virtualizer } from '@tanstack/react-virtual'

import type {
  CATEditorRef,
  IKeywordsEntry,
  IKeywordsRule,
  ILinkRule,
  IQuoteRule,
  ISpellCheckRule,
  ISpellCheckValidation,
  ITagRule,
  MooRule,
} from '@/layout/cat-editor-v2'
import { CATEditor } from '@/layout/cat-editor-v2'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  CATEditorLegend,
  CATEditorSnippetsAndFlash,
  CATEditorToolbar,
} from '@/components/cat-editor-toolbar'

// ─── Cross-editor history hook ───────────────────────────────────────────────

/**
 * Manages a global undo/redo stack across multiple virtualized Lexical editors.
 *
 * Instead of relying on Lexical's per-editor `HistoryState` (which dies when
 * the virtualizer unmounts a row), we store **text + selection snapshots**
 * directly in the undo/redo stacks.  This makes the history fully
 * virtualization-safe — undo/redo works even for rows that are currently
 * off-screen.
 *
 * When the target row is not mounted, we scroll to it, wait for the editor
 * to appear, then apply the snapshot via `CATEditorRef.setText` /
 * `CATEditorRef.setSelection`.
 */

interface HistoryEntry {
  rowIndex: number
  beforeText: string
  beforeSelection: { anchor: number; focus: number } | null
  afterText: string
  afterSelection: { anchor: number; focus: number } | null
  timestamp: number
}

interface CrossEditorHistoryDeps {
  /** Scroll the virtualizer so the target row is visible and mounted. */
  scrollToRow: (rowIndex: number) => void
  /** Try to get the CATEditorRef for a row (may be `undefined` if not mounted). */
  getEditorRef: (rowIndex: number) => CATEditorRef | undefined
  /** Returns current compression state so applySnapshot can adapt strategy. */
  getCompressionInfo: () => { compressed: boolean; ratio: number }
}

/** Consecutive edits to the same row within this window are merged. */
const HISTORY_MERGE_INTERVAL = 300

function useCrossEditorHistory(deps: CrossEditorHistoryDeps) {
  const depsRef = useRef(deps)
  depsRef.current = deps

  // Last known text + selection per row — survives unmount so we can
  // compare "before vs after" when the row is re-mounted and edited.
  const lastKnownRef = useRef<
    Map<
      number,
      { text: string; selection: { anchor: number; focus: number } | null }
    >
  >(new Map())

  // Per-row update-listener cleanup functions
  const listenersRef = useRef<Map<number, () => void>>(new Map())

  // Global undo / redo stacks
  const undoStackRef = useRef<Array<HistoryEntry>>([])
  const redoStackRef = useRef<Array<HistoryEntry>>([])

  // Revision counter — drives `canUndo` / `canRedo` reactivity
  const [revision, setRevision] = useState(0)
  const bumpRevision = useCallback(() => setRevision((r) => r + 1), [])

  // Pending scroll-then-apply timer
  const pendingActionRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Register a CATEditorRef (called from `registerEditorRef`). */
  const registerEditor = useCallback(
    (rowIndex: number, catRef: CATEditorRef) => {
      const editor = catRef.getEditor()
      if (!editor) return

      // Clean up previous listener for this row
      listenersRef.current.get(rowIndex)?.()

      // Seed last-known state so the very first edit has a "before".
      // Default selection to offset 0 when the editor has no focus yet,
      // so `beforeSelection` in history entries is never null.
      const currentText = catRef.getText()
      const currentSel = catRef.getSelection()
      lastKnownRef.current.set(rowIndex, {
        text: currentText,
        selection: currentSel ?? { anchor: 0, focus: 0 },
      })

      // Listen for user edits — skip internal / synthetic updates
      const unregister = editor.registerUpdateListener(
        ({ tags, dirtyElements, dirtyLeaves }) => {
          if (tags.has('cross-history')) return
          if (tags.has('cat-highlights')) return
          if (tags.has('history-merge')) return
          if (tags.has('historic')) return

          const ref = depsRef.current.getEditorRef(rowIndex)
          if (!ref) return

          const newSel = ref.getSelection()
          const before = lastKnownRef.current.get(rowIndex)

          // Always keep lastKnown selection up-to-date so that
          // clicks / arrow-key moves are captured as the "before"
          // selection of the next text-changing edit.
          if (newSel && before) {
            before.selection = newSel
          }

          // Skip non-content updates (selection-only changes, etc.)
          if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return

          const newText = ref.getText()

          // Only record if text actually changed
          if (before && before.text === newText) return

          const now = Date.now()
          const topIdx = undoStackRef.current.length - 1
          const top = topIdx >= 0 ? undoStackRef.current[topIdx] : null

          if (
            top &&
            top.rowIndex === rowIndex &&
            now - top.timestamp < HISTORY_MERGE_INTERVAL
          ) {
            // Merge into the existing top entry (typing continuation)
            top.afterText = newText
            top.afterSelection = newSel
            top.timestamp = now
          } else {
            undoStackRef.current.push({
              rowIndex,
              beforeText: before?.text ?? '',
              beforeSelection: before?.selection ?? null,
              afterText: newText,
              afterSelection: newSel,
              timestamp: now,
            })
          }

          // New edit clears the redo stack
          redoStackRef.current.length = 0

          // Update last known
          lastKnownRef.current.set(rowIndex, {
            text: newText,
            selection: newSel ?? { anchor: 0, focus: 0 },
          })

          bumpRevision()
        },
      )

      listenersRef.current.set(rowIndex, unregister)
    },
    [bumpRevision],
  )

  /** Unregister when a row unmounts (virtualizer recycling). */
  const unregisterEditor = useCallback((rowIndex: number) => {
    listenersRef.current.get(rowIndex)?.()
    listenersRef.current.delete(rowIndex)
    // Keep lastKnownRef — we need it to survive unmount/remount
  }, [])

  /**
   * Apply a snapshot to a (possibly unmounted) editor row.
   * Scrolls to the row first if needed, then polls until the editor
   * appears and applies the text + selection.
   */
  const applySnapshot = useCallback(
    (
      entry: HistoryEntry,
      textKey: 'beforeText' | 'afterText',
      selKey: 'beforeSelection' | 'afterSelection',
      pushTo: Array<HistoryEntry>,
    ) => {
      // Cancel any previous pending action
      if (pendingActionRef.current) {
        clearTimeout(pendingActionRef.current)
        pendingActionRef.current = null
      }

      const text = entry[textKey]
      const selection = entry[selKey]

      // Adapt strategy based on whether height compression is active.
      // Non-compressed: fast path — single rAF, few attempts, native
      //   scrollIntoView for caret centering.
      // Compressed: need periodic re-scrolls (estimated positions are
      //   imprecise), more attempts, and virtualizer-aware centering
      //   (native scrollIntoView doesn't account for the ratio mapping).
      const { compressed, ratio } = depsRef.current.getCompressionInfo()
      const maxAttempts = compressed
        ? Math.min(60, 20 + Math.ceil(ratio * 5))
        : 15
      const reScrollInterval = compressed ? 8 : 0 // only re-scroll when compressed

      const tryApply = (attemptsLeft: number, wasUnmounted: boolean) => {
        const ref = depsRef.current.getEditorRef(entry.rowIndex)

        if (ref) {
          // Default selection to offset 0 when null, clamp to text length.
          const textLen = text.length
          const sel = selection ?? { anchor: 0, focus: 0 }
          const clampedSel = {
            anchor: Math.min(sel.anchor, textLen),
            focus: Math.min(sel.focus, textLen),
          }

          // Update last-known BEFORE setText so the text-comparison guard
          // in the update listener sees "no change" even if the tag filter
          // somehow misses.
          lastKnownRef.current.set(entry.rowIndex, {
            text,
            selection: clampedSel,
          })

          // Use the 'cross-history' tag so the update listener skips this.
          ref.setText(text, { tag: 'cross-history' })
          ref.setSelection(clampedSel.anchor, clampedSel.focus)

          pushTo.push(entry)
          bumpRevision()

          if (wasUnmounted) {
            if (compressed) {
              // Compressed: use virtualizer's scrollToIndex which goes
              // through our compression-aware scrollToFn.  Native
              // scrollIntoView doesn't account for the ratio mapping.
              requestAnimationFrame(() => {
                depsRef.current.scrollToRow(entry.rowIndex)
              })
            } else {
              // Non-compressed: native scrollIntoView is precise and fast.
              requestAnimationFrame(() => {
                const nativeSel = window.getSelection()
                if (nativeSel && nativeSel.rangeCount > 0) {
                  const range = nativeSel.getRangeAt(0)
                  const node = range.startContainer
                  const el = node instanceof Element ? node : node.parentElement
                  if (el) {
                    el.scrollIntoView({ block: 'center' })
                  }
                }
              })
            }
          }
          return
        }

        if (attemptsLeft > 0) {
          // In compressed mode, re-issue scrollToRow periodically because
          // estimated row positions may be imprecise — repeated scrolls
          // let the virtualizer converge as it measures nearby rows.
          if (reScrollInterval > 0 && attemptsLeft % reScrollInterval === 0) {
            depsRef.current.scrollToRow(entry.rowIndex)
          }
          pendingActionRef.current = setTimeout(
            () => tryApply(attemptsLeft - 1, true),
            60,
          )
        } else {
          // Timed out — row never mounted
          bumpRevision()
        }
      }

      // If the editor is already mounted, apply synchronously.
      // This is critical for redo to work: undo() must push to
      // redoStack synchronously so that a subsequent redo() call
      // (even in the same event / keydown) finds the entry.
      const immediateRef = depsRef.current.getEditorRef(entry.rowIndex)
      if (immediateRef) {
        tryApply(0, false)
        return
      }

      // Editor not mounted — scroll to the row and poll until it appears.
      depsRef.current.scrollToRow(entry.rowIndex)
      if (compressed) {
        // Double-rAF gives the virtualizer two frames to process the
        // scroll and render the target range before we start polling.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => tryApply(maxAttempts, true))
        })
      } else {
        // Single rAF is sufficient without compression.
        requestAnimationFrame(() => tryApply(maxAttempts, true))
      }
    },
    [bumpRevision],
  )

  /** Undo the last cross-editor edit. */
  const undo = useCallback(() => {
    const entry = undoStackRef.current.pop()
    if (!entry) return
    applySnapshot(entry, 'beforeText', 'beforeSelection', redoStackRef.current)
  }, [applySnapshot])

  /** Redo the last undone cross-editor edit. */
  const redo = useCallback(() => {
    const entry = redoStackRef.current.pop()
    if (!entry) return
    applySnapshot(entry, 'afterText', 'afterSelection', undoStackRef.current)
  }, [applySnapshot])

  /** Reset all history (e.g. on full demo reset). */
  const clearHistory = useCallback(() => {
    if (pendingActionRef.current) {
      clearTimeout(pendingActionRef.current)
      pendingActionRef.current = null
    }
    undoStackRef.current.length = 0
    redoStackRef.current.length = 0
    for (const unreg of listenersRef.current.values()) unreg()
    listenersRef.current.clear()
    lastKnownRef.current.clear()
    bumpRevision()
  }, [bumpRevision])

  const canUndo = undoStackRef.current.length > 0
  const canRedo = redoStackRef.current.length > 0

  void revision

  return useMemo(
    () => ({
      registerEditor,
      unregisterEditor,
      undo,
      redo,
      clearHistory,
      canUndo,
      canRedo,
    }),
    // Callbacks are stable (useCallback with stable deps).
    // Only canUndo/canRedo change — and only on edits, not scroll.
    [canUndo, canRedo],
  )
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TOTAL_ROWS = 1000
const ROW_HEIGHT = 140

// ─── Height compression for massive row counts ──────────────────────────────
//
// Browsers cap the maximum height of a DOM element (Chrome ≈ 32 M px,
// Firefox ≈ 17 M px, Safari ≈ 32 M px).  When the total height of all rows
// exceeds this limit the scrollbar cannot reach the bottom of the list.
//
// We use AG Grid's "stretching" technique: cap the container div at a safe
// maximum, then remap scroll positions so the virtualizer sees the full
// logical range while the DOM stays within browser limits.  The trade-off
// is that scrolling appears faster (rows move proportionally more per px
// of scroll) — this is unavoidable when mapping a larger range into a
// smaller one.
//
// See: https://www.ag-grid.com/javascript-data-grid/massive-row-count/

/** Safe maximum div height — conservatively below all major browser limits. */
const MAX_DIV_HEIGHT = 15_000_000

/**
 * Mutable compression state, updated synchronously in the scroll handler
 * so it is always fresh when React re-renders (triggered by the same
 * scroll event via the virtualizer).
 */
interface CompressionState {
  /** `true` when total row height exceeds `MAX_DIV_HEIGHT`. */
  enabled: boolean
  /** `trueScrollRange / cappedScrollRange`.  Always ≥ 1. */
  ratio: number
  /** Pixels to subtract from each row's true position: `mappedScroll − actualScroll`. */
  offset: number
}

// ─── Sample text generation ──────────────────────────────────────────────────

const SENTENCE_POOL = [
  'The quick brown fox jumps over the lazy dog near the API endpoint.',
  'A fast red car raced down the empty highway at dusk past the endpoint.',
  'She sells seashells by the seashore every morning using the HTTP request.',
  'The cat sat on the mat and watched the birds outside the fox den.',
  'Every good boy deserves fudge and a warm blanket from the endpoint store.',
  'Pack my box with five dozen liquor jugs and an API endpoint please.',
  'How vexingly quick daft zebras jump over the fence by the fox hole.',
  'The five boxing wizards jump quickly past the HTTP request queue.',
  'Bright vixens jump; dozy fowl quack near the API endpoint pond.',
  'Jinxed wizards pluck ivy from the big quilt near the endpoint softly.',
  'Technical terms like API and HTTP request are common in translation work.',
  'Multiple keywords like fox and endpoint appear throughout this segment.',
  'The fox jumped over the lazy endpoint twice today near the API gateway.',
  'Use the endpoint to query the database and call the HTTP request handler.',
  'Check the tb-target for translation quality assurance on the endpoint.',
  '<a href="https://example.com">Click <b>here</b> for more</a> info <br/> end.',
  'Hello {{userName}}, your order ${orderId} is ready. Total: $amount \u2014 use code %PROMO.',
  '<span class="highlight">Important</span> text with <em>emphasis</em> and <strong>bold</strong>.',
  'Template: {{firstName}} {{lastName}} \u2014 ID: ${uniqueId} \u2014 ref: %REF_CODE.',
  '<div class="card"><h2>Title</h2><p>Body text with {{variable}} here.</p></div>',
  'Inline tags: <b>bold</b>, <i>italic</i>, <u>underline</u>, <code>code</code> mix.',
  'Nested: <div><span>{{deepVar}}</span> and ${nested} with %PLACEHOLDER end.</div>',
  '<img src="photo.jpg" alt="fox" /> with <a href="/endpoint">link</a> nearby.',
  "She said \u201Crun away\u201D and he replied 'OK fine' before leaving the room.",
  'The sign reads "No entry" but some say \'it\u2019s just a suggestion\' anyway.',
  '\u201CDouble quoted text\u201D followed by \u2018single quoted text\u2019 in the same line.',
  "He whispered \"don't go\" and she answered 'I won\u2019t' with a smile.",
  "The manual says \"use the API endpoint\" and warns 'don't forget auth' tokens.",
  '\u201CTranslation note: the fox\u201D \u2014 \u2018use target glossary\u2019 for this term.',
  'Visit https://github.com/lexical or www.example.com for details.',
  'Documentation at https://docs.example.com/api/v2 and www.translate.io is online.',
  'Link test: https://cdn.example.com/assets/logo.png and www.fox-endpoint.org here.',
  'See https://en.wikipedia.org/wiki/Translation for reference materials.',
  'Tom & Jerry\u00A0say\u2009hello\u2003world\u200Bhidden\u2060join\u200Ahair.',
  'Spaces:\u00A0non-break \u2009thin \u2003em \u200Ahair \u2014 visible & invisible.',
  'Zero-width:\u200Bhidden\u200Cbreaker\u200Djoiner\u2060word between letters.',
  'Tab\there and\tthere again with & ampersand & more & symbols.',
  'Mixed: \u00A0Tom & Jerry\u2009visited the\u2003API endpoint\u200Btoday.',
  'The fox & hound\u00A0ran through\u2009thin\u2003em spaces to\u200Ahair end.',
  'The fox said \u201Chello\u201D at the <b>API endpoint</b> with\u00A0spaces & more.',
  'Visit <a href="https://example.com">the endpoint</a> \u2014 fox & friends\u2009say hi.',
  '{{userName}} wrote \u201Ccheck the API endpoint\u201D with\u00A0non-breaking & amp.',
  "She said 'the fox' in <i>italics</i> near\u2003em-space and the HTTP request.",
  'Tag <code>$amount</code> with \u201Cquotes\u201D & ampersand\u200Band\u2060joiners nearby.',
  "The <b>fox</b> & <i>endpoint</i> visited {{place}} \u2014 \u201Cnice\u201D 'spot' at\u00A0noon.",
  "Result: <span>${orderId}</span> \u2014 \u201Cconfirmed\u201D 'order' for the API endpoint & co.",
  "Nested: <div>\u201Cfox\u201D</div> & 'endpoint' with\u2009thin at https://example.com link.",
  'The API endpoint handled 500 HTTP requests per second. The fox monitored the logs. Meanwhile, the endpoint scaled automatically.',
  "Testing <b>bold</b> and <i>italic</i> mixed with \u201Cdouble quotes\u201D and 'single quotes' near the endpoint & gateway.",
  "Tom & Jerry\u00A0visited\u2009the\u2003fox at https://example.com and typed \u201Chello world\u201D into 'the box' near the API endpoint.",
  'The {{userName}} fox jumped over $amount \u2014 \u201Cincredible\u201D \'speed\' at the <a href="/api">endpoint</a> with\u00A0spaces & more & links.',
  "Multiple sentences with rules. The fox ran. The API endpoint responded. She said \u201COK\u201D and 'bye'. Visit www.example.com today.",
  "Full mix: <b>{{name}}</b> & \u201Cfox\u201D 'endpoint' HTTP request at\u00A0noon\u2009thin\u2003em \u2014 https://docs.example.com/fox link.",
]

const TYPO_WORDS: Array<{ wrong: string; right: string }> = [
  { wrong: 'teh', right: 'the' },
  { wrong: 'recieve', right: 'receive' },
  { wrong: 'occurence', right: 'occurrence' },
  { wrong: 'seperate', right: 'separate' },
  { wrong: 'definately', right: 'definitely' },
  { wrong: 'accomodate', right: 'accommodate' },
  { wrong: 'wierd', right: 'weird' },
  { wrong: 'untill', right: 'until' },
  { wrong: 'begining', right: 'beginning' },
  { wrong: 'occured', right: 'occurred' },
  { wrong: 'apparantly', right: 'apparently' },
  { wrong: 'enviroment', right: 'environment' },
  { wrong: 'goverment', right: 'government' },
  { wrong: 'neccessary', right: 'necessary' },
  { wrong: 'restaraunt', right: 'restaurant' },
]

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

function generateSampleText(index: number): string {
  const rng = seededRandom(index + 1)
  const sentenceCount = 6 + Math.floor(rng() * 5)
  const sentences: Array<string> = []
  const used = new Set<number>()
  for (let i = 0; i < sentenceCount; i++) {
    let idx = Math.floor(rng() * SENTENCE_POOL.length)
    let attempts = 0
    while (used.has(idx) && attempts < 5) {
      idx = Math.floor(rng() * SENTENCE_POOL.length)
      attempts++
    }
    used.add(idx)
    sentences.push(SENTENCE_POOL[idx])
  }

  if (rng() < 0.5 && sentences.length > 3) {
    const nlPos = 2 + Math.floor(rng() * (sentences.length - 3))
    sentences[nlPos] = sentences[nlPos] + '\n'
  }

  let text = sentences.join(' ')

  const typoRoll = rng()
  const typoCount = typoRoll < 0.4 ? 0 : typoRoll < 0.75 ? 1 : 2
  for (let t = 0; t < typoCount; t++) {
    const typo = TYPO_WORDS[Math.floor(rng() * TYPO_WORDS.length)]
    const words = text.split(' ')
    const targetIdx = Math.floor(rng() * words.length)
    words.splice(targetIdx, 0, typo.wrong)
    text = words.join(' ')
  }

  return text
}

const sampleTextsCache: Array<string> = []
function getSampleText(index: number): string {
  if (index < sampleTextsCache.length) return sampleTextsCache[index]
  for (let i = sampleTextsCache.length; i <= index; i++) {
    sampleTextsCache.push(generateSampleText(i))
  }
  return sampleTextsCache[index]
}
for (let i = 0; i < TOTAL_ROWS; i++) getSampleText(i)

// ─── Default rule data ───────────────────────────────────────────────────────

const DEFAULT_TAG_PATTERN =
  '<[^>]+>|(\\{\\{[^{}]*\\}\\})|(\\{[^{}]*\\})|(["\']?\\{[^{}]*\\}["\']?)|(["\']?\\$\\{[^{}]*\\}["\']?)|(["\']?\\$[A-Za-z0-9_]+["\']?)|(["\']?%[A-Za-z0-9]+["\']?)'

const DEFAULT_LEXIQA_ENTRIES: Array<IKeywordsEntry> = [
  { pattern: 'API endpoint' },
  { pattern: 'HTTP request' },
]

const DEFAULT_TB_ENTRIES: Array<IKeywordsEntry> = [
  { pattern: 'endpoint', description: 'Preferred: use "API endpoint".' },
  { pattern: 'fox', description: 'Translate as "zorro" in Spanish.' },
]

const DEFAULT_SPELLCHECK: Array<ISpellCheckValidation> = [
  {
    categoryId: 'TYPOS',
    start: 0,
    end: 3,
    content: 'The',
    message: 'Demo spellcheck: first word of every row.',
    shortMessage: 'Demo',
    suggestions: [{ value: 'A' }, { value: 'This' }],
  },
  {
    categoryId: 'TYPOS',
    start: 10,
    end: 15,
    content: 'brown',
    message: 'Possible colour name. Did you mean a different word?',
    shortMessage: 'Typo',
    suggestions: [{ value: 'brawn' }, { value: 'brow' }],
  },
]

const DEFAULT_SPECIAL_CHARS: Array<IKeywordsEntry> = [
  { pattern: '&', description: 'Ampersand', atomic: true },
  { pattern: '\\t', description: 'Tab', atomic: true, displaySymbol: '\u21E5' },
  {
    pattern: '\\u00A0',
    description: 'Non-Breaking Space',
    atomic: true,
    displaySymbol: '\u237D',
  },
  {
    pattern: '\\u2009',
    description: 'Thin Space',
    atomic: true,
    displaySymbol: '\u00B7',
  },
  {
    pattern: '\\u2003',
    description: 'Em Space',
    atomic: true,
    displaySymbol: '\u2423',
  },
  {
    pattern: '\\u200B',
    description: 'Zero-Width Space',
    atomic: true,
    displaySymbol: '\u2205',
  },
  {
    pattern: '\\u2060',
    description: 'Word Joiner',
    atomic: true,
    displaySymbol: '\u2040',
  },
  {
    pattern: '\\u200A',
    description: 'Hair Space',
    atomic: true,
    displaySymbol: '\u00B7',
  },
  { pattern: ' ', description: 'Space', atomic: true },
]

// ─── Text snippet & flash-range presets ──────────────────────────────────────

const TEXT_SNIPPETS = [
  { label: 'Hello World', text: 'Hello World' },
  { label: '\u00A9', text: '\u00A9' },
  { label: '\u2122', text: '\u2122' },
  { label: '\u00AE', text: '\u00AE' },
  { label: 'NBSP', text: '\u00A0' },
  { label: '\u2192', text: '\u2192' },
  { label: '\u2014', text: '\u2014' },
  { label: '\u2026', text: '\u2026' },
  { label: '\u00AB\u00BB', text: '\u00AB\u00BB' },
  { label: 'ZWS', text: '\u200B' },
  { label: 'Line break', text: '\n' },
]

const FLASH_RANGES = [
  { label: 'First 5 chars', start: 0, end: 5 },
  { label: 'Chars 10\u201325', start: 10, end: 25 },
  { label: 'Chars 30\u201345', start: 30, end: 45 },
  { label: 'Chars 50\u201360', start: 50, end: 60 },
  { label: 'Chars 0\u201320', start: 0, end: 20 },
  { label: 'Chars 25\u201350', start: 25, end: 50 },
]

// ─── Memoised editor row ─────────────────────────────────────────────────────

const EditorRow = memo(function EditorRow({
  index,
  text,
  rules,
  onFocus,
  onKeyDown,
  registerRef,
  dir,
  popoverDir,
  jpFont,
  editable,
  readOnlySelectable,
  openLinksOnClick,
  disableHistory,
}: {
  index: number
  text: string
  rules: Array<MooRule>
  onFocus: (index: number) => void
  onKeyDown?: (event: KeyboardEvent) => boolean
  registerRef: (index: number, instance: CATEditorRef | null) => void
  dir?: 'ltr' | 'rtl' | 'auto'
  popoverDir?: 'ltr' | 'rtl' | 'auto' | 'inherit'
  jpFont?: boolean
  editable?: boolean
  readOnlySelectable?: boolean
  openLinksOnClick?: boolean
  disableHistory?: boolean
}) {
  const editorRefCallback = useCallback(
    (instance: CATEditorRef | null) => {
      registerRef(index, instance)
    },
    [index, registerRef],
  )

  return (
    <div
      className="flex items-stretch gap-3 "
      onFocusCapture={() => onFocus(index)}
    >
      <div className="flex items-center justify-center w-12 shrink-0 text-xs font-mono text-muted-foreground bg-muted/30 rounded-l-lg border-r border-border">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0 py-1">
        <CATEditor
          ref={editorRefCallback}
          initialText={text}
          rules={rules}
          placeholder={`Row ${index + 1}`}
          className="cat-perf-row-editor [&_.cat-editor-root]:min-h-0!"
          dir={dir}
          popoverDir={popoverDir}
          jpFont={jpFont}
          editable={editable}
          readOnlySelectable={readOnlySelectable}
          openLinksOnClick={openLinksOnClick}
          onKeyDown={onKeyDown}
          disableHistory={disableHistory}
        />
      </div>
    </div>
  )
})

// ─── Virtualised scroll area (isolated from parent re-renders) ───────────────
//
// By hosting `useVirtualizer` inside this memo'd child component, scroll-
// triggered re-renders are confined here.  The parent (toolbar, header,
// legend, undo/redo, snippets panel) DOES NOT re-render during scroll.

const getEstimateSize = () => ROW_HEIGHT
const getMeasureElement = (el: Element) => el.getBoundingClientRect().height

interface VirtualScrollAreaProps {
  resetKey: number
  effectiveRowCount: number
  toOriginalIndex: (index: number) => number
  rangeExtractor: (range: Range) => Array<number>
  dynamicHeight: boolean
  rules: Array<MooRule>
  editorDir: 'ltr' | 'rtl' | 'auto'
  popoverDir: 'ltr' | 'rtl' | 'auto' | 'inherit'
  jpFont: boolean
  editorEditable: boolean
  readOnlySelectable: boolean
  openLinksOnClick: boolean
  onFocusRow: (index: number) => void
  onEditorKeyDown: (event: KeyboardEvent) => boolean
  registerEditorRef: (index: number, instance: CATEditorRef | null) => void
  virtualizerRef: React.MutableRefObject<ReturnType<
    typeof useVirtualizer<HTMLDivElement, Element>
  > | null>
  /** Shared ref so the parent (cross-editor history) can read compression state. */
  compressionRef: React.MutableRefObject<CompressionState>
}

const VirtualScrollArea = memo(function VirtualScrollArea({
  resetKey,
  effectiveRowCount,
  toOriginalIndex,
  rangeExtractor,
  dynamicHeight,
  rules,
  editorDir,
  popoverDir,
  jpFont,
  editorEditable,
  readOnlySelectable,
  openLinksOnClick,
  onFocusRow,
  onEditorKeyDown,
  registerEditorRef,
  virtualizerRef,
  compressionRef,
}: VirtualScrollAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const getScrollElement = useCallback(() => scrollRef.current, [])

  const observeElementOffset = useCallback(
    (
      instance: Virtualizer<HTMLDivElement, Element>,
      cb: (offset: number, isScrolling: boolean) => void,
    ) => {
      const element = instance.scrollElement
      if (!element) return

      let scrolling = false
      let scrollEndTimer: ReturnType<typeof setTimeout> | null = null

      const report = () => {
        const scrollTop = element.scrollTop
        const trueTotal = instance.getTotalSize()

        if (trueTotal <= MAX_DIV_HEIGHT) {
          compressionRef.current = { enabled: false, ratio: 1, offset: 0 }
          cb(scrollTop, scrolling)
          return
        }

        const viewportHeight = element.clientHeight
        const cappedHeight = MAX_DIV_HEIGHT
        const maxCappedScroll = Math.max(1, cappedHeight - viewportHeight)
        const maxTrueScroll = Math.max(1, trueTotal - viewportHeight)
        const ratio = maxTrueScroll / maxCappedScroll
        const mappedScroll = scrollTop * ratio
        const offset = mappedScroll - scrollTop

        compressionRef.current = { enabled: true, ratio, offset }
        cb(mappedScroll, scrolling)
      }

      const onScroll = () => {
        scrolling = true
        report()
        if (scrollEndTimer) clearTimeout(scrollEndTimer)
        scrollEndTimer = setTimeout(() => {
          scrolling = false
          report()
        }, instance.options.isScrollingResetDelay)
      }

      element.addEventListener('scroll', onScroll, { passive: true })
      report()

      return () => {
        element.removeEventListener('scroll', onScroll)
        if (scrollEndTimer) clearTimeout(scrollEndTimer)
      }
    },
    [],
  )

  const scrollToFn = useCallback(
    (
      offset: number,
      options: { adjustments?: number; behavior?: ScrollBehavior },
      instance: Virtualizer<HTMLDivElement, Element>,
    ) => {
      const element = instance.scrollElement
      if (!element) return

      const { ratio, enabled } = compressionRef.current
      const trueOffset = offset + (options.adjustments ?? 0)
      const actualOffset = enabled ? trueOffset / ratio : trueOffset

      element.scrollTo({
        top: actualOffset,
        behavior: options.behavior,
      })
    },
    [],
  )

  const virtualizer = useVirtualizer({
    count: effectiveRowCount,
    getItemKey: toOriginalIndex,
    getScrollElement,
    estimateSize: getEstimateSize,
    overscan: 5,
    measureElement: getMeasureElement,
    rangeExtractor,
    observeElementOffset,
    scrollToFn,
    useAnimationFrameWithResizeObserver: true,
  })
  virtualizerRef.current = virtualizer

  const totalSize = virtualizer.getTotalSize()
  const compressionActive = totalSize > MAX_DIV_HEIGHT
  const containerHeight = compressionActive ? MAX_DIV_HEIGHT : totalSize
  const scrollOffset = virtualizer.scrollOffset ?? 0

  return (
    <>
      {compressionActive && (
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-1.5">
          Height compression active &mdash;{' '}
          <strong>{effectiveRowCount.toLocaleString()}</strong> rows &times;{' '}
          {ROW_HEIGHT}px ={' '}
          <strong>
            {((effectiveRowCount * ROW_HEIGHT) / 1_000_000).toFixed(1)}M px
          </strong>
          , capped at{' '}
          <strong>{(MAX_DIV_HEIGHT / 1_000_000).toFixed(0)}M px</strong>. Scroll
          ~&times;
          <strong>
            {((effectiveRowCount * ROW_HEIGHT) / MAX_DIV_HEIGHT).toFixed(1)}
          </strong>
          . Row height: {dynamicHeight ? 'dynamic' : 'fixed'}.
        </p>
      )}

      <div
        key={resetKey}
        ref={scrollRef}
        className="rounded-xl border border-border bg-card shadow-sm overflow-auto"
        style={{
          height: '75vh',
          overflowAnchor: 'none',
        }}
      >
        <div style={{ height: `${containerHeight}px`, width: '100%' }}>
          <div
            style={{
              position: 'sticky',
              top: 0,
              contain: 'layout style',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const originalIndex = toOriginalIndex(virtualRow.index)
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={dynamicHeight ? virtualizer.measureElement : undefined}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    ...(!dynamicHeight && {
                      height: ROW_HEIGHT,
                      overflow: 'hidden',
                    }),
                    transform: `translateY(${virtualRow.start - scrollOffset}px)`,
                  }}
                  className="border-b border-border/50"
                >
                  <EditorRow
                    index={originalIndex}
                    text={getSampleText(originalIndex)}
                    rules={rules}
                    onFocus={onFocusRow}
                    onKeyDown={onEditorKeyDown}
                    registerRef={registerEditorRef}
                    dir={editorDir}
                    popoverDir={popoverDir}
                    jpFont={jpFont}
                    editable={editorEditable}
                    readOnlySelectable={readOnlySelectable}
                    openLinksOnClick={openLinksOnClick}
                    disableHistory
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
})

// ─── Main demo component ─────────────────────────────────────────────────────

export function CATEditorV2PerfDemo() {
  const [resetKey, setResetKey] = useState(0)
  const editorRefsMap = useRef<Map<number, CATEditorRef>>(new Map())
  const virtualizerRef = useRef<ReturnType<
    typeof useVirtualizer<HTMLDivElement, Element>
  > | null>(null)

  const compressionRef = useRef<CompressionState>({
    enabled: false,
    ratio: 1,
    offset: 0,
  })

  const crossHistory = useCrossEditorHistory({
    scrollToRow: (rowIndex) => {
      virtualizerRef.current?.scrollToIndex(rowIndex, { align: 'center' })
    },
    getEditorRef: (rowIndex) => editorRefsMap.current.get(rowIndex),
    getCompressionInfo: () => ({
      compressed: compressionRef.current.enabled,
      ratio: compressionRef.current.ratio,
    }),
  })

  const [spellcheckEnabled, setSpellcheckEnabled] = useState(true)
  const [lexiqaEnabled, setLexiqaEnabled] = useState(true)
  const [tbTargetEnabled, setTbTargetEnabled] = useState(true)
  const [specialCharEnabled, setSpecialCharEnabled] = useState(true)
  const [tagsEnabled, setTagsEnabled] = useState(true)
  const [quotesEnabled, setQuotesEnabled] = useState(false)
  const [linkEnabled, setLinkEnabled] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [searchKeywords, setSearchKeywords] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const [searchFilterRows, setSearchFilterRows] = useState(false)

  const [editorDir, setEditorDir] = useState<'ltr' | 'rtl' | 'auto'>('ltr')
  const [popoverDir, setPopoverDir] = useState<
    'ltr' | 'rtl' | 'auto' | 'inherit'
  >('ltr')
  const [jpFont, setJpFont] = useState(false)
  const [editorEditable, setEditorEditable] = useState(true)
  const [readOnlySelectable, setReadOnlySelectable] = useState(false)
  const [openLinksOnClick, setOpenLinksOnClick] = useState(true)

  const [spellcheckData, setSpellcheckData] =
    useState<Array<ISpellCheckValidation>>(DEFAULT_SPELLCHECK)
  const [lexiqaEntries, setLexiqaEntries] = useState<Array<IKeywordsEntry>>(
    DEFAULT_LEXIQA_ENTRIES,
  )
  const [tbEntries, setTbEntries] =
    useState<Array<IKeywordsEntry>>(DEFAULT_TB_ENTRIES)
  const [specialCharEntries, setSpecialCharEntries] = useState<
    Array<IKeywordsEntry>
  >(DEFAULT_SPECIAL_CHARS)

  const [tagsCollapsed, setTagsCollapsed] = useState(false)
  const [tagsDetectInner, setTagsDetectInner] = useState(true)
  const [tagPattern, setTagPattern] = useState(DEFAULT_TAG_PATTERN)
  const [tagCollapseScope, setTagCollapseScope] = useState<'all' | 'html-only'>(
    'all',
  )

  const [singleQuoteOpen, setSingleQuoteOpen] = useState('{')
  const [singleQuoteClose, setSingleQuoteClose] = useState('}')
  const [doubleQuoteOpen, setDoubleQuoteOpen] = useState('{{')
  const [doubleQuoteClose, setDoubleQuoteClose] = useState('}}')
  const [quotesInTags, setQuotesInTags] = useState(false)
  const [quoteEscapeContractions, setQuoteEscapeContractions] = useState(true)
  const [quoteAllowNesting, setQuoteAllowNesting] = useState(false)
  const [quoteDetectInner, setQuoteDetectInner] = useState(true)

  const [flashedSpellcheckId, setFlashedSpellcheckId] = useState<string | null>(
    null,
  )
  const flashDemoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [rowCount, setRowCount] = useState(TOTAL_ROWS)
  const [dynamicHeight, setDynamicHeight] = useState(true)

  const updateKeyword = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<Array<IKeywordsEntry>>>,
      idx: number,
      patch: Partial<IKeywordsEntry>,
    ) =>
      setter((prev) =>
        prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
      ),
    [],
  )
  const removeKeyword = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<Array<IKeywordsEntry>>>,
      idx: number,
    ) => setter((prev) => prev.filter((_, i) => i !== idx)),
    [],
  )
  const addKeyword = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Array<IKeywordsEntry>>>) =>
      setter((prev) => [...prev, { pattern: '' }]),
    [],
  )
  const updateSpecialChar = useCallback(
    (idx: number, patch: Partial<IKeywordsEntry>) =>
      setSpecialCharEntries((prev) =>
        prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
      ),
    [],
  )
  const removeSpecialChar = useCallback(
    (idx: number) =>
      setSpecialCharEntries((prev) => prev.filter((_, i) => i !== idx)),
    [],
  )
  const addSpecialChar = useCallback(
    () =>
      setSpecialCharEntries((prev) => [
        ...prev,
        { pattern: 'x', description: 'New Char', atomic: true },
      ]),
    [],
  )

  const rules = useMemo<Array<MooRule>>(() => {
    const active: Array<MooRule> = []
    if (spellcheckEnabled) {
      active.push({
        type: 'spellcheck',
        validations: spellcheckData,
      } satisfies ISpellCheckRule)
    }
    if (lexiqaEnabled) {
      active.push({
        type: 'keyword',
        label: 'lexiqa',
        entries: lexiqaEntries,
      } satisfies IKeywordsRule)
    }
    if (tbTargetEnabled) {
      active.push({
        type: 'keyword',
        label: 'tb-target',
        entries: tbEntries,
      } satisfies IKeywordsRule)
    }
    if (specialCharEnabled) {
      active.push({
        type: 'keyword',
        label: 'special-char',
        entries: specialCharEntries,
      } satisfies IKeywordsRule)
    }
    if (tagsEnabled) {
      active.push({
        type: 'tag',
        detectInner: tagsDetectInner,
        collapsed: tagsCollapsed,
        collapseScope: tagCollapseScope,
        pattern: tagPattern || undefined,
      } satisfies ITagRule)
    }
    if (quotesEnabled) {
      const detectOptions: DetectQuotesOptions = {
        escapeContractions: quoteEscapeContractions,
        allowNesting: quoteAllowNesting,
        detectInnerQuotes: quoteDetectInner,
      }
      active.push({
        type: 'quote',
        singleQuote: { opening: singleQuoteOpen, closing: singleQuoteClose },
        doubleQuote: { opening: doubleQuoteOpen, closing: doubleQuoteClose },
        detectInTags: quotesInTags,
        detectOptions,
      } satisfies IQuoteRule)
    }
    if (linkEnabled) {
      active.push({ type: 'link' } satisfies ILinkRule)
    }
    if (searchKeywords.trim()) {
      const terms = searchKeywords
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (terms.length > 0) {
        active.push({
          type: 'keyword',
          label: 'search',
          entries: terms.map((t) => ({ pattern: t })),
        } satisfies IKeywordsRule)
      }
    }
    return active
  }, [
    spellcheckEnabled,
    spellcheckData,
    lexiqaEnabled,
    lexiqaEntries,
    tbTargetEnabled,
    tbEntries,
    specialCharEnabled,
    specialCharEntries,
    tagsEnabled,
    tagsCollapsed,
    tagsDetectInner,
    tagPattern,
    tagCollapseScope,
    quotesEnabled,
    singleQuoteOpen,
    singleQuoteClose,
    doubleQuoteOpen,
    doubleQuoteClose,
    quotesInTags,
    quoteEscapeContractions,
    quoteAllowNesting,
    quoteDetectInner,
    linkEnabled,
    searchKeywords,
  ])

  const handleReset = useCallback(() => {
    setSpellcheckEnabled(true)
    setSpellcheckData(DEFAULT_SPELLCHECK)
    setFlashedSpellcheckId(null)
    if (flashDemoTimerRef.current) clearTimeout(flashDemoTimerRef.current)
    setLexiqaEnabled(true)
    setTbTargetEnabled(true)
    setSpecialCharEnabled(true)
    setTagsEnabled(true)
    setQuotesEnabled(false)
    setLinkEnabled(true)
    setSearchInput('')
    setSearchKeywords('')
    setSearchFilterRows(false)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    setLexiqaEntries(DEFAULT_LEXIQA_ENTRIES)
    setTbEntries(DEFAULT_TB_ENTRIES)
    setSpecialCharEntries(DEFAULT_SPECIAL_CHARS)
    setTagsCollapsed(false)
    setTagsDetectInner(true)
    setTagPattern(DEFAULT_TAG_PATTERN)
    setTagCollapseScope('all')
    setSingleQuoteOpen('{')
    setSingleQuoteClose('}')
    setDoubleQuoteOpen('{{')
    setDoubleQuoteClose('}}')
    setQuotesInTags(false)
    setQuoteEscapeContractions(true)
    setQuoteAllowNesting(false)
    setQuoteDetectInner(true)
    setEditorDir('ltr')
    setPopoverDir('ltr')
    setJpFont(false)
    setEditorEditable(true)
    setReadOnlySelectable(false)
    setOpenLinksOnClick(true)
    setRowCount(TOTAL_ROWS)
    setDynamicHeight(true)
    crossHistoryRef.current.clearHistory()
    setResetKey((k) => k + 1)
  }, [])

  const [focusedRow, setFocusedRow] = useState<number | null>(null)
  const handleFocusRow = useCallback((index: number) => {
    setFocusedRow(index)
  }, [])

  // Ref keeps crossHistory access stable so callbacks below have no deps
  // on the crossHistory object reference (which changes when canUndo/canRedo
  // toggle).  This is critical: without it, registerEditorRef and
  // handleEditorKeyDown would get new references every time canUndo/canRedo
  // changes, breaking EditorRow's memo.
  const crossHistoryRef = useRef(crossHistory)
  crossHistoryRef.current = crossHistory

  const registerEditorRef = useCallback(
    (index: number, instance: CATEditorRef | null) => {
      if (instance) {
        editorRefsMap.current.set(index, instance)
        crossHistoryRef.current.registerEditor(index, instance)
      } else {
        editorRefsMap.current.delete(index)
        crossHistoryRef.current.unregisterEditor(index)
      }
    },
    [],
  )

  const focusedRowRef = useRef(focusedRow)
  focusedRowRef.current = focusedRow
  const rowCountRef = useRef(rowCount)
  rowCountRef.current = rowCount

  const handleEditorKeyDown = useCallback((event: KeyboardEvent): boolean => {
    const row = focusedRowRef.current
    const key = event.key.toLowerCase()
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        crossHistoryRef.current.undo()
        return true
      }
      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        crossHistoryRef.current.redo()
        return true
      }
    }
    if (row === null) return false
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const editorRef = editorRefsMap.current.get(row)
      if (!editorRef) return false
      const sel = editorRef.getSelection()
      if (!sel || sel.anchor !== sel.focus) return false
      const navigateTo = (targetRow: number, position: 'start' | 'end') => {
        virtualizerRef.current?.scrollToIndex(targetRow, { align: 'center' })
        requestAnimationFrame(() => {
          const targetRef = editorRefsMap.current.get(targetRow)
          if (targetRef) {
            if (position === 'end') targetRef.focusEnd()
            else targetRef.focusStart()
          }
        })
      }
      if (event.key === 'ArrowUp' && sel.anchor === 0) {
        if (row > 0) {
          navigateTo(row - 1, 'end')
          return true
        }
      }
      if (event.key === 'ArrowDown') {
        const text = editorRef.getText()
        if (sel.anchor === text.length) {
          const maxRow = rowCountRef.current - 1
          if (row < maxRow) {
            navigateTo(row + 1, 'start')
            return true
          }
        }
      }
    }
    return false
  }, [])

  const updateSpellcheck = useCallback(
    (idx: number, patch: Partial<ISpellCheckValidation>) =>
      setSpellcheckData((prev) =>
        prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)),
      ),
    [],
  )
  const removeSpellcheck = useCallback(
    (idx: number) =>
      setSpellcheckData((prev) => prev.filter((_, i) => i !== idx)),
    [],
  )
  const addSpellcheck = useCallback(
    () =>
      setSpellcheckData((prev) => [
        ...prev,
        {
          categoryId: 'TYPOS',
          start: 0,
          end: 0,
          content: '',
          message: '',
          shortMessage: '',
          suggestions: [],
        },
      ]),
    [],
  )

  const handleFlashSpellcheck = useCallback(
    (annId: string, durationMs = 5000) => {
      if (flashDemoTimerRef.current) clearTimeout(flashDemoTimerRef.current)
      setFlashedSpellcheckId(annId)
      const fr = focusedRowRef.current
      if (fr !== null) {
        editorRefsMap.current.get(fr)?.flashHighlight(annId, durationMs)
      }
      flashDemoTimerRef.current = setTimeout(() => {
        setFlashedSpellcheckId(null)
      }, durationMs)
    },
    [],
  )

  const rangeExtractor = useCallback((range: Range) => {
    const result = defaultRangeExtractor(range)
    const fr = focusedRowRef.current
    if (fr !== null && !result.includes(fr)) {
      result.push(fr)
      result.sort((a, b) => a - b)
    }
    return result
  }, [])

  const filteredRowIndices = useMemo(() => {
    if (!searchFilterRows || !searchKeywords.trim()) return null
    const terms = searchKeywords
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    if (terms.length === 0) return null
    const indices: Array<number> = []
    for (let i = 0; i < rowCount; i++) {
      const text = getSampleText(i).toLowerCase()
      if (terms.some((t) => text.includes(t))) indices.push(i)
    }
    return indices
  }, [searchFilterRows, searchKeywords, rowCount])

  const effectiveRowCount = filteredRowIndices
    ? filteredRowIndices.length
    : rowCount

  const toOriginalIndex = useCallback(
    (visibleIndex: number) =>
      filteredRowIndices ? filteredRowIndices[visibleIndex] : visibleIndex,
    [filteredRowIndices],
  )

  // Stable snippet/flash callbacks (use focusedRowRef to avoid deps on focusedRow)
  const handleInsertText = useCallback((text: string) => {
    const fr = focusedRowRef.current
    if (fr !== null) editorRefsMap.current.get(fr)?.insertText(text)
  }, [])
  const handleSetText = useCallback((text: string) => {
    const fr = focusedRowRef.current
    if (fr !== null) editorRefsMap.current.get(fr)?.setText(text)
  }, [])
  const handleFlashRange = useCallback(
    (start: number, end: number, ms?: number) => {
      const fr = focusedRowRef.current
      if (fr !== null) editorRefsMap.current.get(fr)?.flashRange(start, end, ms)
    },
    [],
  )

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-muted/30 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl flex items-center gap-3">
            <Zap className="h-8 w-8 text-amber-500" />
            CAT Editor v2 &mdash; Performance Test
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            Stress-test with <strong>{rowCount.toLocaleString()}</strong>{' '}
            virtualized rows &middot; {dynamicHeight ? 'dynamic' : 'fixed'}{' '}
            height &middot;{' '}
            <code className="text-xs bg-muted px-1 rounded">
              @tanstack/react-virtual
            </code>{' '}
            &middot; modular v2 architecture
          </p>
        </div>

        <CATEditorToolbar
          onReset={handleReset}
          spellcheckEnabled={spellcheckEnabled}
          onSpellcheckEnabledChange={setSpellcheckEnabled}
          spellcheckData={spellcheckData}
          onSpellcheckUpdate={updateSpellcheck}
          onSpellcheckRemove={removeSpellcheck}
          onSpellcheckAdd={addSpellcheck}
          flashedSpellcheckId={flashedSpellcheckId}
          onFlashSpellcheck={handleFlashSpellcheck}
          spellcheckFlashDisabled={focusedRow === null}
          lexiqaEnabled={lexiqaEnabled}
          onLexiqaEnabledChange={setLexiqaEnabled}
          lexiqaEntries={lexiqaEntries}
          onLexiqaUpdate={(idx, patch) =>
            updateKeyword(setLexiqaEntries, idx, patch)
          }
          onLexiqaRemove={(idx) => removeKeyword(setLexiqaEntries, idx)}
          onLexiqaAdd={() => addKeyword(setLexiqaEntries)}
          tbTargetEnabled={tbTargetEnabled}
          onTbTargetEnabledChange={setTbTargetEnabled}
          tbEntries={tbEntries}
          onTbUpdate={(idx, patch) => updateKeyword(setTbEntries, idx, patch)}
          onTbRemove={(idx) => removeKeyword(setTbEntries, idx)}
          onTbAdd={() => addKeyword(setTbEntries)}
          specialCharEnabled={specialCharEnabled}
          onSpecialCharEnabledChange={setSpecialCharEnabled}
          specialCharEntries={specialCharEntries}
          onSpecialCharUpdate={updateSpecialChar}
          onSpecialCharRemove={removeSpecialChar}
          onSpecialCharAdd={addSpecialChar}
          tagsEnabled={tagsEnabled}
          onTagsEnabledChange={setTagsEnabled}
          tagsCollapsed={tagsCollapsed}
          onTagsCollapsedChange={setTagsCollapsed}
          tagCollapseScope={tagCollapseScope}
          onTagCollapseScopeChange={(v) =>
            setTagCollapseScope(v ? 'html-only' : 'all')
          }
          tagsDetectInner={tagsDetectInner}
          onTagsDetectInnerChange={setTagsDetectInner}
          tagPattern={tagPattern}
          onTagPatternChange={setTagPattern}
          quotesEnabled={quotesEnabled}
          onQuotesEnabledChange={setQuotesEnabled}
          singleQuoteOpen={singleQuoteOpen}
          onSingleQuoteOpenChange={setSingleQuoteOpen}
          singleQuoteClose={singleQuoteClose}
          onSingleQuoteCloseChange={setSingleQuoteClose}
          doubleQuoteOpen={doubleQuoteOpen}
          onDoubleQuoteOpenChange={setDoubleQuoteOpen}
          doubleQuoteClose={doubleQuoteClose}
          onDoubleQuoteCloseChange={setDoubleQuoteClose}
          quotesInTags={quotesInTags}
          onQuotesInTagsChange={setQuotesInTags}
          quoteEscapeContractions={quoteEscapeContractions}
          onQuoteEscapeContractionsChange={setQuoteEscapeContractions}
          quoteAllowNesting={quoteAllowNesting}
          onQuoteAllowNestingChange={setQuoteAllowNesting}
          quoteDetectInner={quoteDetectInner}
          onQuoteDetectInnerChange={setQuoteDetectInner}
          linkEnabled={linkEnabled}
          onLinkEnabledChange={setLinkEnabled}
          openLinksOnClick={openLinksOnClick}
          onOpenLinksOnClickChange={setOpenLinksOnClick}
          editorDir={editorDir}
          onEditorDirChange={setEditorDir}
          popoverDir={popoverDir}
          onPopoverDirChange={setPopoverDir}
          jpFont={jpFont}
          onJpFontChange={setJpFont}
          editorEditable={editorEditable}
          onEditorEditableChange={(v) => {
            setEditorEditable(v)
            if (v) setReadOnlySelectable(false)
          }}
          readOnlySelectable={readOnlySelectable}
          onReadOnlySelectableChange={setReadOnlySelectable}
          settingsExtra={
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Row count
                </Label>
                <Input
                  className="h-7 text-xs"
                  type="number"
                  min={1}
                  max={10000000}
                  value={rowCount}
                  onChange={(e) =>
                    setRowCount(
                      Math.max(
                        1,
                        Math.min(10_000_000, parseInt(e.target.value) || 1),
                      ),
                    )
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={dynamicHeight}
                  onChange={(e) => setDynamicHeight(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                Dynamic row height
              </label>
            </>
          }
          searchValue={searchInput}
          onSearchChange={(e) => {
            const v = e.target.value
            setSearchInput(v)
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
            searchTimerRef.current = setTimeout(() => setSearchKeywords(v), 300)
          }}
          afterSearch={
            <>
              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={searchFilterRows}
                  onChange={(e) => setSearchFilterRows(e.target.checked)}
                  className="h-3 w-3 rounded border-border"
                />
                Filter rows
              </label>
              <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                {effectiveRowCount.toLocaleString()}
                {filteredRowIndices
                  ? ` / ${rowCount.toLocaleString()}`
                  : ''}{' '}
                rows
              </span>
            </>
          }
        />

        <CATEditorLegend />

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!crossHistory.canUndo}
            onClick={crossHistory.undo}
            className="gap-1.5"
          >
            <Undo2 className="h-4 w-4" />
            Undo
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!crossHistory.canRedo}
            onClick={crossHistory.redo}
            className="gap-1.5"
          >
            <Redo2 className="h-4 w-4" />
            Redo
          </Button>
          <span className="text-xs text-muted-foreground ml-2">
            Cross-editor history (Ctrl+Z / Ctrl+Y)
          </span>
        </div>

        <CATEditorSnippetsAndFlash
          snippets={TEXT_SNIPPETS}
          flashRanges={FLASH_RANGES}
          disabled={focusedRow === null}
          onInsertText={handleInsertText}
          onSetText={handleSetText}
          onFlashRange={handleFlashRange}
        />

        <VirtualScrollArea
          resetKey={resetKey}
          effectiveRowCount={effectiveRowCount}
          toOriginalIndex={toOriginalIndex}
          rangeExtractor={rangeExtractor}
          dynamicHeight={dynamicHeight}
          rules={rules}
          editorDir={editorDir}
          popoverDir={popoverDir}
          jpFont={jpFont}
          editorEditable={editorEditable}
          readOnlySelectable={readOnlySelectable}
          openLinksOnClick={openLinksOnClick}
          onFocusRow={handleFocusRow}
          onEditorKeyDown={handleEditorKeyDown}
          registerEditorRef={registerEditorRef}
          virtualizerRef={virtualizerRef}
          compressionRef={compressionRef}
        />
      </div>
    </div>
  )
}
