import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import {
  AtSign,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code,
  Database,
  Eye,
  Link2,
  Minus,
  MousePointerClick,
  Plus,
  Quote,
  RotateCcw,
  Search,
  Settings,
  SpellCheck,
  Type,
} from 'lucide-react'

import type { DetectQuotesOptions } from '@/utils/detect-quotes'

import type {
  CATEditorRef,
  IKeywordsEntry,
  IKeywordsRule,
  ILinkRule,
  IMentionRule,
  IMentionUser,
  IQuoteRule,
  ISpecialCharEntry,
  ISpecialCharRule,
  ISpellCheckRule,
  ISpellCheckValidation,
  ITagRule,
  MentionDOMRenderer,
  MooRule,
  RuleAnnotation,
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
import { layoutDemos } from '@/data/layout-demos'

export const Route = createFileRoute('/demo/cat-editor')({
  component: CATEditorDemo,
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
  { term: 'API endpoint' },
  { term: 'HTTP request' },
]

const DEFAULT_TB_ENTRIES: Array<IKeywordsEntry> = [
  {
    term: 'endpoint',
    description:
      'Preferred terminology: use "API endpoint" instead of "endpoint" alone.',
  },
  {
    term: 'fox',
    description:
      'Term Base: "fox" should be translated as "zorro" in the Spanish target.',
  },
]

const DEFAULT_SPECIAL_CHARS: Array<ISpecialCharEntry> = [
  { name: 'Ampersand', pattern: /&/ },
  { name: 'Tab', pattern: /\t/ },
  { name: 'Non-Breaking Space', pattern: new RegExp('\\u00A0') },
  { name: 'En Space', pattern: new RegExp('\\u2002') },
  { name: 'Em Space', pattern: new RegExp('\\u2003') },
  { name: 'Thin Space', pattern: new RegExp('\\u2009') },
  { name: 'Ideographic Space', pattern: new RegExp('\\u3000') },
  { name: 'Hair Space', pattern: new RegExp('\\u200A') },
  { name: 'Zero-Width Space', pattern: new RegExp('\\u200B') },
  { name: 'Zero-Width Non-Joiner', pattern: new RegExp('\\u200C') },
  { name: 'Zero-Width Joiner', pattern: new RegExp('\\u200D') },
  { name: 'Word Joiner', pattern: new RegExp('\\u2060') },
  { name: 'BOM / Zero-Width No-Break Space', pattern: new RegExp('\\uFEFF') },
  // eslint-disable-next-line no-control-regex
  { name: 'Carriage Return', pattern: new RegExp('\\u000D') },
  // eslint-disable-next-line no-control-regex
  { name: 'Form Feed', pattern: new RegExp('\\u000C') },
  // eslint-disable-next-line no-control-regex
  { name: 'Null Character', pattern: new RegExp('\\u0000') },
  { name: 'Line Break', pattern: /\n/ },
  { name: 'Space', pattern: / / },
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

// ─── Collapsible section helper ──────────────────────────────────────────────

function Section({
  title,
  icon,
  enabled,
  onToggle,
  children,
  defaultOpen = false,
}: {
  title: string
  icon: React.ReactNode
  enabled: boolean
  onToggle: (v: boolean) => void
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2 bg-muted/30">
        <Switch checked={enabled} onCheckedChange={onToggle} />
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-foreground/80 flex-1 text-left"
          onClick={() => setOpen(!open)}
        >
          {icon}
          {title}
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
          )}
        </button>
      </div>
      {open && <div className="p-3 border-t border-border">{children}</div>}
    </div>
  )
}

// ─── Demo component ──────────────────────────────────────────────────────────

function CATEditorDemo() {
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
  const [jpFont, setJpFont] = useState(false)
  const [editorEditable, setEditorEditable] = useState(true)
  const [readOnlySelectable, setReadOnlySelectable] = useState(false)
  const [interceptEnter, setInterceptEnter] = useState(false)
  const [keyDownLog, setKeyDownLog] = useState<Array<string>>([])

  // ── Editable rule data ───────────────────────────────────────────────
  // Spellcheck validations
  const [spellcheckData, setSpellcheckData] =
    useState<Array<ISpellCheckValidation>>(DEFAULT_SPELLCHECK)

  // Keywords entries
  const [lexiqaEntries, setLexiqaEntries] = useState<Array<IKeywordsEntry>>(
    DEFAULT_LEXIQA_ENTRIES,
  )
  const [tbEntries, setTbEntries] =
    useState<Array<IKeywordsEntry>>(DEFAULT_TB_ENTRIES)

  // Special-char entries
  const [specialCharEntries, setSpecialCharEntries] = useState<
    Array<ISpecialCharEntry>
  >(DEFAULT_SPECIAL_CHARS)
  const [codepointMapJson, setCodepointMapJson] = useState('')

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
      // Clear previous demo timer
      if (flashDemoTimerRef.current) {
        clearTimeout(flashDemoTimerRef.current)
      }
      setFlashedSpellcheckId(annId)
      editorRef.current?.flashHighlight(annId, durationMs)
      // Sync demo state with flash timeout
      flashDemoTimerRef.current = setTimeout(() => {
        setFlashedSpellcheckId(null)
      }, durationMs)
    },
    [],
  )

  const demoMeta = layoutDemos.find((d) => d.to === '/demo/cat-editor')

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

  // ── Parse optional codepoint map ─────────────────────────────────────
  const codepointDisplayMap = useMemo<
    Record<number, string> | undefined
  >(() => {
    if (!codepointMapJson.trim()) return undefined
    try {
      const parsed = JSON.parse(codepointMapJson)
      const map: Record<number, string> = {}
      for (const [k, v] of Object.entries(parsed)) {
        const cp = k.startsWith('0x') ? parseInt(k, 16) : parseInt(k, 10)
        if (!isNaN(cp) && typeof v === 'string') map[cp] = v
      }
      return Object.keys(map).length > 0 ? map : undefined
    } catch {
      return undefined
    }
  }, [codepointMapJson])

  // ── Derive mentionSerialize / mentionPattern from format template ───
  const mentionSerialize = useMemo(() => {
    const fmt = mentionSerializeFormat.trim()
    if (!fmt || fmt === '@{id}') return undefined // use default
    return (id: string) => fmt.replace(/\bid\b/g, id)
  }, [mentionSerializeFormat])

  const mentionPattern = useMemo(() => {
    const fmt = mentionSerializeFormat.trim()
    if (!fmt || fmt === '@{id}') return undefined // use default
    // Escape all regex-special chars, then replace the literal `id` with a capture group
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
        type: 'glossary',
        label: 'lexiqa',
        entries: lexiqaEntries,
      } satisfies IKeywordsRule)
    }
    if (tbTargetEnabled) {
      active.push({
        type: 'glossary',
        label: 'tb-target',
        entries: tbEntries,
      } satisfies IKeywordsRule)
    }
    if (specialCharEnabled) {
      active.push({
        type: 'special-char',
        entries: specialCharEntries,
      } satisfies ISpecialCharRule)
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
          type: 'glossary',
          label: 'search',
          entries: terms.map((t) => ({ term: t, pattern: t })),
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
    setCodepointMapJson('')
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
        return true // block Lexical
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

  const updateGlossary = (
    setter: React.Dispatch<React.SetStateAction<Array<IKeywordsEntry>>>,
    idx: number,
    patch: Partial<IKeywordsEntry>,
  ) =>
    setter((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  const removeGlossary = (
    setter: React.Dispatch<React.SetStateAction<Array<IKeywordsEntry>>>,
    idx: number,
  ) => setter((prev) => prev.filter((_, i) => i !== idx))
  const addGlossary = (
    setter: React.Dispatch<React.SetStateAction<Array<IKeywordsEntry>>>,
  ) => setter((prev) => [...prev, { term: '' }])

  const updateSpecialChar = (
    idx: number,
    patch: { name?: string; pattern?: string },
  ) =>
    setSpecialCharEntries((prev) =>
      prev.map((e, i) => {
        if (i !== idx) return e
        const name = patch.name ?? e.name
        const patternStr = patch.pattern ?? e.pattern.source
        try {
          return { name, pattern: new RegExp(patternStr) }
        } catch {
          return { name, pattern: e.pattern }
        }
      }),
    )
  const removeSpecialChar = (idx: number) =>
    setSpecialCharEntries((prev) => prev.filter((_, i) => i !== idx))
  const addSpecialChar = () =>
    setSpecialCharEntries((prev) => [
      ...prev,
      { name: 'New Char', pattern: /x/ },
    ])

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-muted/30 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {demoMeta?.name ?? 'CAT Editor'}
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
            {demoMeta?.description ??
              'A Lexical-powered editor with rule-based highlighting for spellcheck and LexiQA quality assurance.'}
          </p>
        </div>

        {/* ─── Rule editors ─────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Rules Configuration
            </h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset
              </Button>
            </div>
          </div>

          {/* Spellcheck */}
          <Section
            title="Spellcheck"
            icon={<SpellCheck className="h-4 w-4 text-red-500" />}
            enabled={spellcheckEnabled}
            onToggle={setSpellcheckEnabled}
          >
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {spellcheckData.map((v, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded border border-border/50 bg-background p-2"
                >
                  <div className="grid grid-cols-[80px_1fr] gap-1.5 flex-1 text-xs">
                    <span className="text-muted-foreground self-center">
                      content
                    </span>
                    <Input
                      className="h-7 text-xs"
                      value={v.content}
                      onChange={(e) =>
                        updateSpellcheck(i, { content: e.target.value })
                      }
                    />
                    <span className="text-muted-foreground self-center">
                      categoryId
                    </span>
                    <Input
                      className="h-7 text-xs"
                      value={v.categoryId}
                      onChange={(e) =>
                        updateSpellcheck(i, { categoryId: e.target.value })
                      }
                    />
                    <span className="text-muted-foreground self-center">
                      start / end
                    </span>
                    <div className="flex gap-1">
                      <Input
                        className="h-7 text-xs w-16"
                        type="number"
                        value={v.start}
                        onChange={(e) =>
                          updateSpellcheck(i, {
                            start: parseInt(e.target.value) || 0,
                          })
                        }
                      />
                      <Input
                        className="h-7 text-xs w-16"
                        type="number"
                        value={v.end}
                        onChange={(e) =>
                          updateSpellcheck(i, {
                            end: parseInt(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <span className="text-muted-foreground self-center">
                      message
                    </span>
                    <Input
                      className="h-7 text-xs"
                      value={v.message}
                      onChange={(e) =>
                        updateSpellcheck(i, { message: e.target.value })
                      }
                    />
                    <span className="text-muted-foreground self-center">
                      suggestions
                    </span>
                    <Input
                      className="h-7 text-xs"
                      value={v.suggestions.map((s) => s.value).join(', ')}
                      placeholder="comma-separated"
                      onChange={(e) =>
                        updateSpellcheck(i, {
                          suggestions: e.target.value
                            .split(',')
                            .map((s) => ({ value: s.trim() }))
                            .filter((s) => s.value),
                        })
                      }
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeSpellcheck(i)}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={addSpellcheck}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add validation
            </Button>

            {/* ── Spellcheck error list (click to flash-highlight) ── */}
            {spellcheckEnabled && spellcheckData.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <MousePointerClick className="h-3.5 w-3.5" />
                  Click to highlight in editor
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {spellcheckData.map((v) => {
                    const annId = `sc-${v.start}-${v.end}`
                    const isActive = flashedSpellcheckId === annId
                    return (
                      <button
                        key={annId}
                        type="button"
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                          isActive
                            ? 'bg-pink-100 border-pink-300 text-pink-700 dark:bg-pink-900/40 dark:border-pink-700 dark:text-pink-300'
                            : 'border-border bg-background text-foreground hover:bg-muted'
                        }`}
                        onClick={() => {
                          handleFlashSpellcheck(annId, 5000)
                        }}
                      >
                        <span className="font-mono">{v.content || '…'}</span>
                        <span className="text-muted-foreground text-[10px]">
                          [{v.start}–{v.end}]
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </Section>

          {/* LexiQA */}
          <Section
            title="LexiQA (glossary)"
            icon={<BookOpen className="h-4 w-4 text-violet-500" />}
            enabled={lexiqaEnabled}
            onToggle={setLexiqaEnabled}
          >
            <GlossaryEditor
              entries={lexiqaEntries}
              onUpdate={(idx, patch) =>
                updateGlossary(setLexiqaEntries, idx, patch)
              }
              onRemove={(idx) => removeGlossary(setLexiqaEntries, idx)}
              onAdd={() => addGlossary(setLexiqaEntries)}
            />
          </Section>

          {/* TB Target */}
          <Section
            title="TB Target (glossary)"
            icon={<Database className="h-4 w-4 text-teal-500" />}
            enabled={tbTargetEnabled}
            onToggle={setTbTargetEnabled}
          >
            <GlossaryEditor
              entries={tbEntries}
              onUpdate={(idx, patch) =>
                updateGlossary(setTbEntries, idx, patch)
              }
              onRemove={(idx) => removeGlossary(setTbEntries, idx)}
              onAdd={() => addGlossary(setTbEntries)}
            />
          </Section>

          {/* Special Chars */}
          <Section
            title="Special Characters"
            icon={<Eye className="h-4 w-4 text-amber-500" />}
            enabled={specialCharEnabled}
            onToggle={setSpecialCharEnabled}
          >
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {specialCharEntries.map((e, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded border border-border/50 bg-background p-1.5"
                >
                  <Input
                    className="h-7 text-xs flex-1"
                    value={e.name}
                    placeholder="Name"
                    onChange={(ev) =>
                      updateSpecialChar(i, { name: ev.target.value })
                    }
                  />
                  <Input
                    className="h-7 text-xs w-40 font-mono"
                    value={e.pattern.source}
                    placeholder="Regex pattern"
                    onChange={(ev) =>
                      updateSpecialChar(i, { pattern: ev.target.value })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeSpecialChar(i)}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-4 mt-3">
              <Button variant="outline" size="sm" onClick={addSpecialChar}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add entry
              </Button>
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Codepoint display overrides (JSON, e.g.{' '}
                  {'{"0x00A0": "SP", "0x200B": "ZW"}'})
                </Label>
                <Input
                  className="h-7 text-xs font-mono"
                  value={codepointMapJson}
                  placeholder='{"0x00A0": "SP"}'
                  onChange={(e) => setCodepointMapJson(e.target.value)}
                />
              </div>
            </div>
          </Section>

          {/* Tags */}
          <Section
            title="Tags"
            icon={<Code className="h-4 w-4 text-sky-500" />}
            enabled={tagsEnabled}
            onToggle={setTagsEnabled}
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={tagsCollapsed}
                    onCheckedChange={setTagsCollapsed}
                  />
                  <Label
                    className="text-xs cursor-pointer"
                    title="Collapse tags into short labels like <1>, </1>"
                  >
                    Collapse
                  </Label>
                </div>
                {tagsCollapsed && (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={tagCollapseScope === 'html-only'}
                      onCheckedChange={(v) =>
                        setTagCollapseScope(v ? 'html-only' : 'all')
                      }
                    />
                    <Label
                      className="text-xs cursor-pointer"
                      title="When on, only HTML tags are collapsed; placeholders like {{var}} stay expanded"
                    >
                      HTML only
                    </Label>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Switch
                    checked={tagsDetectInner}
                    onCheckedChange={setTagsDetectInner}
                  />
                  <Label
                    className="text-xs cursor-pointer"
                    title="Match innermost tag pairs first (LIFO stack pairing)"
                  >
                    Detect inner
                  </Label>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Detection pattern (regex)
                </Label>
                <Input
                  className="h-7 text-xs font-mono"
                  value={tagPattern}
                  placeholder="Custom regex pattern…"
                  onChange={(e) => setTagPattern(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground/60">
                  Leave empty to use built-in HTML tag pairing. With a custom
                  pattern, HTML matches are still paired; non-HTML matches are
                  numbered sequentially.
                </p>
              </div>
            </div>
          </Section>

          {/* Quotes */}
          <Section
            title="Quote replacement"
            icon={<Quote className="h-4 w-4 text-orange-500" />}
            enabled={quotesEnabled}
            onToggle={setQuotesEnabled}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-[auto_1fr_1fr] gap-2 items-center text-xs">
                <span />
                <span className="text-muted-foreground text-center">
                  Opening
                </span>
                <span className="text-muted-foreground text-center">
                  Closing
                </span>
                <span className="text-muted-foreground">Single</span>
                <Input
                  className="h-7 text-xs text-center font-mono"
                  value={singleQuoteOpen}
                  onChange={(e) => setSingleQuoteOpen(e.target.value)}
                />
                <Input
                  className="h-7 text-xs text-center font-mono"
                  value={singleQuoteClose}
                  onChange={(e) => setSingleQuoteClose(e.target.value)}
                />
                <span className="text-muted-foreground">Double</span>
                <Input
                  className="h-7 text-xs text-center font-mono"
                  value={doubleQuoteOpen}
                  onChange={(e) => setDoubleQuoteOpen(e.target.value)}
                />
                <Input
                  className="h-7 text-xs text-center font-mono"
                  value={doubleQuoteClose}
                  onChange={(e) => setDoubleQuoteClose(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={quotesInTags}
                    onCheckedChange={setQuotesInTags}
                  />
                  <Label
                    className="text-xs cursor-pointer"
                    title={
                      'Also detect quotes inside HTML tags (e.g. attribute values like href="\u2026")'
                    }
                  >
                    Detect in tags
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={quoteEscapeContractions}
                    onCheckedChange={setQuoteEscapeContractions}
                  />
                  <Label
                    className="text-xs cursor-pointer"
                    title="Skip apostrophes in contractions like don't, it's, they're"
                  >
                    Escape contractions
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={quoteAllowNesting}
                    onCheckedChange={setQuoteAllowNesting}
                  />
                  <Label
                    className="text-xs cursor-pointer"
                    title="Allow overlapping quote types (e.g. double quotes containing single quotes that extend beyond)"
                  >
                    Allow nesting
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={quoteDetectInner}
                    onCheckedChange={setQuoteDetectInner}
                  />
                  <Label
                    className="text-xs cursor-pointer"
                    title="Detect quotes of the other type that open and close inside an already-open quote"
                  >
                    Detect inner quotes
                  </Label>
                </div>
              </div>
            </div>
          </Section>

          {/* Links */}
          <Section
            title="Link Detection"
            icon={<Link2 className="h-4 w-4 text-blue-500" />}
            enabled={linkEnabled}
            onToggle={setLinkEnabled}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={openLinksOnClick}
                  onCheckedChange={setOpenLinksOnClick}
                />
                <Label className="text-xs text-muted-foreground">
                  Open link on click
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Automatically detects URLs (http/https and www-prefixed) in the
                text and highlights them.{' '}
                {openLinksOnClick
                  ? 'Click a highlighted link to open it.'
                  : 'Link clicks are disabled — clicking positions the cursor instead.'}
              </p>
            </div>
          </Section>

          {/* Mentions */}
          <Section
            title="Mention Detection"
            icon={<AtSign className="h-4 w-4 text-purple-500" />}
            enabled={mentionEnabled}
            onToggle={setMentionEnabled}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground w-20">
                  Trigger
                </Label>
                <Input
                  className="h-7 text-xs font-mono w-16"
                  value={mentionTrigger}
                  onChange={(e) => setMentionTrigger(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground w-20">
                  Serialize
                </Label>
                <Input
                  className="h-7 text-xs font-mono flex-1"
                  value={mentionSerializeFormat}
                  onChange={(e) => setMentionSerializeFormat(e.target.value)}
                  placeholder="@{id}"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={mentionShowAvatar}
                  onCheckedChange={setMentionShowAvatar}
                />
                <Label className="text-xs text-muted-foreground">
                  Show avatar (custom renderMentionDOM)
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Type the trigger character (default: @) to open a user
                typeahead. Select a user to insert a mention node. The model
                text format is controlled by{' '}
                <code className="text-[11px] bg-muted px-1 rounded">
                  mentionSerialize
                </code>{' '}
                (use{' '}
                <code className="text-[11px] bg-muted px-1 rounded">id</code> as
                placeholder, e.g.{' '}
                <code className="text-[11px] bg-muted px-1 rounded">
                  {'@{id}'}
                </code>
                ,{' '}
                <code className="text-[11px] bg-muted px-1 rounded">
                  {'@[id]'}
                </code>
                ). Display is resolved to{' '}
                <code className="text-[11px] bg-muted px-1 rounded">
                  @UserName
                </code>
                . {DEFAULT_MENTION_USERS.length} users available.
              </p>
            </div>
          </Section>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded cat-highlight cat-highlight-spellcheck" />
            <span className="text-muted-foreground">Spellcheck error</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded cat-highlight cat-highlight-glossary cat-highlight-glossary-lexiqa" />
            <span className="text-muted-foreground">LexiQA term</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded cat-highlight cat-highlight-glossary cat-highlight-glossary-tb-target" />
            <span className="text-muted-foreground">TB Target term</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded cat-highlight cat-highlight-glossary cat-highlight-glossary-search" />
            <span className="text-muted-foreground">Keyword search</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded cat-highlight cat-highlight-special-char" />
            <span className="text-muted-foreground">Special character</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded cat-highlight cat-highlight-tag" />
            <span className="text-muted-foreground">Tag / placeholder</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded cat-highlight cat-highlight-quote" />
            <span className="text-muted-foreground">Quote replacement</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded cat-highlight cat-highlight-link" />
            <span className="text-muted-foreground">Link</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 px-1.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 leading-4">
              @A
            </span>
            <span className="text-muted-foreground">
              Mention (type @ to trigger)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded cat-highlight cat-highlight-nested cat-highlight-glossary cat-highlight-glossary-lexiqa" />
            <span className="text-muted-foreground">
              Nested (multiple rules)
            </span>
          </div>
          <div className="text-muted-foreground/60 ml-auto text-xs">
            Hover a highlight to see details &amp; suggestions
          </div>
        </div>

        {/* ─── Editor Options ─────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Settings className="h-4 w-4 text-slate-500" />
            Editor Options
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Direction */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Direction</Label>
              <Select
                value={editorDir}
                onValueChange={(v) => setEditorDir(v as 'ltr' | 'rtl' | 'auto')}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ltr">LTR (left-to-right)</SelectItem>
                  <SelectItem value="rtl">RTL (right-to-left)</SelectItem>
                  <SelectItem value="auto">Auto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* JP Font */}
            <div className="flex items-center gap-3 sm:pt-5">
              <Switch checked={jpFont} onCheckedChange={setJpFont} />
              <Label className="text-sm text-foreground cursor-pointer">
                Japanese font
              </Label>
            </div>

            {/* Editable */}
            <div className="flex items-center gap-3">
              <Switch
                checked={editorEditable}
                onCheckedChange={(v) => {
                  setEditorEditable(v)
                  if (v) setReadOnlySelectable(false)
                }}
              />
              <Label className="text-sm text-foreground cursor-pointer">
                Editable
              </Label>
            </div>

            {/* Read-only selectable */}
            <div className="flex items-center gap-3">
              <Switch
                checked={readOnlySelectable}
                onCheckedChange={setReadOnlySelectable}
                disabled={editorEditable}
              />
              <Label
                className={`text-sm cursor-pointer ${
                  editorEditable ? 'text-muted-foreground' : 'text-foreground'
                }`}
              >
                Allow selection when read-only
                <span className="block text-xs text-muted-foreground font-normal">
                  Caret &amp; copy work, but content is locked
                </span>
              </Label>
            </div>

            {/* Intercept Enter */}
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch
                checked={interceptEnter}
                onCheckedChange={(v) => {
                  setInterceptEnter(v)
                  setKeyDownLog([])
                }}
              />
              <Label className="text-sm text-foreground cursor-pointer">
                Intercept Enter key
                <span className="block text-xs text-muted-foreground font-normal">
                  Enter triggers custom action &middot; Shift+Enter inserts
                  newline
                </span>
              </Label>
            </div>
          </div>

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
        </div>

        {/* Search keywords — placed right above the editor */}
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-blue-500 shrink-0" />
          <Input
            value={searchKeywords}
            onChange={(e) => setSearchKeywords(e.target.value)}
            placeholder="Search keywords (comma-separated)…"
            className="h-8 text-sm"
          />
        </div>

        {/* Editor */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-red-400/70" />
              <span className="h-3 w-3 rounded-full bg-yellow-400/70" />
              <span className="h-3 w-3 rounded-full bg-green-400/70" />
            </div>
            <span className="ml-2 text-xs text-muted-foreground font-medium">
              CAT Editor — Lexical
            </span>
          </div>
          <CATEditor
            ref={editorRef}
            key={resetKey}
            initialText={SAMPLE_TEXT}
            rules={rules}
            codepointDisplayMap={codepointDisplayMap}
            onSuggestionApply={handleSuggestionApply}
            renderMentionDOM={renderMentionDOM}
            mentionSerialize={mentionSerialize}
            mentionPattern={mentionPattern}
            openLinksOnClick={openLinksOnClick}
            dir={editorDir}
            jpFont={jpFont}
            editable={editorEditable}
            readOnlySelectable={readOnlySelectable}
            onKeyDown={interceptEnter ? handleEditorKeyDown : undefined}
            onChange={() => {
              // Clear flash state when user edits text
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

        {/* Text Snippets — insert into editor at cursor */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Type className="h-4 w-4 text-blue-500" />
            Text Snippets
          </h3>
          <p className="text-xs text-muted-foreground">
            Click a snippet to insert it at the editor cursor. This section is
            independent — it lives outside the editor component.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TEXT_SNIPPETS.map((snippet) => (
              <button
                key={snippet.label}
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-sm font-medium text-foreground transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary"
                onClick={() => editorRef.current?.insertText(snippet.text)}
              >
                {snippet.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Input
              value={customSnippet}
              onChange={(e) => setCustomSnippet(e.target.value)}
              placeholder="Custom text…"
              className="h-8 text-sm max-w-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customSnippet) {
                  editorRef.current?.insertText(customSnippet)
                  setCustomSnippet('')
                }
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!customSnippet}
              onClick={() => {
                editorRef.current?.insertText(customSnippet)
                setCustomSnippet('')
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Insert
            </Button>
          </div>
        </div>

        {/* Applied suggestions log */}
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

// ─── Shared glossary editor ──────────────────────────────────────────────────

function GlossaryEditor({
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
              className="h-7 text-xs flex-1"
              value={e.term}
              placeholder="Term (exact match)"
              onChange={(ev) => onUpdate(i, { term: ev.target.value })}
            />
            <Input
              className="h-7 text-xs w-32 font-mono"
              value={e.pattern ?? ''}
              placeholder="Regex (optional)"
              onChange={(ev) =>
                onUpdate(i, {
                  pattern: ev.target.value || undefined,
                })
              }
            />
            <Input
              className="h-7 text-xs flex-1"
              value={e.description ?? ''}
              placeholder="Description (optional)"
              onChange={(ev) =>
                onUpdate(i, {
                  description: ev.target.value || undefined,
                })
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
      <p className="text-[10px] text-muted-foreground/60 mt-1">
        Each entry matches by exact <strong>Term</strong> string. Add an
        optional <strong>Regex</strong> to match by pattern instead (e.g.{' '}
        <code className="bg-muted px-0.5 rounded">fox|dog</code>,{' '}
        <code className="bg-muted px-0.5 rounded">{'\\bAPI\\b'}</code>).
      </p>
      <Button variant="outline" size="sm" className="mt-2" onClick={onAdd}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add entry
      </Button>
    </>
  )
}
