import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { CheckCircle2, Plus } from 'lucide-react'

import type { DetectQuotesOptions } from '@/utils/detect-quotes'

import type {
  CATEditorRef,
  IKeywordsEntry,
  IKeywordsRule,
  ILinkRule,
  IMentionRule,
  IMentionUser,
  IQuoteRule,
  ISpellCheckRule,
  ISpellCheckValidation,
  ITagRule,
  MentionDOMRenderer,
  MooRule,
  RuleAnnotation,
} from '@/layout/cat-editor-v2'
import { CATEditor } from '@/layout/cat-editor-v2'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { layoutDemos } from '@/data/layout-demos'
import {
  CATEditorLegend,
  CATEditorSnippetsAndFlash,
  CATEditorToolbar,
} from '@/components/cat-editor-toolbar'

export const Route = createFileRoute('/demo/cat-editor-v2')({
  component: CATEditorV2Demo,
})

// ─── Default sample data ─────────────────────────────────────────────────────

const SAMPLE_TEXT =
  'The quick brown fox jumps over the layz dog. This sentance contains severl speling errors and some technical terms like API endpoint and HTTP request.\nTom & Jerry\u00A0say\u2009hello\u2003world\u200Bhidden\u2060join\u200Ahair.\tTabbed here.\n<a href="https://example.com">Click <b>here</b> for more</a> info <br/> end.\nHello {{userName}}, your order ${orderId} is ready. Total: $amount — use code %PROMO to save.\nShe said "run away" and he replied \'OK fine\' before leaving.\nVisit https://github.com/lexical or www.example.com for details. Type @ to mention a user.'

const DEFAULT_SPELLCHECK: Array<ISpellCheckValidation> = [
  {
    categoryId: 'TYPOS',
    start: 35,
    end: 39,
    content: 'layz',
    message: 'Possible spelling mistake found. Did you mean "lazy"?',
    shortMessage: 'Typo',
    suggestions: [{ value: 'lazy' }, { value: 'lays' }, { value: 'laze' }],
    dictionaries: ['en-US'],
  },
  {
    categoryId: 'TYPOS',
    start: 50,
    end: 58,
    content: 'sentance',
    message: 'Possible spelling mistake found. Did you mean "sentence"?',
    shortMessage: 'Typo',
    suggestions: [{ value: 'sentence' }, { value: 'sentience' }],
    dictionaries: ['en-US'],
  },
  {
    categoryId: 'TYPOS',
    start: 68,
    end: 74,
    content: 'severl',
    message: 'Possible spelling mistake found. Did you mean "several"?',
    shortMessage: 'Typo',
    suggestions: [
      { value: 'several' },
      { value: 'sever' },
      { value: 'severe' },
    ],
    dictionaries: ['en-US'],
  },
  {
    categoryId: 'TYPOS',
    start: 75,
    end: 82,
    content: 'speling',
    message: 'Possible spelling mistake found. Did you mean "spelling"?',
    shortMessage: 'Typo',
    suggestions: [{ value: 'spelling' }, { value: 'spieling' }],
    dictionaries: ['en-US'],
  },
]

const DEFAULT_TAG_PATTERN =
  '<[^>]+>|(\\{\\{[^{}]*\\}\\})|(\\{[^{}]*\\})|(["\']?\\{[^{}]*\\}["\']?)|(["\']?\\$\\{[^{}]*\\}["\']?)|(["\']?\\$[A-Za-z0-9_]+["\']?)|(["\']?%[A-Za-z0-9]+["\']?)'

const DEFAULT_LEXIQA_ENTRIES: Array<IKeywordsEntry> = [
  { pattern: 'API endpoint' },
  { pattern: 'HTTP request' },
]

