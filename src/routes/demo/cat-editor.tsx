import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Plus } from 'lucide-react'

import type { DetectQuotesOptions } from '@/utils/detect-quotes'

import type {
  CATEditorRef,
  IKeywordsEntry,
  IKeywordsRule,
  ILexiQARule,
  ILexiQAValidation,
  ILinkRule,
  IMentionRule,
  IMentionUser,
  IQuoteReplaceRule,
  IQuoteRule,
  IRangeHighlight,
  IRangeHighlightRule,
  ISpellCheckRule,
  ISpellCheckValidation,
  ITagRule,
  MooRule,
  QuoteAutoReplace,
  RuleAnnotation,
} from '@/layout/cat-editor'
import type { RegexPreset } from '@/components/cat-editor-toolbar'
import { CATEditor, getInitials } from '@/layout/cat-editor'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { layoutDemos } from '@/data/layout-demos'
import {
  CATEditorLegend,
  CATEditorSnippetsAndFlash,
  CATEditorToolbar,
  DEFAULT_REGEX_PRESETS,
  parseSearchTerms,
} from '@/components/cat-editor-toolbar'

export const Route = createFileRoute('/demo/cat-editor')({
  component: CATEditorDemo,
})

// ─── Default sample data ─────────────────────────────────────────────────────

const SAMPLE_TEXT =
  "The quick brown fox jumps over the layz dog. This sentance contains severl speling errors and some technical terms like API endpoint and HTTP request.\nTom & Jerry\u00A0say\u2009hello\u2003world\u200Bhidden\u2060join\u200Ahair.\tTabbed here.\n<a href='https://example.com'>Click <b>here</b> for more</a> info <br/> end.\nHello {{userName}}, your order ${orderId} is ready. Total: $amount — use code %PROMO to save.\nShe said 'run away' and he replied 'OK fine\\' before leaving.\nVisit https://github.com/lexical or www.example.com for details. Type @ to mention a user."

const DEFAULT_SPELLCHECK: Array<ISpellCheckValidation> = [
  {
    categoryId: 'TYPOS',
    start: 35,
    end: 39,
    content: 'layz',
    message: "Possible spelling mistake found. Did you mean 'lazy'?",
    shortMessage: 'Typo',
    suggestions: [{ value: 'lazy' }, { value: 'lays' }, { value: 'laze' }],
    dictionaries: ['en-US'],
  },
  {
    categoryId: 'TYPOS',
    start: 50,
    end: 58,
    content: 'sentance',
    message: "Possible spelling mistake found. Did you mean 'sentence'?",
    shortMessage: 'Typo',
    suggestions: [{ value: 'sentence' }, { value: 'sentience' }],
    dictionaries: ['en-US'],
  },
  {
    categoryId: 'TYPOS',
    start: 68,
    end: 74,
    content: 'severl',
    message: "Possible spelling mistake found. Did you mean 'several'?",
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
    message: "Possible spelling mistake found. Did you mean 'spelling'?",
    shortMessage: 'Typo',
    suggestions: [{ value: 'spelling' }, { value: 'spieling' }],
    dictionaries: ['en-US'],
  },
]

const DEFAULT_TAG_PATTERN =
  "<[^>]+>|(\\{\\{[^{}]*\\}\\})|(\\{[^{}]*\\})|(['\\\\']?\\{[^{}]*\\}['\\\\']?)|(['\\\\']?\\$\\{[^{}]*\\}['\\\\']?)|(['\\\\']?\\$[A-Za-z0-9_]+['\\\\']?)|(['\\\\']?%[A-Za-z0-9]+['\\\\']?)"

const DEFAULT_LEXIQA_DATA: Array<ILexiQAValidation> = [
  {
    category: 'terminology',
    start: 107,
    end: 119,
    errorid: 'lq-term-001',
    ignored: false,
    insource: true,
    length: 12,
    module: 'term_check',
    msg: 'Technical term "API endpoint" detected — verify translation.',
    suggestions: [{ value: 'API endpoint' }],
    categoryId: 'TERM',
    shortMessage: 'Term',
  },
  {
    category: 'terminology',
    start: 124,
    end: 136,
    errorid: 'lq-term-002',
    ignored: false,
    insource: true,
    length: 12,
    module: 'term_check',
    msg: 'Technical term "HTTP request" detected — verify translation.',
    suggestions: [{ value: 'HTTP request' }],
    categoryId: 'TERM',
    shortMessage: 'Term',
  },
]

