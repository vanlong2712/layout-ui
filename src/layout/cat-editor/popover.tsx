import * as React from 'react'
import { useEffect, useRef, useState } from 'react'

import { SPECIAL_CHAR_DISPLAY_MAP } from './constants'

import type {
  ISpellCheckValidation,
  ITBTargetEntry,
  PopoverState,
  RuleAnnotation,
} from './types'

// ─── Popover Content Components ──────────────────────────────────────────────

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

// ─── Main Popover Wrapper ────────────────────────────────────────────────────

export function HighlightPopover({
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