const DEFAULT_TB_ENTRIES: Array<IKeywordsEntry> = [
  {
    pattern: 'endpoint',
    description:
      'Preferred terminology: use "API endpoint" instead of "endpoint" alone.',
  },
  {
    pattern: 'fox',
    description:
      'Term Base: "fox" should be translated as "zorro" in the Spanish target.',
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
    pattern: '\\u2002',
    description: 'En Space',
    atomic: true,
    displaySymbol: '␣',
  },
  {
    pattern: '\\u2003',
    description: 'Em Space',
    atomic: true,
    displaySymbol: '␣',
  },
  {
    pattern: '\\u2009',
    description: 'Thin Space',
    atomic: true,
    displaySymbol: '·',
  },
  {
    pattern: '\\u3000',
    description: 'Ideographic Space',
    atomic: true,
    displaySymbol: '□',
  },
  {
    pattern: '\\u200A',
    description: 'Hair Space',
    atomic: true,
    displaySymbol: '·',
  },
  {
    pattern: '\\u200B',
    description: 'Zero-Width Space',
    atomic: true,
    displaySymbol: '∅',
  },
  {
    pattern: '\\u200C',
    description: 'Zero-Width Non-Joiner',
    atomic: true,
    displaySymbol: '⊘',
  },
  {
    pattern: '\\u200D',
    description: 'Zero-Width Joiner',
    atomic: true,
    displaySymbol: '⊕',
  },
  {
    pattern: '\\u2060',
    description: 'Word Joiner',
    atomic: true,
    displaySymbol: '⁀',
  },
  {
    pattern: '\\uFEFF',
    description: 'BOM / Zero-Width No-Break Space',
    atomic: true,
    displaySymbol: '◊',
  },
  {
    pattern: '\\u000D',
    description: 'Carriage Return',
    atomic: true,
    displaySymbol: '↵',
  },
  {
    pattern: '\\u000C',
    description: 'Form Feed',
    atomic: true,
    displaySymbol: '␌',
  },
  {
    pattern: '\\u0000',
    description: 'Null Character',
    atomic: true,
    displaySymbol: '␀',
  },
  {
    pattern: '\\n',
    description: 'Line Break',
    atomic: true,
    displaySymbol: '↩',
  },
  { pattern: ' ', description: 'Space', atomic: true },
]

const DEFAULT_MENTION_USERS: Array<IMentionUser> = [
  {
    id: '1',
    name: 'Alice Johnson',
    avatar: () => (
      <img
        src="https://i.pravatar.cc/48?u=alice-johnson"
        className="rounded-full w-full h-full object-cover"
        alt=""
      />
    ),
  },
  {
    id: '2',
    name: 'Bob Smith',
    avatar: () => (
      <img
        src="https://i.pravatar.cc/48?u=bob-smith"
        className="rounded-full w-full h-full object-cover"
        alt=""
      />
    ),
  },
  {
    id: '3',
    name: 'Charlie Brown',
    avatar: () => (
      <img
        src="https://i.pravatar.cc/48?u=charlie-brown"
        className="rounded-full w-full h-full object-cover"
        alt=""
      />
    ),
  },
  {
    id: '4',
    name: 'Diana Prince',
    avatar: () => (
      <img
        src="https://i.pravatar.cc/48?u=diana-prince"
        className="rounded-full w-full h-full object-cover"
        alt=""
      />
    ),
  },
  {
    id: '5',
    name: 'Eve Williams',
    avatar: () => (
      <img
        src="https://i.pravatar.cc/48?u=eve-williams"
        className="rounded-full w-full h-full object-cover"
        alt=""
      />
    ),
  },
  {
    id: '6',
    name: 'Frank Castle',
    avatar: () => (
      <img
        src="https://i.pravatar.cc/48?u=frank-castle"
        className="rounded-full w-full h-full object-cover"
        alt=""
      />
    ),
  },
  {
    id: '7',
    name: 'Grace Hopper',
    avatar: () => (
      <img
        src="https://i.pravatar.cc/48?u=grace-hopper"
        className="rounded-full w-full h-full object-cover"
        alt=""
      />
    ),
  },
  {
    id: '8',
    name: 'Henry Ford',
    avatar: () => (
      <img
        src="https://i.pravatar.cc/48?u=henry-ford"
        className="rounded-full w-full h-full object-cover"
        alt=""
      />
    ),
  },
  {
    id: '9',
    name: 'Ivy Chen',
    avatar: () => (
      <img
        src="https://i.pravatar.cc/48?u=ivy-chen"
        className="rounded-full w-full h-full object-cover"
        alt=""
      />
    ),
  },
  {
    id: '10',
    name: 'Jack Daniels',
    avatar: () => (
      <img
        src="https://i.pravatar.cc/48?u=jack-daniels"
        className="rounded-full w-full h-full object-cover"
        alt=""
      />
    ),
  },
  {
    id: '11',
    name: 'Karen Lee',
    avatar: () => (
      <img
        src="https://i.pravatar.cc/48?u=karen-lee"
        className="rounded-full w-full h-full object-cover"
        alt=""
      />
    ),
  },
  {
    id: '12',
    name: 'Leo Messi',
    avatar: () => (
      <img
        src="https://i.pravatar.cc/48?u=leo-messi"
        className="rounded-full w-full h-full object-cover"
        alt=""
      />
    ),
  },
  {
    id: '13',
    name: 'Mia Wong',
    avatar: () => (
      <img
        src="https://i.pravatar.cc/48?u=mia-wong"
        className="rounded-full w-full h-full object-cover"
        alt=""
      />
    ),
  },
  {
    id: '14',
    name: 'Nathan Drake',
    avatar: () => (
      <img
        src="https://i.pravatar.cc/48?u=nathan-drake"
        className="rounded-full w-full h-full object-cover"
        alt=""
      />
    ),
  },
  {
    id: '15',
    name: 'Olivia Kim',
    avatar: () => (
      <img
        src="https://i.pravatar.cc/48?u=olivia-kim"
        className="rounded-full w-full h-full object-cover"
        alt=""
      />
    ),
  },
]

