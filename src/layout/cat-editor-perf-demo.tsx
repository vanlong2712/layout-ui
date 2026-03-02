import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { defaultRangeExtractor } from '@tanstack/react-virtual'
import {
  ArrowDownToLine,
  Redo2,
  StretchHorizontal,
  Undo2,
  Zap,
} from 'lucide-react'

import type { DetectQuotesOptions } from '@/utils/detect-quotes'
import type { Range } from '@tanstack/react-virtual'

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
} from '@/layout/cat-editor'
import {
  EditorGridStoreProvider,
  clearEditorRefs,
  deleteEditorRef,
  getCrossHistory,
  getEditorRef,
  getVirtualizer,
  setEditorRef,
  setFocusedRow,
  setVirtualizer,
  useEditorGridStore,
  useGridCrossHistory,
  useGridFocusedRow,
} from '@/hooks/use-editor-grid-store'

import { CATEditor } from '@/layout/cat-editor'
import {
  getMaxDivHeight,
  useMassiveVirtualizer,
} from '@/hooks/use-massive-virtualizer'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  CATEditorLegend,
  CATEditorSnippetsAndFlash,
  CATEditorToolbar,
} from '@/components/cat-editor-toolbar'
// (cn removed — unused)

// ─── Constants ───────────────────────────────────────────────────────────────

const TOTAL_ROWS = 1000
const ROW_HEIGHT = 140
/**
 * Maximum row count.  TanStack Virtual creates a `measurementsCache` array
 * with one object per row (~96 bytes each).  Beyond 100 K the sync build
 * pass takes hundreds of ms and consumes ~100 MB, risking an OOM crash.
 */
const MAX_ROW_COUNT = 1_000_000

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

/**
 * Generate sample text for a row index.  Deterministic (seeded RNG) so the
 * same index always produces the same text.  No cache — generation is fast
 * enough (~0.01 ms) and caching 1 M strings would consume ~500 MB.
 */
function getSampleText(index: number): string {
  return generateSampleText(index)
}

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
  {
    pattern: '\\n',
    description: 'Line Break',
    atomic: true,
    displaySymbol: '\u23CE',
  },
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
      className="flex items-stretch gap-3"
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

// ─── Virtualized editor list (isolated from toolbar state) ──────────────────

