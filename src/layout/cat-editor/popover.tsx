import * as React from 'react'
import { useLayoutEffect, useRef } from 'react'
import { createPopper } from '@popperjs/core'

import { getEffectiveCodepointMap } from './constants'

import type { Instance as PopperInstance } from '@popperjs/core'
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
  const effectiveMap = getEffectiveCodepointMap()
  const displaySymbol =
    effectiveMap[cp] ?? (data.char.trim() === '' ? '·' : data.char)

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
  // Non-HTML placeholders: tagName === originalText (the full match)
  const isPlaceholder =
    !data.isClosing && !data.isSelfClosing && data.tagName === data.originalText

  return (
    <div className="p-3 max-w-xs space-y-2">
      <span className="cat-badge cat-badge-tag">
        {isPlaceholder ? 'Placeholder' : 'Tag'} #{data.tagNumber}
      </span>
      <p className="text-sm leading-relaxed text-foreground">
        {isPlaceholder
          ? 'Placeholder'
          : data.isClosing
            ? 'Closing tag'
            : data.isSelfClosing
              ? 'Self-closing tag'
              : 'Opening tag'}
        :{' '}
        <strong className="font-semibold text-foreground">
          {data.originalText}
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

function LinkPopoverContent({
  data,
  onOpen,
}: {
  data: { url: string; displayText: string }
  onOpen: () => void
}) {
  return (
    <div className="p-3 max-w-xs space-y-2">
      <span className="cat-badge cat-badge-link">Link</span>
      <p className="text-sm leading-relaxed text-foreground break-all">
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          {data.url}
        </code>
      </p>
      <button type="button" className="cat-suggestion-btn" onClick={onOpen}>
        Open link ↗
      </button>
    </div>
  )
}

function MentionPopoverContent({
  data,
}: {
  data: { trigger: string; name: string; fullMatch: string }
}) {
  return (
    <div className="p-3 max-w-xs space-y-2">
      <span className="cat-badge cat-badge-mention">Mention</span>
      <p className="text-sm leading-relaxed text-foreground">
        <strong className="font-semibold text-foreground">
          {data.fullMatch}
        </strong>
      </p>
    </div>
  )
}

function QuotePopoverContent({
  data,
}: {
  data: {
    quoteType: 'single' | 'double'
    position: 'opening' | 'closing'
    originalChar: string
    replacementChar: string
  }
}) {
  return (
    <div className="p-3 max-w-xs space-y-2">
      <span
        className={`cat-badge cat-badge-quote cat-badge-quote-${data.quoteType}`}
      >
        {data.quoteType === 'single' ? 'Single Quote' : 'Double Quote'}
      </span>
      <p className="text-sm leading-relaxed text-foreground">
        {data.position === 'opening' ? 'Opening' : 'Closing'} quote
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
          {data.originalChar}
        </code>
        <span>→</span>
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
          {data.replacementChar}
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
  onLinkOpen,
  onDismiss,
  onPopoverEnter,
  renderPopoverContent,
}: {
  state: PopoverState
  annotationMap: Map<string, RuleAnnotation>
  onSuggestionClick: (suggestion: string, ruleId: string) => void
  onLinkOpen?: (url: string) => void
  onDismiss: () => void
  onPopoverEnter: () => void
  renderPopoverContent?: PopoverContentRenderer
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const popperRef = useRef<PopperInstance | null>(null)

  // Manage the Popper instance imperatively inside useLayoutEffect so that
  // positioning is applied to the DOM BEFORE the browser paints —
  // eliminating the "flash at (0,0)" entirely.
  useLayoutEffect(() => {
    const el = popoverRef.current
    if (!el) {
      // Popover not in DOM (hidden via early return below)
      popperRef.current?.destroy()
      popperRef.current = null
      return
    }

    const virtualEl = {
      getBoundingClientRect: (): DOMRect =>
        ({
          top: state.y,
          left: state.x,
          bottom: state.y,
          right: state.x,
          width: 0,
          height: 0,
          x: state.x,
          y: state.y,
          toJSON: () => {},
        }) as DOMRect,
    }

    // Hide before (re-)positioning so the old position doesn't flash
    el.style.visibility = 'hidden'

    if (popperRef.current) {
      // Reuse existing instance — just update the virtual reference
      popperRef.current.state.elements.reference =
        virtualEl as unknown as Element
    } else {
      popperRef.current = createPopper(virtualEl as unknown as Element, el, {
        strategy: 'fixed',
        placement: 'bottom-start',
        modifiers: [
          { name: 'offset', options: { offset: [0, 6] } },
          { name: 'preventOverflow', options: { padding: 16 } },
          { name: 'flip', options: { padding: 16 } },
        ],
      })
    }

    // forceUpdate() is SYNCHRONOUS — runs all Popper modifiers (including
    // applyStyles) immediately, so styles are written to the DOM before we
    // make the element visible.
    popperRef.current.forceUpdate()
    el.style.visibility = ''
  }, [state.visible, state.x, state.y])

  // Destroy popper on unmount
  useLayoutEffect(() => {
    return () => {
      popperRef.current?.destroy()
      popperRef.current = null
    }
  }, [])

  if (!state.visible) return null

  const annotations = state.ruleIds
    .map((id) => annotationMap.get(id))
    .filter((a): a is RuleAnnotation => a != null)

  if (annotations.length === 0) return null

  return (
    <div
      ref={popoverRef}
      className="cat-popover"
      style={{ position: 'fixed', left: 0, top: 0, zIndex: 1000 }}
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
            ) : ann.type === 'quote' ? (
              <QuotePopoverContent data={ann.data} />
            ) : ann.type === 'link' ? (
              <LinkPopoverContent
                data={ann.data}
                onOpen={() => {
                  if (onLinkOpen) {
                    onLinkOpen(ann.data.url)
                  } else {
                    window.open(ann.data.url, '_blank', 'noopener,noreferrer')
                  }
                }}
              />
            ) : ann.type === 'mention' ? (
              <MentionPopoverContent data={ann.data} />
            ) : (
              <SpecialCharPopoverContent data={ann.data} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
