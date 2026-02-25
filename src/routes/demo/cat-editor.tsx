import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Database,
  Eye,
  RotateCcw,
  SpellCheck,
} from 'lucide-react'

import type {
  ILexiQARule,
  ISpecialCharEntry,
  ISpecialCharRule,
  ISpellCheckRule,
  ISpellCheckValidation,
  ITBTargetEntry,
  ITBTargetRule,
  MooRule,
} from '@/layout/cat-editor'
import { CATEditor } from '@/layout/cat-editor'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { layoutDemos } from '@/data/layout-demos'

export const Route = createFileRoute('/demo/cat-editor')({
  component: CATEditorDemo,
})

// ─── Sample data ──────────────────────────────────────────────────────────────

const SAMPLE_TEXT =
  'The quick brown fox jumps over the layz dog. This sentance contains severl speling errors and some technical terms like API endpoint and HTTP request.\nTom & Jerry\u00A0say\u2009hello\u2003world\u200Bhidden\u2060join\u200Ahair.\tTabbed here.'

const SAMPLE_SPELLCHECK: Array<ISpellCheckValidation> = [
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

const SAMPLE_LEXIQA_TERMS = ['API endpoint', 'HTTP request']

const SAMPLE_TB_ENTRIES: Array<ITBTargetEntry> = [
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

const SAMPLE_SPECIAL_CHARS: Array<ISpecialCharEntry> = [
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
]

// ─── Demo component ──────────────────────────────────────────────────────────

function CATEditorDemo() {
  const [spellcheckEnabled, setSpellcheckEnabled] = useState(true)
  const [lexiqaEnabled, setLexiqaEnabled] = useState(true)
  const [tbTargetEnabled, setTbTargetEnabled] = useState(true)
  const [specialCharEnabled, setSpecialCharEnabled] = useState(true)
  const [resetKey, setResetKey] = useState(0)
  const [appliedSuggestions, setAppliedSuggestions] = useState<
    Array<{ ruleId: string; suggestion: string }>
  >([])

  // Find the demo metadata
  const demoMeta = layoutDemos.find((d) => d.to === '/demo/cat-editor')

  // Build active rules based on toggles
  const rules = useMemo<Array<MooRule>>(() => {
    const active: Array<MooRule> = []
    if (spellcheckEnabled) {
      active.push({
        type: 'spellcheck',
        validations: SAMPLE_SPELLCHECK,
      } satisfies ISpellCheckRule)
    }
    if (lexiqaEnabled) {
      active.push({
        type: 'lexiqa',
        terms: SAMPLE_LEXIQA_TERMS,
      } satisfies ILexiQARule)
    }
    if (tbTargetEnabled) {
      active.push({
        type: 'tb-target',
        entries: SAMPLE_TB_ENTRIES,
      } satisfies ITBTargetRule)
    }
    if (specialCharEnabled) {
      active.push({
        type: 'special-char',
        entries: SAMPLE_SPECIAL_CHARS,
      } satisfies ISpecialCharRule)
    }
    return active
  }, [spellcheckEnabled, lexiqaEnabled, tbTargetEnabled, specialCharEnabled])

  const handleSuggestionApply = useCallback(
    (ruleId: string, suggestion: string) => {
      setAppliedSuggestions((prev) => [...prev, { ruleId, suggestion }])
    },
    [],
  )

  const handleReset = useCallback(() => {
    setAppliedSuggestions([])
    setSpellcheckEnabled(true)
    setLexiqaEnabled(true)
    setTbTargetEnabled(true)
    setSpecialCharEnabled(true)
    setResetKey((k) => k + 1)
  }, [])

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

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-6 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Switch
              id="spellcheck-toggle"
              checked={spellcheckEnabled}
              onCheckedChange={setSpellcheckEnabled}
            />
            <Label
              htmlFor="spellcheck-toggle"
              className="flex items-center gap-1.5 cursor-pointer"
            >
              <SpellCheck className="h-4 w-4 text-red-500" />
              Spellcheck
            </Label>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="lexiqa-toggle"
              checked={lexiqaEnabled}
              onCheckedChange={setLexiqaEnabled}
            />
            <Label
              htmlFor="lexiqa-toggle"
              className="flex items-center gap-1.5 cursor-pointer"
            >
              <BookOpen className="h-4 w-4 text-violet-500" />
              LexiQA
            </Label>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="tb-target-toggle"
              checked={tbTargetEnabled}
              onCheckedChange={setTbTargetEnabled}
            />
            <Label
              htmlFor="tb-target-toggle"
              className="flex items-center gap-1.5 cursor-pointer"
            >
              <Database className="h-4 w-4 text-teal-500" />
              TB Target
            </Label>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="special-char-toggle"
              checked={specialCharEnabled}
              onCheckedChange={setSpecialCharEnabled}
            />
            <Label
              htmlFor="special-char-toggle"
              className="flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="h-4 w-4 text-amber-500" />
              Special Chars
            </Label>
          </div>

          <div className="ml-auto">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded cat-highlight cat-highlight-spellcheck" />
            <span className="text-muted-foreground">Spellcheck error</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded cat-highlight cat-highlight-lexiqa" />
            <span className="text-muted-foreground">LexiQA term</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded cat-highlight cat-highlight-tb-target" />
            <span className="text-muted-foreground">TB Target term</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded cat-highlight cat-highlight-special-char" />
            <span className="text-muted-foreground">Special character</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded cat-highlight cat-highlight-nested cat-highlight-lexiqa cat-highlight-tb-target" />
            <span className="text-muted-foreground">
              Nested (multiple rules)
            </span>
          </div>
          <div className="text-muted-foreground/60 ml-auto text-xs">
            Hover a highlight to see details & suggestions
          </div>
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
            key={resetKey}
            initialText={SAMPLE_TEXT}
            rules={rules}
            onSuggestionApply={handleSuggestionApply}
            placeholder="Type or paste your text here…"
          />
        </div>

        {/* Info panels */}
        <div className="grid gap-6 sm:grid-cols-2">
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
                      </code>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Active rules summary */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Active Rules
            </h3>
            <div className="space-y-2 text-sm">
              {spellcheckEnabled && (
                <div className="flex items-start gap-2">
                  <SpellCheck className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-foreground">
                      Spellcheck
                    </span>
                    <span className="text-muted-foreground">
                      {' '}
                      — {SAMPLE_SPELLCHECK.length} validation
                      {SAMPLE_SPELLCHECK.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              )}
              {lexiqaEnabled && (
                <div className="flex items-start gap-2">
                  <BookOpen className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-foreground">LexiQA</span>
                    <span className="text-muted-foreground">
                      {' '}
                      — {SAMPLE_LEXIQA_TERMS.length} term
                      {SAMPLE_LEXIQA_TERMS.length !== 1 ? 's' : ''} (
                      {SAMPLE_LEXIQA_TERMS.join(', ')})
                    </span>
                  </div>
                </div>
              )}
              {!spellcheckEnabled &&
                !lexiqaEnabled &&
                !tbTargetEnabled &&
                !specialCharEnabled && (
                  <p className="text-muted-foreground">
                    No rules active. Toggle spellcheck, LexiQA, TB Target, or
                    Special Chars above.
                  </p>
                )}
              {tbTargetEnabled && (
                <div className="flex items-start gap-2">
                  <Database className="h-4 w-4 text-teal-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-foreground">
                      TB Target
                    </span>
                    <span className="text-muted-foreground">
                      {' '}
                      — {SAMPLE_TB_ENTRIES.length} entr
                      {SAMPLE_TB_ENTRIES.length !== 1 ? 'ies' : 'y'} (
                      {SAMPLE_TB_ENTRIES.map((e) => e.term).join(', ')})
                    </span>
                  </div>
                </div>
              )}
              {specialCharEnabled && (
                <div className="flex items-start gap-2">
                  <Eye className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-foreground">
                      Special Chars
                    </span>
                    <span className="text-muted-foreground">
                      {' '}
                      — {SAMPLE_SPECIAL_CHARS.length} patterns
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