const VirtualizedEditorList = memo(function VirtualizedEditorList({
  resetKey,
  effectiveRowCount,
  toOriginalIndex,
  focusedRow,
  rules,
  onFocusRow,
  onKeyDown,
  registerRef,
  dir,
  popoverDir,
  jpFont,
  editable,
  readOnlySelectable,
  openLinksOnClick,
  store,
  fixedHeight,
  onStretchChange,
}: {
  resetKey: number
  effectiveRowCount: number
  toOriginalIndex: (index: number) => number
  focusedRow: number | null
  rules: Array<MooRule>
  onFocusRow: (index: number) => void
  onKeyDown: (event: KeyboardEvent) => boolean
  registerRef: (index: number, instance: CATEditorRef | null) => void
  dir?: 'ltr' | 'rtl' | 'auto'
  popoverDir?: 'ltr' | 'rtl' | 'auto' | 'inherit'
  jpFont?: boolean
  editable?: boolean
  readOnlySelectable?: boolean
  openLinksOnClick?: boolean
  store: ReturnType<typeof useEditorGridStore>
  fixedHeight?: boolean
  onStretchChange?: (isStretching: boolean) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)

  const rangeExtractor = useCallback(
    (range: Range) => {
      const result = defaultRangeExtractor(range)
      const focused = focusedRow
      if (focused !== null && !result.includes(focused)) {
        result.push(focused)
        result.sort((a, b) => a - b)
      }
      return result
    },
    [focusedRow],
  )

  // Pre-compute whether stretching is likely, so we can scale overscan.
  // In stretch mode the virtual→physical ratio is ~4.67×, meaning
  // physical overscan covers ~4.67× fewer rows.  Scaling overscan
  // keeps the physical overscan distance roughly the same.
  const wouldStretch = effectiveRowCount * ROW_HEIGHT > getMaxDivHeight()
  const overscan = wouldStretch && fixedHeight ? 20 : 5

  const { virtualizer, containerHeight, rowOffset, scrollToRow } =
    useMassiveVirtualizer({
      count: effectiveRowCount,
      getItemKey: toOriginalIndex,
      getScrollElement: () => parentRef.current,
      estimateSize: () => ROW_HEIGHT,
      overscan,
      ...(fixedHeight
        ? {}
        : {
            measureElement: (el: Element) => el.getBoundingClientRect().height,
          }),
      rangeExtractor,
    })

  // Write the virtualizer result into the store so every component can
  // access it without prop-drilling.  We build the result object once per
  // render and write it imperatively (no re-render triggered here).
  const isStretchingNow = containerHeight !== virtualizer.getTotalSize()
  const stretchRatio = isStretchingNow
    ? virtualizer.getTotalSize() / containerHeight
    : 1

  const virtualizerResult = useRef<ReturnType<typeof getVirtualizer>>(null)
  if (!virtualizerResult.current) {
    virtualizerResult.current = {
      virtualizer,
      containerHeight,
      isStretching: isStretchingNow,
      rowOffset,
      scrollToRow,
      stretchRatio,
    }
  }
  const vRef = virtualizerResult.current
  vRef.virtualizer = virtualizer
  vRef.containerHeight = containerHeight
  vRef.rowOffset = rowOffset
  vRef.isStretching = isStretchingNow
  vRef.scrollToRow = scrollToRow
  vRef.stretchRatio = stretchRatio
  // Push the mutable result object into the store (reference-stable).
  if (store.state.virtualizer !== virtualizerResult.current) {
    setVirtualizer(store, virtualizerResult.current)
  }

  // Notify parent when stretch state changes (only fires on transition).
  const prevStretchingRef = useRef(isStretchingNow)
  if (isStretchingNow !== prevStretchingRef.current) {
    prevStretchingRef.current = isStretchingNow
    // Schedule in a microtask to avoid setState-during-render warning.
    queueMicrotask(() => onStretchChange?.(isStretchingNow))
  }

  return (
    <div
      key={resetKey}
      ref={parentRef}
      className="rounded-xl border border-border bg-card shadow-sm overflow-auto"
      style={{ height: '75vh' }}
    >
      <div
        style={{
          height: `${containerHeight}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const originalIndex = toOriginalIndex(virtualRow.index)
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={fixedHeight ? undefined : virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start - rowOffset}px)`,
                ...(fixedHeight
                  ? { height: `${ROW_HEIGHT}px`, overflow: 'hidden' }
                  : {}),
              }}
              className="border-b border-border/50"
            >
              <EditorRow
                index={originalIndex}
                text={getSampleText(originalIndex)}
                rules={rules}
                onFocus={onFocusRow}
                onKeyDown={onKeyDown}
                registerRef={registerRef}
                dir={dir}
                popoverDir={popoverDir}
                jpFont={jpFont}
                editable={editable}
                readOnlySelectable={readOnlySelectable}
                openLinksOnClick={openLinksOnClick}
                disableHistory
              />
            </div>
          )
        })}
      </div>
    </div>
  )
})

// ─── Main demo component ─────────────────────────────────────────────────────

/** Public export — wraps the inner demo with the EditorGridStore provider. */
export function CATEditorPerfDemo() {
  return (
    <EditorGridStoreProvider>
      <CATEditorPerfDemoInner />
    </EditorGridStoreProvider>
  )
}

