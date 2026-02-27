import { createFileRoute } from '@tanstack/react-router'
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import { Zap } from 'lucide-react'

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
import { CATEditor } from '@/layout/cat-editor'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  CATEditorLegend,
  CATEditorSnippetsAndFlash,
  CATEditorToolbar,
} from '@/components/cat-editor-toolbar'

export const Route = createFileRoute('/demo/cat-editor-perf')({
  component: CATEditorPerfDemo,
})

// ─── Constants ───────────────────────────────────────────────────────────────

const TOTAL_ROWS = 1000
const ROW_HEIGHT = 140

// ─── Sample text generation ──────────────────────────────────────────────────

const SENTENCE_POOL = [
  // ── Plain / keyword sentences ───────────────────────────────────
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

  // ── Tags & placeholders ───────────────────────────────────────────
  '<a href="https://example.com">Click <b>here</b> for more</a> info <br/> end.',
  'Hello {{userName}}, your order ${orderId} is ready. Total: $amount — use code %PROMO.',
  '<span class="highlight">Important</span> text with <em>emphasis</em> and <strong>bold</strong>.',
  'Template: {{firstName}} {{lastName}} — ID: ${uniqueId} — ref: %REF_CODE.',
  '<div class="card"><h2>Title</h2><p>Body text with {{variable}} here.</p></div>',
  'Inline tags: <b>bold</b>, <i>italic</i>, <u>underline</u>, <code>code</code> mix.',
  'Nested: <div><span>{{deepVar}}</span> and ${nested} with %PLACEHOLDER end.</div>',
  '<img src="photo.jpg" alt="fox" /> with <a href="/endpoint">link</a> nearby.',

  // ── Quotes ─────────────────────────────────────────────────────────
  'She said "run away" and he replied \'OK fine\' before leaving the room.',
  "The sign reads \"No entry\" but some say 'it's just a suggestion' anyway.",
  '"Double quoted text" followed by \'single quoted text\' in the same line.',
  "He whispered \"don't go\" and she answered 'I won't' with a smile.",
  "The manual says \"use the API endpoint\" and warns 'don't forget auth' tokens.",
  '"Translation note: the fox" — \'use target glossary\' for this term.',

  // ── Links ──────────────────────────────────────────────────────────
  'Visit https://github.com/lexical or www.example.com for details.',
  'Documentation at https://docs.example.com/api/v2 and www.translate.io is online.',
  'Link test: https://cdn.example.com/assets/logo.png and www.fox-endpoint.org here.',
  'See https://en.wikipedia.org/wiki/Translation for reference materials.',

  // ── Special characters & whitespace ────────────────────────────────
  'Tom & Jerry\u00A0say\u2009hello\u2003world\u200Bhidden\u2060join\u200Ahair.',
  'Spaces:\u00A0non-break \u2009thin \u2003em \u200Ahair — visible & invisible.',
  'Zero-width:\u200Bhidden\u200Cbreaker\u200Djoiner\u2060word between letters.',
  'Tab\there and\tthere again with & ampersand & more & symbols.',
  'Mixed: \u00A0Tom & Jerry\u2009visited the\u2003API endpoint\u200Btoday.',
  'The fox & hound\u00A0ran through\u2009thin\u2003em spaces to\u200Ahair end.',

  // ── Multi-rule combos (tag + quote + keyword + special) ────────────
  'The fox said "hello" at the <b>API endpoint</b> with\u00A0spaces & more.',
  'Visit <a href="https://example.com">the endpoint</a> — fox & friends\u2009say hi.',
  '{{userName}} wrote "check the API endpoint" with\u00A0non-breaking & amp.',
  "She said 'the fox' in <i>italics</i> near\u2003em-space and the HTTP request.",
  'Tag <code>$amount</code> with "quotes" & ampersand\u200Band\u2060joiners nearby.',
  'The <b>fox</b> & <i>endpoint</i> visited {{place}} — "nice" \'spot\' at\u00A0noon.',
  'Result: <span>${orderId}</span> — "confirmed" \'order\' for the API endpoint & co.',
  'Nested: <div>"fox"</div> & \'endpoint\' with\u2009thin at https://example.com link.',

  // ── Longer multi-sentence blocks ───────────────────────────────────
  'The API endpoint handled 500 HTTP requests per second. The fox monitored the logs. Meanwhile, the endpoint scaled automatically.',
  'Testing <b>bold</b> and <i>italic</i> mixed with "double quotes" and \'single quotes\' near the endpoint & gateway.',
  'Tom & Jerry\u00A0visited\u2009the\u2003fox at https://example.com and typed "hello world" into \'the box\' near the API endpoint.',
  'The {{userName}} fox jumped over $amount — "incredible" \'speed\' at the <a href="/api">endpoint</a> with\u00A0spaces & more & links.',
  'Multiple sentences with rules. The fox ran. The API endpoint responded. She said "OK" and \'bye\'. Visit www.example.com today.',
  'Full mix: <b>{{name}}</b> & "fox" \'endpoint\' HTTP request at\u00A0noon\u2009thin\u2003em — https://docs.example.com/fox link.',
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

/** Deterministic pseudo-random number from seed */
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** Generate a unique sample text for row index — ~3x longer, exercises most rules */
function generateSampleText(index: number): string {
  const rng = seededRandom(index + 1)
  const sentenceCount = 6 + Math.floor(rng() * 5) // 6-10 sentences
  const sentences: Array<string> = []
  const used = new Set<number>()
  for (let i = 0; i < sentenceCount; i++) {
    let idx = Math.floor(rng() * SENTENCE_POOL.length)
    // Avoid too many duplicates in the same row
    let attempts = 0
    while (used.has(idx) && attempts < 5) {
      idx = Math.floor(rng() * SENTENCE_POOL.length)
      attempts++
    }
    used.add(idx)
    sentences.push(SENTENCE_POOL[idx])
  }

  // Intersperse newlines for multi-line content (~50% of rows)
  if (rng() < 0.5 && sentences.length > 3) {
    const nlPos = 2 + Math.floor(rng() * (sentences.length - 3))
    sentences[nlPos] = sentences[nlPos] + '\n'
  }

  let text = sentences.join(' ')

  // Inject 1-2 typos in ~60% of rows
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

// Pre-generate all sample texts
const SAMPLE_TEXTS = Array.from({ length: TOTAL_ROWS }, (_, i) =>
  generateSampleText(i),
)

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
  { pattern: '\\t', description: 'Tab', atomic: true, displaySymbol: '⇥' },
  {
    pattern: '\\u00A0',
    description: 'Non-Breaking Space',
    atomic: true,
    displaySymbol: '⍽',
  },
  {
    pattern: '\\u2009',
    description: 'Thin Space',
    atomic: true,
    displaySymbol: '·',
  },
  {
    pattern: '\\u2003',
    description: 'Em Space',
    atomic: true,
    displaySymbol: '␣',
  },
  {
    pattern: '\\u200B',
    description: 'Zero-Width Space',
    atomic: true,
    displaySymbol: '∅',
  },
  {
    pattern: '\\u2060',
    description: 'Word Joiner',
    atomic: true,
    displaySymbol: '⁀',
  },
  {
    pattern: '\\u200A',
    description: 'Hair Space',
    atomic: true,
    displaySymbol: '·',
  },
  { pattern: ' ', description: 'Space', atomic: true },
]

// ─── Text snippet & flash-range presets ──────────────────────────────────────

const TEXT_SNIPPETS = [
  { label: 'Hello World', text: 'Hello World' },
  { label: '©', text: '©' },
  { label: '™', text: '™' },
  { label: '®', text: '®' },
  { label: 'NBSP', text: '\u00A0' },
  { label: '→', text: '→' },
  { label: '—', text: '—' },
  { label: '…', text: '…' },
  { label: '«»', text: '«»' },
  { label: 'ZWS', text: '\u200B' },
  { label: 'Line break', text: '\n' },
]

const FLASH_RANGES = [
  { label: 'First 5 chars', start: 0, end: 5 },
  { label: 'Chars 10–25', start: 10, end: 25 },
  { label: 'Chars 30–45', start: 30, end: 45 },
  { label: 'Chars 50–60', start: 50, end: 60 },
  { label: 'Chars 0–20', start: 0, end: 20 },
  { label: 'Chars 25–50', start: 25, end: 50 },
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
        />
      </div>
    </div>
  )
})

