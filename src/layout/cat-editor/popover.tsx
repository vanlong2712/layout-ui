import * as React from 'react'
import { useEffect, useRef, useState } from 'react'

import { CODEPOINT_DISPLAY_MAP } from './constants'

import type {
  ISpellCheckValidation,
  PopoverContentRenderer,
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

function GlossaryPopoverContent({
  data,
}: {
  data: { label: string; term: string; description?: string }
}) {
  const displayLabel = data.label
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return (
    <div className="p-3 max-w-xs space-y-2">
      <span
        className={`cat-badge cat-badge-glossary cat-badge-glossary-${data.label}`}
      >
        {displayLabel}
      </span>
      <p className="text-sm leading-relaxed text-foreground">
        Term:{' '}
        <strong className="font-semibold text-foreground">{data.term}</strong>
      </p>
      {data.description && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {data.description}
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
  const cp = data.char.codePointAt(0) ?? 0
  const displaySymbol =
    CODEPOINT_DISPLAY_MAP[cp] ?? (data.char.trim() === '' ? '·' : data.char)

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

function TagPopoverContent({
  data,
}: {
  data: {
    tagNumber: number
    tagName: string
    isClosing: boolean
    isSelfClosing: boolean
    originalText: string
    displayText: string
  }
}) {
  return (
    <div className="p-3 max-w-xs space-y-2">
      <span className="cat-badge cat-badge-tag">Tag #{data.tagNumber}</span>
      <p className="text-sm leading-relaxed text-foreground">
        {data.isClosing
          ? 'Closing'
          : data.isSelfClosing
            ? 'Self-closing'
            : 'Opening'}{' '}
        tag:{' '}
        <strong className="font-semibold text-foreground">
          &lt;{data.isClosing ? '/' : ''}
          {data.tagName}
          {data.isSelfClosing ? ' /' : ''}&gt;
        </strong>
      </p>
      <p className="text-xs text-muted-foreground">
        Collapsed:{' '}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          {data.displayText}
        </code>
      </p>
      <p className="text-xs text-muted-foreground break-all">
        Original:{' '}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          {data.originalText}
        </code>
      </p>
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
  renderPopoverContent,
}: {
  state: PopoverState
  annotationMap: Map<string, RuleAnnotation>
  onSuggestionClick: (suggestion: string, ruleId: string) => void
  onDismiss: () => void
  onPopoverEnter: () => void
  renderPopoverContent?: PopoverContentRenderer
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
      {annotations.map((ann, i) => {
        const custom = renderPopoverContent?.({
          annotation: ann,
          onSuggestionClick: (s) => onSuggestionClick(s, ann.id),
        })

        return (
          <React.Fragment key={ann.id}>
            {i > 0 && <hr className="border-border my-0" />}
            {custom != null ? (
              custom
            ) : ann.type === 'spellcheck' ? (
              <SpellCheckPopoverContent
                data={ann.data}
                onSuggestionClick={(s) => onSuggestionClick(s, ann.id)}
              />
            ) : ann.type === 'glossary' ? (
              <GlossaryPopoverContent data={ann.data} />
            ) : ann.type === 'tag' ? (
              <TagPopoverContent data={ann.data} />
            ) : (
              <SpecialCharPopoverContent data={ann.data} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