function CATEditorPerfDemoInner() {
  const store = useEditorGridStore()
  const crossHistory = useGridCrossHistory()
  const focusedRow = useGridFocusedRow()
  const [resetKey, setResetKey] = useState(0)
  const [fixedHeight, setFixedHeight] = useState(false)
  const [isStretching, setIsStretching] = useState(false)

  /**
   * Scroll to a row, centering it in the viewport.
   * Delegates to useMassiveVirtualizer's `scrollToRow` which handles
   * both normal and stretching modes transparently.
   */
  const scrollToRow = useCallback(
    (rowIndex: number) => {
      getVirtualizer(store)?.scrollToRow(rowIndex, { align: 'center' })
    },
    [store],
  )

  /**
   * Scroll to a row AND focus its editor once mounted.
   * Polls up to ~600 ms for the editor ref to appear, then calls
   * `focusStart()` so the caret is visible.
   *
   * Uses an epoch guard so that re-invocation (or unmount) instantly
   * invalidates all stale rAF / setTimeout callbacks.
   */
  const focusPollEpochRef = useRef(0)
  const scrollToRowAndFocus = useCallback(
    (rowIndex: number) => {
      const epoch = ++focusPollEpochRef.current

      scrollToRow(rowIndex)
      setFocusedRow(store, rowIndex)

      // If editor is already mounted, focus immediately.
      const immediate = getEditorRef(store, rowIndex)
      if (immediate) {
        immediate.focusEnd()
        return
      }

      // Otherwise poll until the editor mounts.
      let attempts = 0
      const poll = () => {
        if (focusPollEpochRef.current !== epoch) return
        const ref = getEditorRef(store, rowIndex)
        if (ref) {
          ref.focusEnd()
          return
        }
        if (++attempts < 20) {
          setTimeout(poll, 30)
        }
      }
      requestAnimationFrame(poll)
    },
    [store, scrollToRow],
  )

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

  // ── Unmount cleanup: clear all pending timers ──
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      if (flashDemoTimerRef.current) clearTimeout(flashDemoTimerRef.current)
      // Invalidate any in-flight scrollToRowAndFocus poll chain
      focusPollEpochRef.current++
    }
  }, [])

  const [rowCount, setRowCount] = useState(TOTAL_ROWS)

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
    setFixedHeight(false)
    setIsStretching(false)
    setFocusedRow(store, null)
    getCrossHistory(store)?.clearHistory()
    setResetKey((k) => k + 1)
  }, [store])

  const handleFixedHeightToggle = useCallback(
    (checked: boolean) => {
      setFixedHeight(checked)
      setIsStretching(false)
      setFocusedRow(store, null)
      getCrossHistory(store)?.clearHistory()
      clearEditorRefs(store)
      setVirtualizer(store, null)
      setResetKey((k) => k + 1)
    },
    [store],
  )

  const handleFocusRow = useCallback(
    (index: number) => {
      setFocusedRow(store, index)
    },
    [store],
  )

  const registerEditorRef = useCallback(
    (index: number, instance: CATEditorRef | null) => {
      if (instance) {
        setEditorRef(store, index, instance)
        getCrossHistory(store)?.registerEditor(index, instance)
      } else {
        deleteEditorRef(store, index)
        getCrossHistory(store)?.unregisterEditor(index)
      }
    },
    [store],
  )

  const focusedRowRef = useRef(focusedRow)
  focusedRowRef.current = focusedRow
  const rowCountRef = useRef(rowCount)
  rowCountRef.current = rowCount

  const handleAfterApply = useCallback(
    (rowIndex: number) => setFocusedRow(store, rowIndex),
    [store],
  )

  const handleEditorKeyDown = useCallback(
    (event: KeyboardEvent): boolean => {
      const row = focusedRowRef.current
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (key === 'z' && !event.shiftKey) {
          event.preventDefault()
          getCrossHistory(store)?.undo(undefined, handleAfterApply)
          return true
        }
        if (key === 'y' || (key === 'z' && event.shiftKey)) {
          event.preventDefault()
          getCrossHistory(store)?.redo(undefined, handleAfterApply)
          return true
        }
      }
      if (row === null) return false
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const editorRef = getEditorRef(store, row)
        if (!editorRef) return false
        const sel = editorRef.getSelection()
        if (!sel || sel.anchor !== sel.focus) return false
        const navigateTo = (targetRow: number, position: 'start' | 'end') => {
          scrollToRow(targetRow)
          requestAnimationFrame(() => {
            const targetRef = getEditorRef(store, targetRow)
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
    },
    [store, scrollToRow, handleAfterApply],
  )
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
      if (focusedRow !== null) {
        getEditorRef(store, focusedRow)?.flashHighlight(annId, durationMs)
      }
      flashDemoTimerRef.current = setTimeout(() => {
        setFlashedSpellcheckId(null)
      }, durationMs)
    },
    [store, focusedRow],
  )

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

  const [scrollToInput, setScrollToInput] = useState('')

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
            virtualized rows &middot; {fixedHeight ? 'fixed' : 'dynamic'} height
            &middot;{' '}
            <code className="text-xs bg-muted px-1 rounded">
              @tanstack/react-virtual
            </code>{' '}
            &middot; modular v2 architecture
            {isStretching && (
              <>
                {' '}
                &middot;{' '}
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                  <StretchHorizontal className="inline h-3.5 w-3.5" />
                  stretch mode
                </span>
              </>
            )}
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
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Row count
                </Label>
                <Input
                  className="h-7 text-xs"
                  type="number"
                  min={1}
                  max={MAX_ROW_COUNT}
                  value={rowCount}
                  onChange={(e) =>
                    setRowCount(
                      Math.max(
                        1,
                        Math.min(MAX_ROW_COUNT, parseInt(e.target.value) || 1),
                      ),
                    )
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={fixedHeight}
                  onChange={(e) => handleFixedHeightToggle(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                Fixed row height ({ROW_HEIGHT}px)
              </label>
            </div>
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
            disabled={!crossHistory?.canUndo}
            onClick={() => crossHistory?.undo(undefined, handleAfterApply)}
            className="gap-1.5"
          >
            <Undo2 className="h-4 w-4" />
            Undo
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!crossHistory?.canRedo}
            onClick={() => crossHistory?.redo(undefined, handleAfterApply)}
            className="gap-1.5"
          >
            <Redo2 className="h-4 w-4" />
            Redo
          </Button>
          <span className="text-xs text-muted-foreground ml-2">
            Cross-editor history (Ctrl+Z / Ctrl+Y)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">
            Scroll to row
          </Label>
          <Input
            className="h-7 text-xs w-28"
            type="number"
            min={1}
            max={rowCount}
            placeholder={`1–${rowCount.toLocaleString()}`}
            value={scrollToInput}
            onChange={(e) => setScrollToInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const idx = parseInt(scrollToInput) - 1
                if (idx >= 0 && idx < rowCount) {
                  scrollToRowAndFocus(idx)
                }
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              const idx = parseInt(scrollToInput) - 1
              if (idx >= 0 && idx < rowCount) {
                scrollToRowAndFocus(idx)
              }
            }}
          >
            <ArrowDownToLine className="h-4 w-4" />
            Go
          </Button>
        </div>

        <CATEditorSnippetsAndFlash
          snippets={TEXT_SNIPPETS}
          flashRanges={FLASH_RANGES}
          disabled={focusedRow === null}
          onInsertText={(text) => {
            if (focusedRow !== null) {
              getEditorRef(store, focusedRow)?.insertText(text)
            }
          }}
          onSetText={(text) => {
            if (focusedRow !== null) {
              getEditorRef(store, focusedRow)?.setText(text)
            }
          }}
          onFlashRange={(start, end, ms) => {
            if (focusedRow !== null) {
              getEditorRef(store, focusedRow)?.flashRange(start, end, ms)
            }
          }}
        />

        <VirtualizedEditorList
          key={fixedHeight ? 'fixed' : 'dynamic'}
          resetKey={resetKey}
          effectiveRowCount={effectiveRowCount}
          toOriginalIndex={toOriginalIndex}
          focusedRow={focusedRow}
          rules={rules}
          onFocusRow={handleFocusRow}
          onKeyDown={handleEditorKeyDown}
          registerRef={registerEditorRef}
          dir={editorDir}
          popoverDir={popoverDir}
          jpFont={jpFont}
          editable={editorEditable}
          readOnlySelectable={readOnlySelectable}
          openLinksOnClick={openLinksOnClick}
          store={store}
          fixedHeight={fixedHeight}
          onStretchChange={setIsStretching}
        />
      </div>
    </div>
  )
}