// ─── Main demo component ─────────────────────────────────────────────────────

function CATEditorPerfDemo() {
  const [resetKey, setResetKey] = useState(0)

  // ── Rule enable/disable toggles ──────────────────────────────────────
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

  // ── Editor options ───────────────────────────────────────────────────
  const [editorDir, setEditorDir] = useState<'ltr' | 'rtl' | 'auto'>('ltr')
  const [popoverDir, setPopoverDir] = useState<
    'ltr' | 'rtl' | 'auto' | 'inherit'
  >('ltr')
  const [jpFont, setJpFont] = useState(false)
  const [editorEditable, setEditorEditable] = useState(true)
  const [readOnlySelectable, setReadOnlySelectable] = useState(false)
  const [openLinksOnClick, setOpenLinksOnClick] = useState(true)

  // ── Editable rule data ───────────────────────────────────────────────
  // Spellcheck validations
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

  // Tag options
  const [tagsCollapsed, setTagsCollapsed] = useState(false)
  const [tagsDetectInner, setTagsDetectInner] = useState(true)
  const [tagPattern, setTagPattern] = useState(DEFAULT_TAG_PATTERN)
  const [tagCollapseScope, setTagCollapseScope] = useState<'all' | 'html-only'>(
    'all',
  )

  // Quote options
  const [singleQuoteOpen, setSingleQuoteOpen] = useState('{')
  const [singleQuoteClose, setSingleQuoteClose] = useState('}')
  const [doubleQuoteOpen, setDoubleQuoteOpen] = useState('{{')
  const [doubleQuoteClose, setDoubleQuoteClose] = useState('}}')
  const [quotesInTags, setQuotesInTags] = useState(false)
  const [quoteEscapeContractions, setQuoteEscapeContractions] = useState(true)
  const [quoteAllowNesting, setQuoteAllowNesting] = useState(false)
  const [quoteDetectInner, setQuoteDetectInner] = useState(true)

  // Track which spellcheck annotation is currently flash-highlighted
  const [flashedSpellcheckId, setFlashedSpellcheckId] = useState<string | null>(
    null,
  )
  const flashDemoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Row count ────────────────────────────────────────────────────────
  const [rowCount, setRowCount] = useState(TOTAL_ROWS)

  // ── Helpers for editable lists ───────────────────────────────────────
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

  // ── Build active rules from state ────────────────────────────────────
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
    setResetKey((k) => k + 1)
  }, [])

  // ── Focus tracking ───────────────────────────────────────────────
  // Track the focused editor row index so we can pin it in the
  // virtualizer's range extractor — this keeps the DOM node alive
  // even when the user scrolls it out of the normal visible range,
  // preventing focus loss.
  const [focusedRow, setFocusedRow] = useState<number | null>(null)
  const handleFocusRow = useCallback((index: number) => {
    setFocusedRow(index)
  }, [])

  // ── Per-row editor ref map ───────────────────────────────────────
  // Stores CATEditorRef instances keyed by row index so the global
  // Text Snippets / Flash Range sections can target the focused editor.
  const editorRefsMap = useRef<Map<number, CATEditorRef>>(new Map())
  const registerEditorRef = useCallback(
    (index: number, instance: CATEditorRef | null) => {
      if (instance) {
        editorRefsMap.current.set(index, instance)
      } else {
        editorRefsMap.current.delete(index)
      }
    },
    [],
  )

  // ── Cross-editor caret navigation ────────────────────────────────
  // When the caret is at offset 0 and user presses ArrowUp → focus
  // the previous editor's end.  When at the last offset and user
  // presses ArrowDown → focus the next editor's start.
  // We use a ref for focusedRow to avoid re-creating the callback
  // (which would bust EditorRow's memo).
  const focusedRowRef = useRef(focusedRow)
  focusedRowRef.current = focusedRow
  const rowCountRef = useRef(rowCount)
  rowCountRef.current = rowCount

  const handleEditorKeyDown = useCallback((event: KeyboardEvent): boolean => {
    const row = focusedRowRef.current
    if (row === null) return false

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const editorRef = editorRefsMap.current.get(row)
      if (!editorRef) return false

      const sel = editorRef.getSelection()
      if (!sel || sel.anchor !== sel.focus) return false // only collapsed caret

      const navigateTo = (targetRow: number, position: 'start' | 'end') => {
        // Scroll the virtualizer so the target row is centered in the viewport
        virtualizerRef.current.scrollToIndex(targetRow, { align: 'center' })
        // Wait for the DOM to update, then focus
        requestAnimationFrame(() => {
          const targetRef = editorRefsMap.current.get(targetRow)
          if (targetRef) {
            if (position === 'end') {
              targetRef.focusEnd()
            } else {
              targetRef.focusStart()
            }
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

  // ── Spellcheck helpers ───────────────────────────────────────────
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

  /** Flash a spellcheck annotation on the focused editor. */
  const handleFlashSpellcheck = useCallback(
    (annId: string, durationMs = 5000) => {
      if (flashDemoTimerRef.current) clearTimeout(flashDemoTimerRef.current)
      setFlashedSpellcheckId(annId)
      if (focusedRow !== null) {
        editorRefsMap.current.get(focusedRow)?.flashHighlight(annId, durationMs)
      }
      flashDemoTimerRef.current = setTimeout(() => {
        setFlashedSpellcheckId(null)
      }, durationMs)
    },
    [focusedRow],
  )

  // Custom range extractor: always include the focused row so the
  // virtualizer never unmounts it (the editor needs the DOM node to
  // stay alive to retain focus).
  const rangeExtractor = useCallback(
    (range: Range) => {
      const result = defaultRangeExtractor(range)
      if (focusedRow !== null && !result.includes(focusedRow)) {
        result.push(focusedRow)
        result.sort((a, b) => a - b)
      }
      return result
    },
    [focusedRow],
  )

  // ── Virtualizer (dynamic row height) ──────────────────────────────
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    measureElement: (el) => el.getBoundingClientRect().height,
    rangeExtractor,
  })
  // Keep a ref to the virtualizer for the keydown handler
  const virtualizerRef = useRef(virtualizer)
  virtualizerRef.current = virtualizer

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-muted/30 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl flex items-center gap-3">
            <Zap className="h-8 w-8 text-amber-500" />
            CAT Editor — Performance Test
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            Stress-test with <strong>{rowCount.toLocaleString()}</strong>{' '}
            virtualized rows &middot; dynamic height &middot;{' '}
            <code className="text-xs bg-muted px-1 rounded">
              @tanstack/react-virtual
            </code>
          </p>
        </div>

        {/* ─── Compact toolbar ──────────────────────────────────────── */}
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
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Row count</Label>
              <Input
                className="h-7 text-xs"
                type="number"
                min={1}
                max={10000}
                value={rowCount}
                onChange={(e) =>
                  setRowCount(
                    Math.max(
                      1,
                      Math.min(1000000, parseInt(e.target.value) || 1),
                    ),
                  )
                }
              />
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
            <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
              {rowCount.toLocaleString()} rows
            </span>
          }
        />

        {/* ─── Legend ─────────────────────────────────────────────── */}
        <CATEditorLegend />

        {/* ─── Text Snippets & Flash Range ────────────────────────── */}
        <CATEditorSnippetsAndFlash
          snippets={TEXT_SNIPPETS}
          flashRanges={FLASH_RANGES}
          disabled={focusedRow === null}
          onInsertText={(text) => {
            if (focusedRow !== null) {
              editorRefsMap.current.get(focusedRow)?.insertText(text)
            }
          }}
          onSetText={(text) => {
            if (focusedRow !== null) {
              editorRefsMap.current.get(focusedRow)?.setText(text)
            }
          }}
          onFlashRange={(start, end, ms) => {
            if (focusedRow !== null) {
              editorRefsMap.current.get(focusedRow)?.flashRange(start, end, ms)
            }
          }}
        />

        {/* ─── Virtualized editor rows ────────────────────────────── */}
        <div
          key={resetKey}
          ref={parentRef}
          className="rounded-xl border border-border bg-card shadow-sm overflow-auto"
          style={{ height: '75vh' }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="border-b border-border/50"
              >
                <EditorRow
                  index={virtualRow.index}
                  text={SAMPLE_TEXTS[virtualRow.index] ?? ''}
                  rules={rules}
                  onFocus={handleFocusRow}
                  onKeyDown={handleEditorKeyDown}
                  registerRef={registerEditorRef}
                  dir={editorDir}
                  popoverDir={popoverDir}
                  jpFont={jpFont}
                  editable={editorEditable}
                  readOnlySelectable={readOnlySelectable}
                  openLinksOnClick={openLinksOnClick}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