const DEFAULT_TB_ENTRIES: Array<IKeywordsEntry> = [
  {
    keyword: 'endpoint',
    description:
      "Preferred terminology: use 'API endpoint' instead of 'endpoint' alone.",
  },
  {
    keyword: 'fox',
    description:
      "Term Base: 'fox' should be translated as 'zorro' in the Spanish target.",
  },
]

const DEFAULT_SPECIAL_CHARS: Array<IKeywordsEntry> = [
  { keyword: '', pattern: '&', description: 'Ampersand', atomic: true },
  {
    keyword: '',
    pattern: '\\t',
    description: 'Tab',
    atomic: true,
    displaySymbol: '⇥',
  },
  {
    keyword: '',
    pattern: '\\u00A0',
    description: 'Non-Breaking Space',
    atomic: true,
    displaySymbol: '⍽',
  },
  {
    keyword: '',
    pattern: '\\u2002',
    description: 'En Space',
    atomic: true,
    displaySymbol: '␣',
  },
  {
    keyword: '',
    pattern: '\\u2003',
    description: 'Em Space',
    atomic: true,
    displaySymbol: '␣',
  },
  {
    keyword: '',
    pattern: '\\u2009',
    description: 'Thin Space',
    atomic: true,
    displaySymbol: '·',
  },
  {
    keyword: '',
    pattern: '\\u3000',
    description: 'Ideographic Space',
    atomic: true,
    displaySymbol: '□',
  },
  {
    keyword: '',
    pattern: '\\u200A',
    description: 'Hair Space',
    atomic: true,
    displaySymbol: '·',
  },
  {
    keyword: '',
    pattern: '\\u200B',
    description: 'Zero-Width Space',
    atomic: true,
    displaySymbol: '∅',
  },
  {
    keyword: '',
    pattern: '\\u200C',
    description: 'Zero-Width Non-Joiner',
    atomic: true,
    displaySymbol: '⊘',
  },
  {
    keyword: '',
    pattern: '\\u200D',
    description: 'Zero-Width Joiner',
    atomic: true,
    displaySymbol: '⊕',
  },
  {
    keyword: '',
    pattern: '\\u2060',
    description: 'Word Joiner',
    atomic: true,
    displaySymbol: '⁀',
  },
  {
    keyword: '',
    pattern: '\\uFEFF',
    description: 'BOM / Zero-Width No-Break Space',
    atomic: true,
    displaySymbol: '◊',
  },
  {
    keyword: '',
    pattern: '\\u000D',
    description: 'Carriage Return',
    atomic: true,
    displaySymbol: '↵',
  },
  {
    keyword: '',
    pattern: '\\u000C',
    description: 'Form Feed',
    atomic: true,
    displaySymbol: '␌',
  },
  {
    keyword: '',
    pattern: '\\u0000',
    description: 'Null Character',
    atomic: true,
    displaySymbol: '␀',
  },
  {
    keyword: '',
    pattern: '\\n',
    description: 'Line Break',
    atomic: true,
    displaySymbol: '↩',
  },
  { keyword: '', pattern: ' ', description: 'Space', atomic: true },
]

/** Factory: returns an avatar render function with base-ui Avatar + initials fallback.
 *  Used in the typeahead dropdown menu (normal React tree). */
function mentionAvatar(src: string, name: string): () => React.ReactNode {
  return () => (
    <Avatar className="w-full h-full">
      <AvatarImage src={src} alt={name} />
      <AvatarFallback className="text-[8px]">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  )
}

/** Lightweight React component rendered inside the mention node's DOM via
 *  `createRoot` + `flushSync`.  Uses a plain `<img>` + `onError` state
 *  instead of base-ui Avatar to keep the initial render fully synchronous
 *  and avoid async DOM mutations that could confuse Lexical. */
