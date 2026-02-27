import { createFileRoute } from '@tanstack/react-router'
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import { Popover } from '@base-ui/react/popover'
import {
  BookOpen,
  Code,
  Database,
  Eye,
  Link2,
  Minus,
  Plus,
  Quote,
  RotateCcw,
  Search,
  Settings,
  Zap,
} from 'lucide-react'

import type { DetectQuotesOptions } from '@/utils/detect-quotes'
import type { Range } from '@tanstack/react-virtual'

import type {
  IKeywordsEntry,
  IKeywordsRule,
  ILinkRule,
  IQuoteRule,
  ITagRule,
  MooRule,
} from '@/layout/cat-editor'
import { CATEditor } from '@/layout/cat-editor'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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

// ─── Toolbar popover button ──────────────────────────────────────────────────

function ToolbarPopoverButton({
  label,
  icon,
  enabled,
  onToggle,
  children,
}: {
  label: string
  icon: React.ReactNode
  enabled: boolean
  onToggle: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors
              ${enabled ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20' : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'}
            `}
          />
        }
      >
        {icon}
        {label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} side="bottom" align="start">
          <Popover.Popup className="z-50 w-80 max-h-[70vh] overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-lg p-3 space-y-3 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 origin-(--transform-origin) transition-[transform,scale,opacity] duration-150">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{label}</span>
              <Switch checked={enabled} onCheckedChange={onToggle} />
            </div>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

// ─── Shared keyword editor ──────────────────────────────────────────────────

function KeywordEditor({
  entries,
  onUpdate,
  onRemove,
  onAdd,
}: {
  entries: Array<IKeywordsEntry>
  onUpdate: (idx: number, patch: Partial<IKeywordsEntry>) => void
  onRemove: (idx: number) => void
  onAdd: () => void
}) {
  return (
    <>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {entries.map((e, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded border border-border/50 bg-background p-1.5"
          >
            <Input
              className="h-7 text-xs flex-1 font-mono"
              value={e.pattern}
              placeholder="Pattern (e.g. fox|dog, \\bAPI\\b)"
              onChange={(ev) => onUpdate(i, { pattern: ev.target.value })}
            />
            <Input
              className="h-7 text-xs flex-1"
              value={e.description ?? ''}
              placeholder="Description (optional)"
              onChange={(ev) =>
                onUpdate(i, { description: ev.target.value || undefined })
              }
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => onRemove(i)}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" className="mt-2" onClick={onAdd}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add entry
      </Button>
    </>
  )
}

// ─── Memoised editor row ─────────────────────────────────────────────────────

const EditorRow = memo(function EditorRow({
  index,
  text,
  rules,
  onFocus,
  onBlur,
}: {
  index: number
  text: string
  rules: Array<MooRule>
  onFocus: (index: number) => void
  onBlur: () => void
}) {
  return (
    <div
      className="flex items-stretch gap-3 "
      onFocusCapture={() => onFocus(index)}
      onBlurCapture={(e) => {
        // Only clear if focus is leaving this row entirely
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          onBlur()
        }
      }}
    >
      <div className="flex items-center justify-center w-12 shrink-0 text-xs font-mono text-muted-foreground bg-muted/30 rounded-l-lg border-r border-border">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0 py-1">
        <CATEditor
          initialText={text}
          rules={rules}
          placeholder={`Row ${index + 1}`}
          className="cat-perf-row-editor [&_.cat-editor-root]:min-h-0!"
        />
      </div>
    </div>
  )
})

// ─── Main demo component ─────────────────────────────────────────────────────

function CATEditorPerfDemo() {
  const [resetKey, setResetKey] = useState(0)

  // ── Rule enable/disable toggles ──────────────────────────────────────
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

  // ── Editable rule data ───────────────────────────────────────────────
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
  const handleBlurRow = useCallback(() => {
    setFocusedRow(null)
  }, [])

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
        <div className="flex items-center gap-2 flex-wrap rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
          {/* Reset */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-7 px-2 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>

          <div className="w-px h-5 bg-border" />

          {/* LexiQA */}
          <ToolbarPopoverButton
            label="LexiQA"
            icon={<BookOpen className="h-3.5 w-3.5" />}
            enabled={lexiqaEnabled}
            onToggle={setLexiqaEnabled}
          >
            <KeywordEditor
              entries={lexiqaEntries}
              onUpdate={(idx, patch) =>
                updateKeyword(setLexiqaEntries, idx, patch)
              }
              onRemove={(idx) => removeKeyword(setLexiqaEntries, idx)}
              onAdd={() => addKeyword(setLexiqaEntries)}
            />
          </ToolbarPopoverButton>

          {/* TB Target */}
          <ToolbarPopoverButton
            label="TB Target"
            icon={<Database className="h-3.5 w-3.5" />}
            enabled={tbTargetEnabled}
            onToggle={setTbTargetEnabled}
          >
            <KeywordEditor
              entries={tbEntries}
              onUpdate={(idx, patch) => updateKeyword(setTbEntries, idx, patch)}
              onRemove={(idx) => removeKeyword(setTbEntries, idx)}
              onAdd={() => addKeyword(setTbEntries)}
            />
          </ToolbarPopoverButton>

          {/* Special Chars */}
          <ToolbarPopoverButton
            label="Special"
            icon={<Eye className="h-3.5 w-3.5" />}
            enabled={specialCharEnabled}
            onToggle={setSpecialCharEnabled}
          >
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {specialCharEntries.map((e, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded border border-border/50 bg-background p-1"
                >
                  <Input
                    className="h-6 text-xs flex-1"
                    value={e.description ?? ''}
                    placeholder="Name"
                    onChange={(ev) =>
                      updateSpecialChar(i, {
                        description: ev.target.value || undefined,
                      })
                    }
                  />
                  <Input
                    className="h-6 text-xs w-24 font-mono"
                    value={e.pattern}
                    placeholder="Pattern"
                    onChange={(ev) =>
                      updateSpecialChar(i, { pattern: ev.target.value })
                    }
                  />
                  <Input
                    className="h-6 text-xs w-10 text-center font-mono"
                    value={e.displaySymbol ?? ''}
                    placeholder="—"
                    onChange={(ev) =>
                      updateSpecialChar(i, {
                        displaySymbol: ev.target.value || undefined,
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeSpecialChar(i)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-6 text-xs"
              onClick={addSpecialChar}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add
            </Button>
          </ToolbarPopoverButton>

          {/* Tags */}
          <ToolbarPopoverButton
            label="Tags"
            icon={<Code className="h-3.5 w-3.5" />}
            enabled={tagsEnabled}
            onToggle={setTagsEnabled}
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={tagsCollapsed}
                    onCheckedChange={setTagsCollapsed}
                  />
                  <Label className="text-xs">Collapse</Label>
                </div>
                {tagsCollapsed && (
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={tagCollapseScope === 'html-only'}
                      onCheckedChange={(v) =>
                        setTagCollapseScope(v ? 'html-only' : 'all')
                      }
                    />
                    <Label className="text-xs">HTML only</Label>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={tagsDetectInner}
                    onCheckedChange={setTagsDetectInner}
                  />
                  <Label className="text-xs">Inner</Label>
                </div>
              </div>
              <Input
                className="h-6 text-xs font-mono"
                value={tagPattern}
                placeholder="Regex pattern…"
                onChange={(e) => setTagPattern(e.target.value)}
              />
            </div>
          </ToolbarPopoverButton>

          {/* Quotes */}
          <ToolbarPopoverButton
            label="Quotes"
            icon={<Quote className="h-3.5 w-3.5" />}
            enabled={quotesEnabled}
            onToggle={setQuotesEnabled}
          >
            <div className="space-y-2">
              <div className="grid grid-cols-[auto_1fr_1fr] gap-1.5 items-center text-xs">
                <span />
                <span className="text-muted-foreground text-center text-[10px]">
                  Open
                </span>
                <span className="text-muted-foreground text-center text-[10px]">
                  Close
                </span>
                <span className="text-muted-foreground">Single</span>
                <Input
                  className="h-6 text-xs text-center font-mono"
                  value={singleQuoteOpen}
                  onChange={(e) => setSingleQuoteOpen(e.target.value)}
                />
                <Input
                  className="h-6 text-xs text-center font-mono"
                  value={singleQuoteClose}
                  onChange={(e) => setSingleQuoteClose(e.target.value)}
                />
                <span className="text-muted-foreground">Double</span>
                <Input
                  className="h-6 text-xs text-center font-mono"
                  value={doubleQuoteOpen}
                  onChange={(e) => setDoubleQuoteOpen(e.target.value)}
                />
                <Input
                  className="h-6 text-xs text-center font-mono"
                  value={doubleQuoteClose}
                  onChange={(e) => setDoubleQuoteClose(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={quotesInTags}
                    onCheckedChange={setQuotesInTags}
                  />
                  <Label className="text-xs">In tags</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={quoteEscapeContractions}
                    onCheckedChange={setQuoteEscapeContractions}
                  />
                  <Label className="text-xs">Contractions</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={quoteAllowNesting}
                    onCheckedChange={setQuoteAllowNesting}
                  />
                  <Label className="text-xs">Nesting</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={quoteDetectInner}
                    onCheckedChange={setQuoteDetectInner}
                  />
                  <Label className="text-xs">Inner</Label>
                </div>
              </div>
            </div>
          </ToolbarPopoverButton>

          {/* Links */}
          <ToolbarPopoverButton
            label="Links"
            icon={<Link2 className="h-3.5 w-3.5" />}
            enabled={linkEnabled}
            onToggle={setLinkEnabled}
          >
            <p className="text-xs text-muted-foreground">
              Auto-detects URLs (http/https and www-prefixed).
            </p>
          </ToolbarPopoverButton>

          {/* Settings */}
          <ToolbarPopoverButton
            label="Settings"
            icon={<Settings className="h-3.5 w-3.5" />}
            enabled={true}
            onToggle={() => {}}
          >
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Direction
                </Label>
                <Select
                  value={editorDir}
                  onValueChange={(v) =>
                    setEditorDir(v as 'ltr' | 'rtl' | 'auto')
                  }
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ltr">LTR</SelectItem>
                    <SelectItem value="rtl">RTL</SelectItem>
                    <SelectItem value="auto">Auto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Row count
                </Label>
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
                        Math.min(10000, parseInt(e.target.value) || 1),
                      ),
                    )
                  }
                />
              </div>
            </div>
          </ToolbarPopoverButton>

          <div className="w-px h-5 bg-border" />

          {/* Search inline */}
          <div className="flex items-center gap-1.5 flex-1 min-w-30 max-w-60">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              value={searchInput}
              onChange={(e) => {
                const v = e.target.value
                setSearchInput(v)
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
                searchTimerRef.current = setTimeout(
                  () => setSearchKeywords(v),
                  300,
                )
              }}
              placeholder="Search…"
              className="h-7 text-xs"
            />
          </div>

          {/* Row count badge */}
          <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
            {rowCount.toLocaleString()} rows
          </span>
        </div>

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
                  onBlur={handleBlurRow}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