// ─── Text snippets for insertion ──────────────────────────────────────────────

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

// ─── Flash-range presets ─────────────────────────────────────────────────────

const FLASH_RANGES = [
  { label: '"layz"', start: 35, end: 39 },
  { label: '"sentance"', start: 50, end: 58 },
  { label: '"severl"', start: 68, end: 74 },
  { label: '"speling"', start: 75, end: 82 },
  { label: 'First 10 chars', start: 0, end: 10 },
  { label: 'Chars 100–120', start: 100, end: 120 },
]

// ─── Demo component ──────────────────────────────────────────────────────────

function CATEditorV2Demo() {
  const editorRef = useRef<CATEditorRef>(null)
  const [customSnippet, setCustomSnippet] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const [appliedSuggestions, setAppliedSuggestions] = useState<
    Array<{ ruleId: string; suggestion: string; ruleType: string }>
  >([])

  // ── Rule enable/disable toggles ──────────────────────────────────────
  const [spellcheckEnabled, setSpellcheckEnabled] = useState(true)
  const [lexiqaEnabled, setLexiqaEnabled] = useState(true)
  const [tbTargetEnabled, setTbTargetEnabled] = useState(true)
  const [specialCharEnabled, setSpecialCharEnabled] = useState(true)
  const [tagsEnabled, setTagsEnabled] = useState(true)
  const [quotesEnabled, setQuotesEnabled] = useState(true)
  const [linkEnabled, setLinkEnabled] = useState(true)
  const [openLinksOnClick, setOpenLinksOnClick] = useState(true)
  const [mentionEnabled, setMentionEnabled] = useState(true)
  const [mentionTrigger, setMentionTrigger] = useState('@')
  const [mentionShowAvatar, setMentionShowAvatar] = useState(true)
  const [mentionSerializeFormat, setMentionSerializeFormat] = useState('@{id}')
  const [searchKeywords, setSearchKeywords] = useState('')

  // ── Editor options ───────────────────────────────────────────────────
  const [editorDir, setEditorDir] = useState<'ltr' | 'rtl' | 'auto'>('ltr')
  const [popoverDir, setPopoverDir] = useState<
    'ltr' | 'rtl' | 'auto' | 'inherit'
  >('ltr')
  const [jpFont, setJpFont] = useState(false)
  const [editorEditable, setEditorEditable] = useState(true)
  const [readOnlySelectable, setReadOnlySelectable] = useState(false)
  const [interceptEnter, setInterceptEnter] = useState(false)
  const [keyDownLog, setKeyDownLog] = useState<Array<string>>([])

  // ── Editable rule data ───────────────────────────────────────────────
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

  /** Flash a spellcheck annotation and clear the pill after timeout. */
  const handleFlashSpellcheck = useCallback(
    (annId: string, durationMs = 5000) => {
      if (flashDemoTimerRef.current) {
        clearTimeout(flashDemoTimerRef.current)
      }
      setFlashedSpellcheckId(annId)
      editorRef.current?.flashHighlight(annId, durationMs)
      flashDemoTimerRef.current = setTimeout(() => {
        setFlashedSpellcheckId(null)
      }, durationMs)
    },
    [],
  )

  const demoMeta = layoutDemos.find((d) => d.to === '/demo/cat-editor-v2')

  // ── Custom mention DOM renderer ──────────────────────────────────────
  const renderMentionDOM = useCallback<MentionDOMRenderer>(
    (element, mentionId, mentionName) => {
      element.textContent = ''
      const user = DEFAULT_MENTION_USERS.find((u) => u.id === mentionId)

      if (mentionShowAvatar && user?.avatar) {
        const container = document.createElement('span')
        container.className = 'cat-mention-avatar'
        container.style.width = '16px'
        container.style.height = '16px'
        const root = createRoot(container)
        flushSync(() => root.render(user.avatar!()))
        element.appendChild(container)
      }

      const label = document.createElement('span')
      label.className = 'cat-mention-label'
      label.textContent = `@${user?.name ?? mentionName}`
      element.appendChild(label)

      return true
    },
    [mentionShowAvatar],
  )

  // ── Derive mentionSerialize / mentionPattern from format template ───
  const mentionSerialize = useMemo(() => {
    const fmt = mentionSerializeFormat.trim()
    if (!fmt || fmt === '@{id}') return undefined
    return (id: string) => fmt.replace(/\bid\b/g, id)
  }, [mentionSerializeFormat])

  const mentionPattern = useMemo(() => {
    const fmt = mentionSerializeFormat.trim()
    if (!fmt || fmt === '@{id}') return undefined
    const escaped = fmt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const withCapture = escaped.replace(/\\b?id\\b?|id/g, '([^\\s]+)')
    try {
      return new RegExp(withCapture, 'g')
    } catch {
      return undefined
    }
  }, [mentionSerializeFormat])

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
      active.push({
        type: 'link',
      } satisfies ILinkRule)
    }
    if (mentionEnabled) {
      active.push({
        type: 'mention',
        users: DEFAULT_MENTION_USERS,
        trigger: mentionTrigger || '@',
      } satisfies IMentionRule)
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
    mentionEnabled,
    mentionTrigger,
    searchKeywords,
  ])

  const handleSuggestionApply = useCallback(
    (
      ruleId: string,
      suggestion: string,
      _range: { start: number; end: number; content: string },
      ruleType: RuleAnnotation['type'],
    ) => {
      setAppliedSuggestions((prev) => [
        ...prev,
        { ruleId, suggestion, ruleType },
      ])
    },
    [],
  )

  const handleReset = useCallback(() => {
    setAppliedSuggestions([])
    setSpellcheckEnabled(true)
    setLexiqaEnabled(true)
    setTbTargetEnabled(true)
    setSpecialCharEnabled(true)
    setTagsEnabled(true)
    setQuotesEnabled(true)
    setSpellcheckData(DEFAULT_SPELLCHECK)
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
    setLinkEnabled(true)
    setOpenLinksOnClick(true)
    setMentionEnabled(true)
    setMentionTrigger('@')
    setMentionShowAvatar(true)
    setMentionSerializeFormat('@{id}')
    setSearchKeywords('')
    setEditorDir('ltr')
    setPopoverDir('ltr')
    setJpFont(false)
    setEditorEditable(true)
    setReadOnlySelectable(false)
    setInterceptEnter(false)
    setKeyDownLog([])
    setFlashedSpellcheckId(null)
    if (flashDemoTimerRef.current) {
      clearTimeout(flashDemoTimerRef.current)
    }
    editorRef.current?.clearFlash()
    setResetKey((k) => k + 1)
  }, [])

  // ── onKeyDown demo ─────────────────────────────────────────────────
  const handleEditorKeyDown = useCallback(
    (event: KeyboardEvent): boolean => {
      if (!interceptEnter) return false
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        setKeyDownLog((prev) =>
          [
            `[Enter intercepted] ${new Date().toLocaleTimeString()}`,
            ...prev,
          ].slice(0, 8),
        )
        return true
      }
      return false
    },
    [interceptEnter],
  )

  // ── Helpers for editable lists ───────────────────────────────────────
  const updateSpellcheck = (
    idx: number,
    patch: Partial<ISpellCheckValidation>,
  ) =>
    setSpellcheckData((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)),
    )
  const removeSpellcheck = (idx: number) =>
    setSpellcheckData((prev) => prev.filter((_, i) => i !== idx))
  const addSpellcheck = () =>
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
    ])

  const updateKeyword = (
    setter: React.Dispatch<React.SetStateAction<Array<IKeywordsEntry>>>,
    idx: number,
    patch: Partial<IKeywordsEntry>,
  ) =>
    setter((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  const removeKeyword = (
    setter: React.Dispatch<React.SetStateAction<Array<IKeywordsEntry>>>,
    idx: number,
  ) => setter((prev) => prev.filter((_, i) => i !== idx))
  const addKeyword = (
    setter: React.Dispatch<React.SetStateAction<Array<IKeywordsEntry>>>,
  ) => setter((prev) => [...prev, { pattern: '' }])

  const updateSpecialChar = (idx: number, patch: Partial<IKeywordsEntry>) =>
    setSpecialCharEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
    )
  const removeSpecialChar = (idx: number) =>
    setSpecialCharEntries((prev) => prev.filter((_, i) => i !== idx))
  const addSpecialChar = () =>
    setSpecialCharEntries((prev) => [
      ...prev,
      { pattern: 'x', description: 'New Char', atomic: true },
    ])

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-muted/30 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {demoMeta?.name ?? 'CAT Editor v2'}
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
            {demoMeta?.description ??
              'Modular CATEditor v2 — same functionality, refactored architecture with composable plugins and hooks.'}
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
          mentionEnabled={mentionEnabled}
          onMentionEnabledChange={setMentionEnabled}
          mentionTrigger={mentionTrigger}
          onMentionTriggerChange={setMentionTrigger}
          mentionSerializeFormat={mentionSerializeFormat}
          onMentionSerializeFormatChange={setMentionSerializeFormat}
          mentionShowAvatar={mentionShowAvatar}
          onMentionShowAvatarChange={setMentionShowAvatar}
          mentionUserCount={DEFAULT_MENTION_USERS.length}
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
            <div className="flex items-center gap-2">
              <Switch
                checked={interceptEnter}
                onCheckedChange={(v) => {
                  setInterceptEnter(v)
                  setKeyDownLog([])
                }}
              />
              <Label className="text-xs">Intercept Enter key</Label>
            </div>
          }
          searchValue={searchKeywords}
          onSearchChange={(e) => setSearchKeywords(e.target.value)}
        />

        {/* Key-down log */}
        {interceptEnter && keyDownLog.length > 0 && (
          <div className="rounded-lg bg-muted p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Key-down log:
            </p>
            {keyDownLog.map((msg, i) => (
              <p key={i} className="text-xs font-mono text-foreground">
                {msg}
              </p>
            ))}
          </div>
        )}

        {/* ─── Legend ─────────────────────────────────────────────── */}
        <CATEditorLegend showMention />

        {/* ─── Text Snippets & Flash Range ────────────────────────── */}
        <CATEditorSnippetsAndFlash
          snippets={TEXT_SNIPPETS}
          flashRanges={FLASH_RANGES}
          onInsertText={(text) => editorRef.current?.insertText(text)}
          onSetText={(text) => editorRef.current?.setText(text)}
          onFlashRange={(start, end, ms) =>
            editorRef.current?.flashRange(start, end, ms)
          }
          customSnippetSlot={(mode) => (
            <div className="flex items-center gap-1.5 pt-1">
              <Input
                value={customSnippet}
                onChange={(e) => setCustomSnippet(e.target.value)}
                placeholder="Custom text…"
                className="h-7 text-xs flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customSnippet) {
                    if (mode === 'reset') {
                      editorRef.current?.setText(customSnippet)
                    } else {
                      editorRef.current?.insertText(customSnippet)
                    }
                    setCustomSnippet('')
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={!customSnippet}
                onClick={() => {
                  if (mode === 'reset') {
                    editorRef.current?.setText(customSnippet)
                  } else {
                    editorRef.current?.insertText(customSnippet)
                  }
                  setCustomSnippet('')
                }}
              >
                <Plus className="mr-1 h-3 w-3" />
                {mode === 'reset' ? 'Reset' : 'Insert'}
              </Button>
            </div>
          )}
        />

        {/* ─── Editor ─────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-red-400/70" />
              <span className="h-3 w-3 rounded-full bg-yellow-400/70" />
              <span className="h-3 w-3 rounded-full bg-green-400/70" />
            </div>
            <span className="ml-2 text-xs text-muted-foreground font-medium">
              CAT Editor v2 — Lexical (modular architecture)
            </span>
          </div>
          <CATEditor
            ref={editorRef}
            key={resetKey}
            initialText={SAMPLE_TEXT}
            rules={rules}
            onSuggestionApply={handleSuggestionApply}
            renderMentionDOM={renderMentionDOM}
            mentionSerialize={mentionSerialize}
            mentionPattern={mentionPattern}
            openLinksOnClick={openLinksOnClick}
            dir={editorDir}
            popoverDir={popoverDir}
            jpFont={jpFont}
            editable={editorEditable}
            readOnlySelectable={readOnlySelectable}
            onKeyDown={interceptEnter ? handleEditorKeyDown : undefined}
            onChange={() => {
              if (flashedSpellcheckId) {
                setFlashedSpellcheckId(null)
                if (flashDemoTimerRef.current) {
                  clearTimeout(flashDemoTimerRef.current)
                  flashDemoTimerRef.current = null
                }
              }
            }}
            placeholder="Type or paste your text here…"
            className={tagsCollapsed ? 'cat-tags-collapsed' : ''}
          />
        </div>

        {/* ─── Applied suggestions log ────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Applied Suggestions
          </h3>
          {appliedSuggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Click a suggestion in the popover to apply it. Applied changes
              will appear here.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {appliedSuggestions.map((s, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <span>
                    Applied{' '}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      {s.suggestion}
                    </code>{' '}
                    <span className="text-muted-foreground text-xs">
                      ({s.ruleType})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
