import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import type { QuoteRange } from '@/utils/detect-quotes'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { BUILTIN_ESCAPE_PATTERNS, detectQuotes } from '@/utils/detect-quotes'

export const Route = createFileRoute('/demo/detect-quotes')({
  component: DetectQuotesDemo,
})

// ─── Sample texts users can pick from ─────────────────────────────────────────

const SAMPLE_TEXTS = [
  {
    label: 'Contractions & mixed quotes',
    text: `She said "I don't know" and he replied 'me neither'.`,
  },
  {
    label: 'Nested quotes',
    text: `He whispered "she told me 'run away' before dawn".`,
  },
  {
    label: 'Unclosed quote',
    text: `This has an "unclosed double quote and it just keeps going…`,
  },
  {
    label: 'Multiple contractions',
    text: `They can't believe we won't stop. "It's incredible", she'll say. I'm amazed they've done it.`,
  },
  {
    label: 'Escaped quotes',
    text: `He said "this is a \\"quoted\\" word" and 'it\\'s fine'.`,
  },
  {
    label: 'Empty input',
    text: '',
  },
]

// ─── Highlighted text renderer ────────────────────────────────────────────────

function HighlightedText({
  text,
  quotes,
}: {
  text: string
  quotes: Map<number, QuoteRange>
}) {
  if (quotes.size === 0) {
    return <span className="text-gray-300 whitespace-pre-wrap">{text}</span>
  }

  // Deduplicate (start & end keys point to same object) and sort
  const seen = new Set<QuoteRange>()
  const ranges = [...quotes.values()]
    .filter((r) => {
      if (seen.has(r)) return false
      seen.add(r)
      return true
    })
    .sort((a, b) => a.start - b.start)

  const parts: Array<React.ReactNode> = []
  let cursor = 0

  for (const range of ranges) {
    // Text before this quote
    if (range.start > cursor) {
      parts.push(
        <span key={`t-${cursor}`} className="text-foreground">
          {text.slice(cursor, range.start)}
        </span>,
      )
    }

    const end = range.closed ? range.end! + 1 : text.length
    const color =
      range.quoteType === 'double'
        ? range.closed
          ? 'bg-cyan-200/70 text-cyan-800 border-b border-cyan-400 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/50'
          : 'bg-red-200/70 text-red-800 border-b border-red-400 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/50'
        : range.closed
          ? 'bg-amber-200/70 text-amber-800 border-b border-amber-400 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/50'
          : 'bg-red-200/70 text-red-800 border-b border-red-400 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/50'

    parts.push(
      <span key={`q-${range.start}`} className={`${color} rounded-sm px-0.5`}>
        {text.slice(range.start, end)}
      </span>,
    )
    cursor = end
  }

  // Remaining text
  if (cursor < text.length) {
    parts.push(
      <span key={`t-${cursor}`} className="text-foreground">
        {text.slice(cursor)}
      </span>,
    )
  }

  return <span className="whitespace-pre-wrap">{parts}</span>
}

// ─── Result table ─────────────────────────────────────────────────────────────