const DEFAULT_MENTION_USERS: Array<IMentionUser> = [
  {
    id: '1',
    name: 'Alice Johnson',
    avatarUrl: '',
    avatar: mentionAvatar('', 'Alice Johnson'),
  },
  {
    id: '2',
    name: 'Bob Smith',
    avatarUrl: 'https://i.pravatar.cc/48?u=bob-smith',
    avatar: mentionAvatar('https://i.pravatar.cc/48?u=bob-smith', 'Bob Smith'),
  },
  {
    id: '3',
    name: 'Charlie Brown',
    avatarUrl: 'https://i.pravatar.cc/48?u=charlie-brown',
    avatar: mentionAvatar(
      'https://i.pravatar.cc/48?u=charlie-brown',
      'Charlie Brown',
    ),
  },
  {
    id: '4',
    name: 'Diana Prince',
    avatarUrl: 'https://i.pravatar.cc/48?u=diana-prince',
    avatar: mentionAvatar(
      'https://i.pravatar.cc/48?u=diana-prince',
      'Diana Prince',
    ),
  },
  {
    id: '5',
    name: 'Eve Williams',
    avatarUrl: 'https://i.pravatar.cc/48?u=eve-williams',
    avatar: mentionAvatar(
      'https://i.pravatar.cc/48?u=eve-williams',
      'Eve Williams',
    ),
  },
  {
    id: '6',
    name: 'Frank Castle',
    avatarUrl: 'https://i.pravatar.cc/48?u=frank-castle',
    avatar: mentionAvatar(
      'https://i.pravatar.cc/48?u=frank-castle',
      'Frank Castle',
    ),
  },
  {
    id: '7',
    name: 'Grace Hopper',
    avatarUrl: 'https://i.pravatar.cc/48?u=grace-hopper',
    avatar: mentionAvatar(
      'https://i.pravatar.cc/48?u=grace-hopper',
      'Grace Hopper',
    ),
  },
  {
    id: '8',
    name: 'Henry Ford',
    avatarUrl: 'https://i.pravatar.cc/48?u=henry-ford',
    avatar: mentionAvatar(
      'https://i.pravatar.cc/48?u=henry-ford',
      'Henry Ford',
    ),
  },
  {
    id: '9',
    name: 'Ivy Chen',
    avatarUrl: 'https://i.pravatar.cc/48?u=ivy-chen',
    avatar: mentionAvatar('https://i.pravatar.cc/48?u=ivy-chen', 'Ivy Chen'),
  },
  {
    id: '10',
    name: 'Jack Daniels',
    avatarUrl: 'https://i.pravatar.cc/48?u=jack-daniels',
    avatar: mentionAvatar(
      'https://i.pravatar.cc/48?u=jack-daniels',
      'Jack Daniels',
    ),
  },
  {
    id: '11',
    name: 'Karen Lee',
    avatarUrl: 'https://i.pravatar.cc/48?u=karen-lee',
    avatar: mentionAvatar('https://i.pravatar.cc/48?u=karen-lee', 'Karen Lee'),
  },
  {
    id: '12',
    name: 'Leo Messi',
    avatarUrl: 'https://i.pravatar.cc/48?u=leo-messi',
    avatar: mentionAvatar('https://i.pravatar.cc/48?u=leo-messi', 'Leo Messi'),
  },
  {
    id: '13',
    name: 'Mia Wong',
    avatarUrl: 'https://i.pravatar.cc/48?u=mia-wong',
    avatar: mentionAvatar('https://i.pravatar.cc/48?u=mia-wong', 'Mia Wong'),
  },
  {
    id: '14',
    name: 'Nathan Drake',
    avatarUrl: 'https://i.pravatar.cc/48?u=nathan-drake',
    avatar: mentionAvatar(
      'https://i.pravatar.cc/48?u=nathan-drake',
      'Nathan Drake',
    ),
  },
  {
    id: '15',
    name: 'Olivia Kim',
    avatarUrl: 'https://i.pravatar.cc/48?u=olivia-kim',
    avatar: mentionAvatar(
      'https://i.pravatar.cc/48?u=olivia-kim',
      'Olivia Kim',
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
  { label: "'layz'", start: 35, end: 39 },
  { label: "'sentance'", start: 50, end: 58 },
  { label: "'severl'", start: 68, end: 74 },
  { label: "'speling'", start: 75, end: 82 },
  { label: 'First 10 chars', start: 0, end: 10 },
  { label: 'Chars 100–120', start: 100, end: 120 },
]

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
  const [regexPresetsEnabled, setRegexPresetsEnabled] = useState(true)
  const [regexPresets, setRegexPresets] = useState<Array<RegexPreset>>(
    DEFAULT_REGEX_PRESETS,
  )

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
  const [lexiqaData, setLexiqaData] =
    useState<Array<ILexiQAValidation>>(DEFAULT_LEXIQA_DATA)
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
  const [tagAlias, setTagAlias] = useState('source')
  const [checkExpectedTags, setCheckExpectedTags] = useState(false)
  const [expectedTags, setExpectedTags] = useState<Array<string>>([
    '<b>',
    '</b>',
    '<i>',
    '</i>',
    '<a href="https://example.com">',
    '</a>',
    '<br/>',
  ])

  // Quote options
  const [singleQuoteOpen, setSingleQuoteOpen] = useState('{')
  const [singleQuoteClose, setSingleQuoteClose] = useState('}')
  const [doubleQuoteOpen, setDoubleQuoteOpen] = useState('{{')
  const [doubleQuoteClose, setDoubleQuoteClose] = useState('}}')
  const [quotesInTags, setQuotesInTags] = useState(false)
  const [quoteEscapeContractions, setQuoteEscapeContractions] = useState(true)
  const [quoteAllowNesting, setQuoteAllowNesting] = useState(false)
  const [quoteDetectInner, setQuoteDetectInner] = useState(true)

  // Quote auto-replace options (separate feature)
  const [quoteReplaceEnabled, setQuoteReplaceEnabled] = useState(false)
  const [quoteReplaceMode, setQuoteReplaceMode] =
    useState<QuoteAutoReplace>('always')
  const [quoteReplaceSingleOpen, setQuoteReplaceSingleOpen] = useState('\u2018')
  const [quoteReplaceSingleClose, setQuoteReplaceSingleClose] =
    useState('\u2019')
  const [quoteReplaceDoubleOpen, setQuoteReplaceDoubleOpen] = useState('\u201C')
  const [quoteReplaceDoubleClose, setQuoteReplaceDoubleClose] =
    useState('\u201D')

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

  const demoMeta = layoutDemos.find((d) => d.to === '/demo/cat-editor')

  // ── Custom mention DOM renderer (React-based) ───────────────────────
  // (Removed — now handled natively by CATEditor’s mentionShowAvatar prop)

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

    // ── Unified range-highlight rule (spellcheck + lexiqa) ──
    const highlights: Array<IRangeHighlight> = []
    if (spellcheckEnabled) {
      for (const v of spellcheckData) {
        highlights.push({
          type: 'spellcheck',
          start: v.start,
          end: v.end,
          validation: v,
        })
      }
    }
    if (lexiqaEnabled) {
      for (const v of lexiqaData) {
        highlights.push({
          type: 'lexiqa',
          start: v.start,
          end: v.start + v.length,
          validation: v,
        })
      }
    }
    if (highlights.length > 0) {
      active.push({
        type: 'range-highlight',
        highlights,
      } satisfies IRangeHighlightRule)
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
        alias: tagAlias || undefined,
        detectInner: tagsDetectInner,
        collapsed: tagsCollapsed,
        collapseScope: tagCollapseScope,
        pattern: tagPattern || undefined,
        checkExpectedTags,
        expectedTags: checkExpectedTags ? expectedTags : undefined,
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
    if (quoteReplaceEnabled) {
      active.push({
        type: 'quote-replace',
        singleQuote: {
          opening: quoteReplaceSingleOpen,
          closing: quoteReplaceSingleClose,
        },
        doubleQuote: {
          opening: quoteReplaceDoubleOpen,
          closing: quoteReplaceDoubleClose,
        },
        autoReplace: quoteReplaceMode,
      } satisfies IQuoteReplaceRule)
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
    if (regexPresetsEnabled) {
      const presetEntries = regexPresets
        .filter((p) => p.pattern.trim())
        .map((p) => ({
          keyword: '',
          pattern: p.pattern,
          description: p.label || undefined,
        }))
      if (presetEntries.length > 0) {
        active.push({
          type: 'keyword',
          label: 'custom',
          entries: presetEntries,
        } satisfies IKeywordsRule)
      }
    }
    // Search pushed last → highest highlight priority
    if (searchKeywords.trim()) {
      const entries = parseSearchTerms(searchKeywords)
      if (entries.length > 0) {
        active.push({
          type: 'keyword',
          label: 'search',
          entries,
        } satisfies IKeywordsRule)
      }
    }
    return active
  }, [
    spellcheckEnabled,
    spellcheckData,
    lexiqaEnabled,
    lexiqaData,
    tbTargetEnabled,
    tbEntries,
    specialCharEnabled,
    specialCharEntries,
    tagsEnabled,
    tagsCollapsed,
    tagsDetectInner,
    tagPattern,
    tagCollapseScope,
    tagAlias,
    checkExpectedTags,
    expectedTags,
    quotesEnabled,
    singleQuoteOpen,
    singleQuoteClose,
    doubleQuoteOpen,
    doubleQuoteClose,
    quotesInTags,
    quoteEscapeContractions,
    quoteAllowNesting,
    quoteDetectInner,
    quoteReplaceEnabled,
    quoteReplaceMode,
    quoteReplaceSingleOpen,
    quoteReplaceSingleClose,
    quoteReplaceDoubleOpen,
    quoteReplaceDoubleClose,
    linkEnabled,
    mentionEnabled,
    mentionTrigger,
    searchKeywords,
    regexPresetsEnabled,
    regexPresets,
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
    setLexiqaData(DEFAULT_LEXIQA_DATA)
    setTbEntries(DEFAULT_TB_ENTRIES)
    setSpecialCharEntries(DEFAULT_SPECIAL_CHARS)
    setTagsCollapsed(false)
    setTagsDetectInner(true)
    setTagPattern(DEFAULT_TAG_PATTERN)
    setTagCollapseScope('all')
    setTagAlias('source')
    setCheckExpectedTags(false)
    setExpectedTags([
      '<b>',
      '</b>',
      '<i>',
      '</i>',
      '<a href="https://example.com">',
      '</a>',
      '<br/>',
    ])
    setSingleQuoteOpen('{')
    setSingleQuoteClose('}')
    setDoubleQuoteOpen('{{')
    setDoubleQuoteClose('}}')
    setQuotesInTags(false)
    setQuoteEscapeContractions(true)
    setQuoteAllowNesting(false)
    setQuoteDetectInner(true)
    setQuoteReplaceEnabled(false)
    setQuoteReplaceMode('always')
    setQuoteReplaceSingleOpen('\u2018')
    setQuoteReplaceSingleClose('\u2019')
    setQuoteReplaceDoubleOpen('\u201C')
    setQuoteReplaceDoubleClose('\u201D')
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
  ) => setter((prev) => [...prev, { keyword: '' }])

  const updateSpecialChar = (idx: number, patch: Partial<IKeywordsEntry>) =>
    setSpecialCharEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
    )
  const removeSpecialChar = (idx: number) =>
    setSpecialCharEntries((prev) => prev.filter((_, i) => i !== idx))
  const addSpecialChar = () =>
    setSpecialCharEntries((prev) => [
      ...prev,
      { keyword: '', pattern: 'x', description: 'New Char', atomic: true },
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
          lexiqaData={lexiqaData}
          onLexiqaUpdate={(idx, patch) =>
            setLexiqaData((prev) =>
              prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)),
            )
          }
          onLexiqaRemove={(idx) =>
            setLexiqaData((prev) => prev.filter((_, i) => i !== idx))
          }
          onLexiqaAdd={() =>
            setLexiqaData((prev) => [
              ...prev,
              {
                category: 'misc',
                start: 0,
                end: 0,
                errorid: `lq-new-${Date.now()}`,
                ignored: false,
                insource: false,
                length: 0,
                module: 'custom',
                msg: '',
                suggestions: [],
              },
            ])
          }
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
          tagAlias={tagAlias}
          onTagAliasChange={setTagAlias}
          checkExpectedTags={checkExpectedTags}
          onCheckExpectedTagsChange={setCheckExpectedTags}
          expectedTags={expectedTags}
          onExpectedTagsChange={setExpectedTags}
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
          quoteReplaceEnabled={quoteReplaceEnabled}
          onQuoteReplaceEnabledChange={setQuoteReplaceEnabled}
          quoteReplaceMode={quoteReplaceMode}
          onQuoteReplaceModeChange={setQuoteReplaceMode}
          quoteReplaceSingleOpen={quoteReplaceSingleOpen}
          onQuoteReplaceSingleOpenChange={setQuoteReplaceSingleOpen}
          quoteReplaceSingleClose={quoteReplaceSingleClose}
          onQuoteReplaceSingleCloseChange={setQuoteReplaceSingleClose}
          quoteReplaceDoubleOpen={quoteReplaceDoubleOpen}
          onQuoteReplaceDoubleOpenChange={setQuoteReplaceDoubleOpen}
          quoteReplaceDoubleClose={quoteReplaceDoubleClose}
          onQuoteReplaceDoubleCloseChange={setQuoteReplaceDoubleClose}
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
          regexPresetsEnabled={regexPresetsEnabled}
          onRegexPresetsEnabledChange={setRegexPresetsEnabled}
          regexPresets={regexPresets}
          onRegexPresetsChange={setRegexPresets}
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
            mentionShowAvatar={mentionShowAvatar}
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