function ResultsTable({ quotes }: { quotes: Map<number, QuoteRange> }) {
  if (quotes.size === 0) {
    return (
      <p className="text-muted-foreground italic text-sm">
        No quotes detected. Click &ldquo;Detect Quotes&rdquo; to analyze the
        text.
      </p>
    )
  }

  // Deduplicate entries (start & end keys reference the same object)
  const seen = new Set<QuoteRange>()
  const unique = [...quotes.entries()].filter(([, r]) => {
    if (seen.has(r)) return false
    seen.add(r)
    return true
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Keys</th>
            <th className="py-2 pr-4 font-medium">Start</th>
            <th className="py-2 pr-4 font-medium">End</th>
            <th className="py-2 pr-4 font-medium">Type</th>
            <th className="py-2 pr-4 font-medium">Content</th>
            <th className="py-2 font-medium">Closed</th>
          </tr>
        </thead>
        <tbody>
          {unique.map(([key, q]) => (
            <tr
              key={key}
              className="border-b border-border/50 hover:bg-muted/50 transition-colors"
            >
              <td className="py-2 pr-4 font-mono text-muted-foreground">
                {q.end != null ? (
                  <>
                    <span className="text-cyan-700 dark:text-cyan-400">
                      {q.start}
                    </span>
                    {', '}
                    <span className="text-amber-700 dark:text-amber-400">
                      {q.end}
                    </span>
                  </>
                ) : (
                  <span className="text-cyan-700 dark:text-cyan-400">
                    {q.start}
                  </span>
                )}
              </td>
              <td className="py-2 pr-4 font-mono">{q.start}</td>
              <td className="py-2 pr-4 font-mono">
                {q.end ?? (
                  <span className="text-red-600 dark:text-red-400">null</span>
                )}
              </td>
              <td className="py-2 pr-4">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                    q.quoteType === 'double'
                      ? 'bg-cyan-200/70 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300'
                      : 'bg-amber-200/70 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                  }`}
                >
                  {q.quoteType}
                </span>
              </td>
              <td className="py-2 pr-4 font-mono max-w-50 truncate">
                {q.content || (
                  <span className="text-muted-foreground/60 italic">empty</span>
                )}
              </td>
              <td className="py-2">
                {q.closed ? (
                  <span className="text-green-600 dark:text-green-400">✓</span>
                ) : (
                  <span className="text-red-600 dark:text-red-400">✗</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Escape patterns viewer ───────────────────────────────────────────────────

function EscapePatternsInfo() {
  return (
    <details className="text-sm text-muted-foreground mt-2">
      <summary className="cursor-pointer hover:text-foreground transition-colors">
        View built-in escape patterns
      </summary>
      <div className="mt-2 p-3 rounded-lg bg-muted font-mono text-xs space-y-1">
        {Object.entries(BUILTIN_ESCAPE_PATTERNS).map(([lang, patterns]) => (
          <div key={lang}>
            <span className="text-cyan-700 dark:text-cyan-400">{lang}</span>:{' '}
            {patterns.length > 0 ? (
              patterns.map((p, i) => (
                <span key={p}>
                  {i > 0 && ', '}
                  <code className="text-amber-600 dark:text-amber-300">{`"${p}"`}</code>
                </span>
              ))
            ) : (
              <span className="text-muted-foreground/60">[]</span>
            )}
          </div>
        ))}
      </div>
    </details>
  )
}

// ─── Main demo component ──────────────────────────────────────────────────────

function DetectQuotesDemo() {
  const [text, setText] = useState(SAMPLE_TEXTS[0].text)
  const [escapeContractions, setEscapeContractions] = useState(true)
  const [allowNesting, setAllowNesting] = useState(false)
  const [detectInnerQuotes, setDetectInnerQuotes] = useState(true)
  const [quotes, setQuotes] = useState<Map<number, QuoteRange>>(new Map())
  const [hasRun, setHasRun] = useState(false)

  const charCount = useMemo(() => text.length, [text])

  function handleDetect() {
    const result = detectQuotes(text, {
      escapeContractions,
      escapePatterns: 'english',
      allowNesting,
      detectInnerQuotes,
    })
    console.log({ result })
    setQuotes(result)
    setHasRun(true)
  }

  function handleSampleSelect(sample: string) {
    setText(sample)
    setQuotes(new Map())
    setHasRun(false)
  }

  return (
    <div className="flex items-start justify-center min-h-screen p-4 text-foreground bg-background">
      <div className="w-full max-w-4xl py-8 md:py-12 space-y-6 md:space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold bg-linear-to-r from-cyan-400 via-purple-400 to-amber-400 bg-clip-text text-transparent">
            Detect Quotes
          </h1>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            Analyze text for single and double quote ranges. Contractions like{' '}
            <code className="text-amber-500 dark:text-amber-300">
              don&apos;t
            </code>
            ,{' '}
            <code className="text-amber-500 dark:text-amber-300">
              can&apos;t
            </code>{' '}
            are automatically escaped when the toggle is on.
          </p>
        </div>

        {/* Editor card */}
        <div className="rounded-xl bg-card shadow-xl border border-border p-4 md:p-6 space-y-5">
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">
              Sample Texts
            </Label>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_TEXTS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => handleSampleSelect(s.text)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    text === s.text
                      ? 'border-cyan-500 bg-cyan-500/20 text-cyan-600 dark:text-cyan-300'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="quote-input"
                className="text-muted-foreground text-xs uppercase tracking-wider"
              >
                Input Text
              </Label>
              <span className="text-xs text-muted-foreground/60 font-mono">
                {charCount} chars
              </span>
            </div>
            <Textarea
              id="quote-input"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setQuotes(new Map())
                setHasRun(false)
              }}
              rows={4}
              placeholder="Type or paste text here…"
              className="font-mono text-sm"
            />
          </div>

          {/* Options row */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4 md:gap-6">
                <div className="flex items-center gap-3">
                  <Switch
                    id="escape-toggle"
                    checked={escapeContractions}
                    onCheckedChange={(checked) => {
                      setEscapeContractions(checked)
                      setQuotes(new Map())
                      setHasRun(false)
                    }}
                  />
                  <Label
                    htmlFor="escape-toggle"
                    className="text-sm text-foreground cursor-pointer"
                  >
                    Escape contractions{' '}
                    <span className="text-muted-foreground">
                      (don&apos;t, can&apos;t, …)
                    </span>
                  </Label>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    id="nesting-toggle"
                    checked={allowNesting}
                    onCheckedChange={(checked) => {
                      setAllowNesting(checked)
                      setQuotes(new Map())
                      setHasRun(false)
                    }}
                  />
                  <Label
                    htmlFor="nesting-toggle"
                    className="text-sm text-foreground cursor-pointer"
                  >
                    Allow nesting{' '}
                    <span className="text-muted-foreground">
                      (overlapping quote types)
                    </span>
                  </Label>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    id="inner-toggle"
                    checked={detectInnerQuotes}
                    disabled={allowNesting}
                    onCheckedChange={(checked) => {
                      setDetectInnerQuotes(checked)
                      setQuotes(new Map())
                      setHasRun(false)
                    }}
                  />
                  <Label
                    htmlFor="inner-toggle"
                    className={`text-sm cursor-pointer ${
                      allowNesting ? 'text-muted-foreground' : 'text-foreground'
                    }`}
                  >
                    Detect inner quotes{' '}
                    <span className="text-muted-foreground">
                      (&apos;run away&apos; inside &quot;...&quot;)
                    </span>
                  </Label>
                </div>
              </div>

              <Button
                onClick={handleDetect}
                size="lg"
                className="w-full sm:w-auto"
              >
                Detect Quotes
              </Button>
            </div>
          </div>

          <EscapePatternsInfo />
        </div>

        {/* Results */}
        {hasRun && (
          <div className="rounded-xl bg-card shadow-xl border border-border p-4 md:p-6 space-y-5">
            {/* Highlighted preview */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                Highlighted Preview
              </Label>
              <div className="p-4 rounded-lg bg-muted font-mono text-sm leading-relaxed">
                <HighlightedText text={text} quotes={quotes} />
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm bg-cyan-300 border border-cyan-500 dark:bg-cyan-500/30 dark:border-cyan-500/50" />
                  Double quote
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm bg-amber-300 border border-amber-500 dark:bg-amber-500/30 dark:border-amber-500/50" />
                  Single quote
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm bg-red-300 border border-red-500 dark:bg-red-500/30 dark:border-red-500/50" />
                  Unclosed
                </span>
              </div>
            </div>

            {/* Map table */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                Map&lt;position_index, QuoteRange&gt;{' '}
                <span className="text-muted-foreground/60 normal-case font-normal">
                  — {quotes.size} {quotes.size === 1 ? 'entry' : 'entries'}{' '}
                  (start + end keys)
                </span>
              </Label>
              <div className="p-4 rounded-lg bg-muted">
                <ResultsTable quotes={quotes} />
              </div>
            </div>

            {/* Raw JSON */}
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors text-xs uppercase tracking-wider">
                Raw JSON output
              </summary>
              <pre className="mt-2 p-4 rounded-lg bg-muted text-xs font-mono text-foreground overflow-x-auto">
                {JSON.stringify(
                  [...quotes.entries()].map(([k, v]) => ({ key: k, ...v })),
                  null,
                  2,
                )}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}
