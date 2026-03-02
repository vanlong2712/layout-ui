import * as React from 'react'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { z } from 'zod'
import { Popover } from '@base-ui/react/popover'
import { Tooltip } from '@base-ui/react/tooltip'
import { Command } from 'cmdk'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  restrictToFirstScrollableAncestor,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import { Check, ChevronDown, GripVertical, X } from 'lucide-react'

import type { Range } from '@tanstack/react-virtual'
import type {
  CollisionDetection,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core'

import { cn } from '@/lib/utils'

// ===========================================================================
// Types (public API – kept identical for backward compatibility)
// ===========================================================================

/**
 * For `icon` we accept either a ReactNode (already rendered) or a **render
 * function** `() => ReactNode`.  The render‑function form lets consumers pass
 * lazy/memoised icons so the component only mounts them when visible (better
 * perf for large lists with heavy SVG icons).
 */
export type IconProp = React.ReactNode | (() => React.ReactNode)

export interface IOption {
  label: string
  value: string | number
  icon?: IconProp
  disabled?: boolean
  disabledTooltip?: string
  /** Nested children – rendered as a visual group. */
  children?: Array<IOption>
}

/** Zod schema for `IOption`.  Validates data-only fields (icon is skipped
 *  at runtime since it carries React nodes / render functions). */
export const OptionSchema: z.ZodType<IOption> = z.lazy(() =>
  z.object({
    label: z.string(),
    value: z.union([z.string(), z.number()]),
    icon: z.custom<IconProp>().optional(),
    disabled: z.boolean().optional(),
    disabledTooltip: z.string().optional(),
    children: z.array(OptionSchema).optional(),
  }),
)

// ---- Conditional selection types ----

interface SingleSelectProps {
  type: 'single'
  selectValue?: IOption | null
  onChange?: (value: IOption | null, selectedOption: IOption) => void
  collapsed?: never
  showItemsLength?: never
}

interface MultipleSelectProps {
  type: 'multiple'
  selectValue?: Array<IOption>
  onChange?: (value: Array<IOption>, selectedOption: IOption) => void
  /** When `true` the trigger will expand to show all chips instead of
   *  collapsing them into a "+N" overflow badge. */
  collapsed?: boolean
  /** Force a maximum number of visible chip items. Lower priority than the
   *  automatic overflow detection when `collapsed` is not set. */
  showItemsLength?: number
}

// ---- Shared props ----

interface SharedSelectProps {
  /** All available options (may contain nested `children`). */
  options: Array<IOption>
  /** Placeholder shown when nothing is selected. */
  placeholder?: string
  /** Whether the entire select is disabled. */
  disabled?: boolean
  /** Whether the select is in read‑only mode (looks interactive but cannot
   *  be changed). */
  readOnly?: boolean
  /** Marks the select as having a validation error. */
  error?: boolean
  /** Allow the user to clear the selection. */
  clearable?: boolean
  /** Custom class for the root wrapper. */
  className?: string
  /** Custom class for the trigger. */
  triggerClassName?: string
  /** Custom class for the popup. */
  popupClassName?: string

  // ---- Render overrides ----

  /** Replace the entire trigger UI. Receives the current value(s) and a
   *  boolean indicating whether the popup is open. */
  renderTrigger?: (props: {
    value: IOption | Array<IOption> | null
    open: boolean
    disabled: boolean
    readOnly: boolean
    error: boolean
    placeholder: string
  }) => React.ReactNode

  /** Replace the default option row renderer inside the list. */
  renderItem?: (
    option: IOption,
    state: { selected: boolean; highlighted: boolean; disabled: boolean },
  ) => React.ReactNode

  // ---- List chrome ----

  /** Component(s) rendered *before* the option list inside the popup. */
  listPrefix?: React.ReactNode
  /** Component(s) rendered *after* the option list inside the popup. */
  listSuffix?: React.ReactNode

  // ---- Async / lazy ----

  /** Called when the popup opens. Return a list of options to *replace* the
   *  current `options` prop (useful for lazy fetching). */
  queryFn?: () => Promise<Array<IOption>>

  /** Label rendered above the select (optional). */
  label?: string
}

// ---- Sortable types ----

interface SortableEnabledProps {
  /** Enable drag‑and‑drop reordering of options in the list. */
  sortable: true
  /** Called after the user finishes reordering. Receives the new sorted
   *  array of options. Required when `sortable` is `true`. */
  onSortEnd: (sortedOptions: Array<IOption>) => void
  /** When `true` and options are grouped (have `children`), items can be
   *  dragged across groups.  By default sorting is scoped within each group. */
  sortableAcrossGroups?: boolean
}

interface SortableDisabledProps {
  sortable?: false
  onSortEnd?: never
  sortableAcrossGroups?: never
}

export type LayoutSelectProps = SharedSelectProps &
  (SingleSelectProps | MultipleSelectProps) &
  (SortableEnabledProps | SortableDisabledProps)

// ===========================================================================
// Constants (hoisted outside render for stable identity & zero alloc)
// ===========================================================================

/** Identity transform returned when a sortable item should not visually move. */
const NO_MOVE = { x: 0, y: 0, scaleX: 1, scaleY: 1 } as const

/** Estimated heights used by the virtualizer. */
const GROUP_HEADER_HEIGHT = 28
const OPTION_ROW_HEIGHT = 36
const VIRTUALIZER_OVERSCAN = 8

/** Maximum chips rendered in the invisible measurement layer. */
const MAX_MEASURE_CHIPS = 20
/** Base minimum width for a partial (truncated) chip. */
const MIN_PARTIAL_CHIP_WIDTH = 50
/** Minimum badge width reserved for the "+N" overflow indicator. */
const MIN_BADGE_WIDTH = 40

/** Stable DnD-kit modifier array – prevents re-allocation per render. */
const DND_MODIFIERS = [
  restrictToVerticalAxis,
  restrictToFirstScrollableAncestor,
]

/**
 * Stable no-op callback matching {@link ChipProps.onRemove} signature.
 * Used in the invisible measurement layer so the remove button renders
 * for accurate width measurement without creating per-chip closures.
 */
const NOOP_REMOVE = (_: IOption): void => {}

// ===========================================================================
// Pure helper functions
// ===========================================================================

/** Resolve an `IconProp` to a ReactNode – cheap for already-rendered nodes,
 *  and defers the call for function icons. */
function resolveIcon(icon: IconProp | undefined): React.ReactNode {
  if (icon == null) return null
  return typeof icon === 'function' ? (icon as () => React.ReactNode)() : icon
}

/**
 * Flatten a nested option tree into a flat leaf list (iterative DFS).
 * Group parents (options with `children`) are **excluded** – only leaves.
 *
 * Uses an explicit stack instead of recursive spread to avoid O(n²)
 * intermediate array allocations on deep / wide trees.
 */
function flattenOptions(options: Array<IOption>): Array<IOption> {
  const result: Array<IOption> = []
  const stack: Array<IOption> = []
  // Push in reverse so the first option is popped first (preserves order).
  for (let i = options.length - 1; i >= 0; i--) stack.push(options[i])
  while (stack.length > 0) {
    const opt = stack.pop()!
    if (opt.children && opt.children.length > 0) {
      for (let i = opt.children.length - 1; i >= 0; i--) {
        stack.push(opt.children[i])
      }
    } else {
      result.push(opt)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Display row types for the virtualised list (group headers + leaf options)
// ---------------------------------------------------------------------------

type DisplayRow =
  | { kind: 'group-header'; label: string; groupValue: string | number }
  | { kind: 'option'; option: IOption; groupValue?: string | number }

/** Build a display-row list from potentially grouped options.
 *  If an option has `children`, emit a group-header row followed by child
 *  option rows.  Options without `children` are emitted as top-level
 *  option rows (groupValue = undefined). */
function buildDisplayRows(options: Array<IOption>): Array<DisplayRow> {
  const rows: Array<DisplayRow> = []
  for (const opt of options) {
    if (opt.children && opt.children.length > 0) {
      rows.push({
        kind: 'group-header',
        label: opt.label,
        groupValue: opt.value,
      })
      for (const child of opt.children) {
        rows.push({ kind: 'option', option: child, groupValue: opt.value })
      }
    } else {
      rows.push({ kind: 'option', option: opt })
    }
  }
  return rows
}

/** Check whether the options list contains any grouped entries. */
function hasGroups(options: Array<IOption>): boolean {
  return options.some((o) => o.children && o.children.length > 0)
}

/** Simple value equality check for options. */
function optionEq(a: IOption, b: IOption): boolean {
  return a.value === b.value
}

/**
 * Build a `Set` of selected option values for **O(1)** membership checks.
 * Far cheaper than linear `.some()` scans when rendering hundreds of rows.
 */
function buildSelectedSet(
  value: IOption | Array<IOption> | null,
): Set<string | number> {
  if (!value) return new Set()
  if (Array.isArray(value)) {
    const s = new Set<string | number>()
    for (const v of value) s.add(v.value)
    return s
  }
  return new Set([value.value])
}

/**
 * Build a `Map` from option stringified-value → group value for **O(1)**
 * group lookups (used by collision detection & sorting strategy).
 */
function buildValueToGroupMap(
  displayRows: Array<DisplayRow>,
): Map<string, string | number | undefined> {
  const map = new Map<string, string | number | undefined>()
  for (const r of displayRows) {
    if (r.kind === 'option') map.set(`${r.option.value}`, r.groupValue)
  }
  return map
}

/** Estimate badge width for "+N" overflow text. */
function estimateBadgeWidth(overflowCount: number): number {
  return overflowCount > 0 ? 14 + 8 * String(overflowCount).length : 0
}

// ===========================================================================
// Custom hooks
// ===========================================================================

/**
 * Measures how many chips fit in a container before overflowing.
 * Extracted from `MultipleTriggerContent` for single-responsibility and
 * independent testability.
 *
 * Returns `{ visibleCount, lastIsPartial, measured }`.
 */
function useChipOverflow(
  value: Array<IOption>,
  collapsed: boolean | undefined,
  wrapperRef: React.RefObject<HTMLDivElement | null>,
  measureRef: React.RefObject<HTMLDivElement | null>,
): { visibleCount: number; lastIsPartial: boolean; measured: boolean } {
  const [visibleCount, setVisibleCount] = useState(value.length)
  const [lastIsPartial, setLastIsPartial] = useState(false)
  const [measured, setMeasured] = useState(false)

  // `useEffectEvent` reads latest `value` without being a dependency.
  const calculate = React.useEffectEvent(() => {
    const measureContainer = measureRef.current
    if (!measureContainer) return

    const children = Array.from(measureContainer.children) as Array<HTMLElement>
    const containerRight = measureContainer.getBoundingClientRect().right
    const gap = parseFloat(getComputedStyle(measureContainer).columnGap) || 0
    let count = 0
    let partial = false

    for (const child of children) {
      const childRight = child.getBoundingClientRect().right
      const overflow = value.length - (count + 1)
      const reserve =
        overflow > 0
          ? Math.max(MIN_BADGE_WIDTH, estimateBadgeWidth(overflow))
          : 0
      if (childRight + reserve <= containerRight) {
        count++
      } else {
        break
      }
    }
    // Always show at least 1 chip when there are items.
    count = Math.max(1, count)

    // Check whether an extra "partial" (truncated) chip can fit.
    if (count < value.length && children.length >= count) {
      const lastRight = children[count - 1].getBoundingClientRect().right
      const needsBadge = count + 1 < value.length
      const badgeReserve = needsBadge
        ? Math.max(
            MIN_BADGE_WIDTH,
            estimateBadgeWidth(value.length - count - 1),
          )
        : 0
      const spaceForPartial = containerRight - badgeReserve - lastRight - gap
      const nextChip = value[count]
      let minWidth = MIN_PARTIAL_CHIP_WIDTH
      if (nextChip.icon && children.length > count) {
        const iconWrapper = children[count].firstElementChild
        if (iconWrapper) {
          minWidth += iconWrapper.getBoundingClientRect().width + gap
        }
      }
      if (spaceForPartial >= minWidth) {
        count++
        partial = true
      }
    }

    setVisibleCount(count)
    setLastIsPartial(partial)
    setMeasured(true)
  })

  useLayoutEffect(() => {
    if (collapsed || value.length === 0) {
      setVisibleCount(value.length)
      setLastIsPartial(false)
      setMeasured(true)
      return
    }

    const wrapper = wrapperRef.current
    const container = measureRef.current
    if (!wrapper || !container) return

    // Measure synchronously before browser paint.
    calculate()

    // Re-measure on resize so overflow recalculates correctly.
    const observer = new ResizeObserver(calculate)
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [collapsed, value])

  return { visibleCount, lastIsPartial, measured }
}

// ===========================================================================
// Sub-components (React.memo where beneficial for render optimisation)
// ===========================================================================

// ---------------------------------------------------------------------------
// DisabledTooltip wrapper
// ---------------------------------------------------------------------------

function MaybeTooltip({
  tooltip,
  children,
}: {
  tooltip?: string
  children: React.ReactElement
}) {
  if (!tooltip) return children
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6}>
          <Tooltip.Popup className="rounded-md bg-foreground px-2.5 py-1 text-xs text-background shadow-md">
            {tooltip}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

// ---------------------------------------------------------------------------
// Chip (for multiple-select trigger)
// ---------------------------------------------------------------------------

interface ChipProps {
  option: IOption
  /** When provided, a remove button is rendered. Called with the chip's option. */
  onRemove?: (option: IOption) => void
  readOnly?: boolean
  disabled?: boolean
  className?: string
  /** Mark as the "partial" chip that may be squeezed to truncate. */
  partial?: boolean
}

/**
 * Memoised chip component.  Accepts `onRemove(option)` instead of a
 * zero-arg callback so the parent can pass a **single stable reference**
 * for all chips, eliminating N closure allocations per render.
 */
const Chip = React.memo(function Chip({
  option,
  onRemove,
  readOnly,
  disabled,
  className,
  partial,
}: ChipProps) {
  return (
    <span
      data-partial-chip={partial || undefined}
      className={cn(
        'inline-flex max-w-35 items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs leading-5 text-secondary-foreground',
        disabled && 'opacity-50',
        className,
      )}
    >
      {option.icon && (
        <span className="flex shrink-0 items-center [&_svg]:size-3">
          {resolveIcon(option.icon)}
        </span>
      )}
      <span className="truncate">{option.label}</span>
      {!readOnly && !disabled && onRemove && (
        <button
          type="button"
          className="ml-0.5 flex shrink-0 items-center rounded-sm text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(option)
          }}
          tabIndex={-1}
          aria-label={`Remove ${option.label}`}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  )
})

// ---------------------------------------------------------------------------
// Overflow chip badge
// ---------------------------------------------------------------------------

const OverflowBadge = React.memo(function OverflowBadge({
  items,
  onRemove,
}: {
  items: Array<IOption>
  onRemove?: (option: IOption) => void
}) {
  if (items.length === 0) return null
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <span className="inline-flex shrink-0 items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
            +{items.length}
          </span>
        }
      />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6}>
          <Tooltip.Popup className="max-w-xs rounded-md bg-foreground px-3 py-2 text-xs text-background shadow-md">
            <div className="flex flex-wrap gap-1">
              {items.map((item) => (
                <span
                  key={item.value}
                  className="inline-flex items-center gap-1 rounded-md border border-background/20 bg-background/10 px-1.5 py-0.5 text-xs leading-4 text-background"
                >
                  {item.icon && (
                    <span className="flex shrink-0 items-center [&_svg]:size-3">
                      {resolveIcon(item.icon)}
                    </span>
                  )}
                  <span className="truncate">{item.label}</span>
                  {onRemove && (
                    <button
                      type="button"
                      className="ml-0.5 flex shrink-0 items-center rounded-sm text-background/60 hover:text-background"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemove(item)
                      }}
                      tabIndex={-1}
                      aria-label={`Remove ${item.label}`}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
})

// ---------------------------------------------------------------------------
// Default trigger renderers
// ---------------------------------------------------------------------------

function SingleTriggerContent({
  value,
  placeholder,
}: {
  value: IOption | null
  placeholder: string
}) {
  if (!value) {
    return <span className="truncate text-muted-foreground">{placeholder}</span>
  }
  return (
    <span className="flex items-center gap-2 truncate">
      {value.icon && (
        <span className="flex shrink-0 items-center [&_svg]:size-4">
          {resolveIcon(value.icon)}
        </span>
      )}
      <span className="truncate">{value.label}</span>
    </span>
  )
}

function MultipleTriggerContent({
  value,
  placeholder,
  collapsed,
  showItemsLength,
  onRemove,
  readOnly,
  disabled,
}: {
  value: Array<IOption>
  placeholder: string
  collapsed?: boolean
  showItemsLength?: number
  onRemove?: (option: IOption) => void
  readOnly?: boolean
  disabled?: boolean
}) {
  const chipRowClass = 'flex items-center gap-1'

  const wrapperRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const measureCount = Math.min(value.length, MAX_MEASURE_CHIPS)

  const { visibleCount, lastIsPartial, measured } = useChipOverflow(
    value,
    collapsed,
    wrapperRef,
    measureRef,
  )

  if (value.length === 0) {
    return <span className="truncate text-muted-foreground">{placeholder}</span>
  }

  // Invisible measurement layer – always present, always has ALL chips
  // rendered at natural (shrink-0) size for stable measurement.
  const measureLayer = !collapsed && (
    <div
      ref={measureRef}
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden opacity-0',
        chipRowClass,
      )}
      aria-hidden
    >
      {value.slice(0, measureCount).map((opt) => (
        <Chip
          key={opt.value}
          option={opt}
          onRemove={onRemove ? NOOP_REMOVE : undefined}
          readOnly={readOnly}
          disabled={disabled}
          className="shrink-0"
        />
      ))}
    </div>
  )

  // Wait for first measurement before showing real chips (SSR safety).
  const showContent = collapsed || measured
  if (!showContent) {
    return (
      <div
        ref={wrapperRef}
        className={cn('relative min-w-0 flex-1 overflow-hidden', chipRowClass)}
      >
        {measureLayer}
        <span className="truncate text-muted-foreground">
          {value.length} selected
        </span>
      </div>
    )
  }

  // Determine maximum fully-visible chips.
  let maxVisible = collapsed ? value.length : visibleCount
  const hasExplicitLimit = !collapsed && showItemsLength !== undefined
  if (hasExplicitLimit) {
    maxVisible = Math.min(visibleCount, showItemsLength)
  }
  maxVisible = Math.max(1, maxVisible)

  const hasOverflow = maxVisible < value.length
  const displayed = value.slice(0, maxVisible)
  const overflowItems = value.slice(maxVisible)

  return (
    <div
      ref={wrapperRef}
      className={cn('relative min-w-0 flex-1', chipRowClass)}
    >
      {measureLayer}
      <div
        className={cn(
          'min-w-0 flex-1',
          chipRowClass,
          collapsed ? 'flex-wrap' : 'overflow-hidden',
        )}
      >
        {displayed.map((opt, i) => {
          const isPartial =
            (hasOverflow || lastIsPartial) &&
            !hasExplicitLimit &&
            i === displayed.length - 1
          const shouldShrink = isPartial || hasExplicitLimit
          return (
            <Chip
              key={opt.value}
              option={opt}
              onRemove={onRemove}
              readOnly={readOnly}
              disabled={disabled}
              partial={isPartial}
              className={shouldShrink ? 'min-w-0 shrink' : 'shrink-0'}
            />
          )
        })}
      </div>
      {overflowItems.length > 0 && (
        <span className="shrink-0">
          <OverflowBadge items={overflowItems} onRemove={onRemove} />
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Option item (rendered inside Command.Item + virtual list)
// ---------------------------------------------------------------------------

interface OptionRowProps {
  option: IOption
  selected: boolean
  renderItem?: LayoutSelectProps['renderItem']
  onSelect: (option: IOption) => void
  highlighted?: boolean
}

/**
 * Memoised option row.  Because `onSelect` is stabilised via refs in the
 * parent, this memo is effective: rows whose `selected` boolean hasn't
 * changed skip re-rendering entirely during scroll & selection events.
 */
const OptionRow = React.memo(function OptionRow({
  option,
  selected,
  renderItem,
  onSelect,
  highlighted = false,
}: OptionRowProps) {
  const content = renderItem ? (
    renderItem(option, {
      selected,
      highlighted,
      disabled: !!option.disabled,
    })
  ) : (
    <div className="flex w-full items-center gap-2">
      {option.icon && (
        <span className="flex shrink-0 items-center [&_svg]:size-4">
          {resolveIcon(option.icon)}
        </span>
      )}
      <span className="flex-1 truncate">{option.label}</span>
      {selected && (
        <span className="ml-auto flex shrink-0 items-center text-primary">
          <Check className="size-4" />
        </span>
      )}
    </div>
  )

  const row = (
    <Command.Item
      value={`${option.value}`}
      disabled={option.disabled}
      onSelect={() => {
        if (!option.disabled) onSelect(option)
      }}
      className={cn(
        'relative flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none',
        'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
        option.disabled && 'pointer-events-none opacity-50',
      )}
      data-highlighted={highlighted || undefined}
    >
      {content}
    </Command.Item>
  )

  if (option.disabled && option.disabledTooltip) {
    return (
      <MaybeTooltip tooltip={option.disabledTooltip}>
        <div>{row}</div>
      </MaybeTooltip>
    )
  }

  return row
})

// ---------------------------------------------------------------------------
// Sortable item wrapper (for dnd-kit inside virtual list)
// ---------------------------------------------------------------------------

interface SortableItemProps {
  id: string
  children: React.ReactNode
  disabled?: boolean
}

const SortableItem = React.memo(function SortableItem({
  id,
  children,
  disabled,
}: SortableItemProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })

  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      {!disabled && (
        <button
          type="button"
          className="flex shrink-0 cursor-grab items-center px-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
})

// ===========================================================================
// Virtual + Sortable list
// ===========================================================================

interface VirtualListProps {
  /** Raw (potentially grouped) options – used to build display rows. */
  options: Array<IOption>
  /** Flat leaf items for backward-compat (used when there are no groups). */
  items: Array<IOption>
  selectedValue: IOption | Array<IOption> | null
  renderItem?: LayoutSelectProps['renderItem']
  onSelect: (option: IOption) => void
  sortable?: boolean
  sortableAcrossGroups?: boolean
  onSortEnd?: (items: Array<IOption>) => void
  /** Called when items within a group are reordered (grouped mode). */
  onGroupSortEnd?: (
    groupValue: string | number,
    children: Array<IOption>,
  ) => void
  /** Called when a cross-group drag produces a new grouped tree. */
  onTreeSort?: (tree: Array<IOption>) => void
}

function VirtualList({
  options,
  items,
  selectedValue,
  renderItem,
  onSelect,
  sortable,
  sortableAcrossGroups,
  onSortEnd,
  onGroupSortEnd,
  onTreeSort,
}: VirtualListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  // During a cross-group drag, holds the intermediate tree with the dragged
  // item moved to the destination group.  When null, `options` prop is used.
  const [dragTree, setDragTree] = useState<Array<IOption> | null>(null)

  const effectiveOptions = dragTree ?? options

  const grouped = useMemo(() => hasGroups(effectiveOptions), [effectiveOptions])
  const displayRows = useMemo(
    () => (grouped ? buildDisplayRows(effectiveOptions) : undefined),
    [grouped, effectiveOptions],
  )

  // Flat display rows for un-grouped mode.
  const flatDisplayRows = useMemo(
    () => items.map<DisplayRow>((o) => ({ kind: 'option', option: o })),
    [items],
  )
  const virtualItems = displayRows ?? flatDisplayRows

  // --- O(1) lookup structures (re-built only when data changes) ---

  /** Set of selected values for fast membership checks. */
  const selectedSet = useMemo(
    () => buildSelectedSet(selectedValue),
    [selectedValue],
  )

  /** Map from stringified option value → group value. */
  const valueToGroup = useMemo(
    () => (displayRows ? buildValueToGroupMap(displayRows) : null),
    [displayRows],
  )

  // Derive activeIndex from activeId so it stays correct after cross-group
  // moves update the tree mid-drag.
  const activeIndex = useMemo(() => {
    if (!activeId) return null
    const idx = virtualItems.findIndex(
      (r) => r.kind === 'option' && `${r.option.value}` === activeId,
    )
    return idx !== -1 ? idx : null
  }, [activeId, virtualItems])

  // Custom range extractor: always include the actively-dragged item so the
  // virtualizer never unmounts it (dnd-kit needs the DOM node to stay alive).
  const rangeExtractor = useCallback(
    (range: Range) => {
      const result = defaultRangeExtractor(range)
      if (activeIndex !== null && !result.includes(activeIndex)) {
        result.push(activeIndex)
        result.sort((a, b) => a - b)
      }
      return result
    },
    [activeIndex],
  )

  // Memoised estimateSize prevents virtualizer from re-measuring on every render.
  const estimateSize = useCallback(
    (index: number) =>
      virtualItems[index].kind === 'group-header'
        ? GROUP_HEADER_HEIGHT
        : OPTION_ROW_HEIGHT,
    [virtualItems],
  )

  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: VIRTUALIZER_OVERSCAN,
    rangeExtractor,
  })

  // After a cross-group drop the tree rebuilds and displayRows changes.
  // Force the virtualizer to discard stale position caches BEFORE paint
  // so every row gets the correct translateY immediately.
  useLayoutEffect(() => {
    virtualizer.measure()
  }, [virtualizer, displayRows])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )

  // Flat sortable IDs for the single SortableContext wrapping all items.
  const flatSortableIds = useMemo(
    () =>
      virtualItems
        .filter(
          (r): r is DisplayRow & { kind: 'option' } => r.kind === 'option',
        )
        .map((r) => `${r.option.value}`),
    [virtualItems],
  )

  // Custom collision detection using the pre-built Map for O(1) group lookups.
  const sameGroupCollision: CollisionDetection = useCallback(
    (args) => {
      if (!valueToGroup) return closestCenter(args)
      const activeGroup = valueToGroup.get(`${args.active.id}`)
      if (activeGroup === undefined) return closestCenter(args)
      const filtered = args.droppableContainers.filter(
        (container) => valueToGroup.get(`${container.id}`) === activeGroup,
      )
      return closestCenter({ ...args, droppableContainers: filtered })
    },
    [valueToGroup],
  )

  // Custom sorting strategy for grouped options using Map for O(1) lookups.
  // Only displaces items in the same group as the dragged item.
  const sortingStrategy = useMemo(() => {
    if (!grouped || !valueToGroup) return verticalListSortingStrategy
    return (
      args: Parameters<typeof verticalListSortingStrategy>[0],
    ): ReturnType<typeof verticalListSortingStrategy> => {
      const draggedId = flatSortableIds[args.activeIndex]
      const currentId = flatSortableIds[args.index]
      if (
        draggedId &&
        currentId &&
        valueToGroup.get(draggedId) !== valueToGroup.get(currentId)
      ) {
        return NO_MOVE
      }
      return verticalListSortingStrategy(args)
    }
  }, [grouped, valueToGroup, flatSortableIds])

  // ---- onDragOver: move item between groups during drag ----
  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (!sortableAcrossGroups || !grouped) return
      const { active, over } = event
      if (!over || active.id === over.id) return

      const currentTree = dragTree ?? options
      const currentRows = buildDisplayRows(currentTree)

      const activeRow = currentRows.find(
        (r) => r.kind === 'option' && `${r.option.value}` === `${active.id}`,
      )
      const overRow = currentRows.find(
        (r) => r.kind === 'option' && `${r.option.value}` === `${over.id}`,
      )

      if (
        !activeRow ||
        activeRow.kind !== 'option' ||
        !overRow ||
        overRow.kind !== 'option'
      )
        return

      // Same group — let dnd-kit's sorting strategy handle displacement.
      if (activeRow.groupValue === overRow.groupValue) return

      // Cross-group: move item from source group to destination group.
      const newTree = currentTree.map((opt) => {
        if (!opt.children) return opt
        if (opt.value === activeRow.groupValue) {
          return {
            ...opt,
            children: opt.children.filter(
              (c) => `${c.value}` !== `${active.id}`,
            ),
          }
        }
        if (opt.value === overRow.groupValue) {
          const destChildren = opt.children.filter(
            (c) => `${c.value}` !== `${active.id}`,
          )
          const overIdx = destChildren.findIndex(
            (c) => `${c.value}` === `${over.id}`,
          )
          destChildren.splice(
            overIdx !== -1 ? overIdx : destChildren.length,
            0,
            activeRow.option,
          )
          return { ...opt, children: destChildren }
        }
        return opt
      })

      setDragTree(newTree)
    },
    [sortableAcrossGroups, grouped, dragTree, options],
  )

  // ---- Drag end handlers ----
  const handleDragEndFlat = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)
      setDragTree(null)
      const { active, over } = event
      if (!over || active.id === over.id || !onSortEnd) return
      const oldIndex = items.findIndex((i) => `${i.value}` === `${active.id}`)
      const newIndex = items.findIndex((i) => `${i.value}` === `${over.id}`)
      if (oldIndex !== -1 && newIndex !== -1) {
        onSortEnd(arrayMove(items, oldIndex, newIndex))
      }
    },
    [items, onSortEnd],
  )

  const handleDragEndGrouped = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event

      if (!over || active.id === over.id) {
        // No move — commit intermediate drag tree if one exists.
        if (dragTree) onTreeSort?.(dragTree)
        setDragTree(null)
        return
      }

      if (!displayRows) {
        setDragTree(null)
        return
      }

      const activeRow = displayRows.find(
        (r) => r.kind === 'option' && `${r.option.value}` === `${active.id}`,
      )
      const overRow = displayRows.find(
        (r) => r.kind === 'option' && `${r.option.value}` === `${over.id}`,
      )

      if (
        !activeRow ||
        activeRow.kind !== 'option' ||
        !overRow ||
        overRow.kind !== 'option'
      ) {
        setDragTree(null)
        return
      }

      const activeGroup = activeRow.groupValue
      const overGroup = overRow.groupValue
      const baseTree = dragTree ?? options

      if (activeGroup === overGroup) {
        // Same-group reorder (applies on top of any earlier cross-group move).
        const groupChildren = displayRows
          .filter(
            (r): r is DisplayRow & { kind: 'option' } =>
              r.kind === 'option' && r.groupValue === activeGroup,
          )
          .map((r) => r.option)

        const oldIdx = groupChildren.findIndex(
          (i) => `${i.value}` === `${active.id}`,
        )
        const newIdx = groupChildren.findIndex(
          (i) => `${i.value}` === `${over.id}`,
        )

        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          const reordered = arrayMove(groupChildren, oldIdx, newIdx)
          if (dragTree) {
            // Cross-group move happened earlier — commit full tree.
            const finalTree = baseTree.map((opt) => {
              if (opt.value === activeGroup && opt.children) {
                return { ...opt, children: reordered }
              }
              return opt
            })
            onTreeSort?.(finalTree)
          } else {
            // Pure within-group reorder.
            onGroupSortEnd?.(activeGroup!, reordered)
          }
        } else if (dragTree) {
          // Cross-group happened but no final reorder within group.
          onTreeSort?.(baseTree)
        }
      } else {
        // Fallback: active and over still in different groups at drop time.
        const finalTree = baseTree.map((opt) => {
          if (!opt.children) return opt
          if (opt.value === activeGroup) {
            return {
              ...opt,
              children: opt.children.filter(
                (c) => `${c.value}` !== `${active.id}`,
              ),
            }
          }
          if (opt.value === overGroup) {
            const destChildren = [...opt.children]
            const overIdx = destChildren.findIndex(
              (c) => `${c.value}` === `${over.id}`,
            )
            destChildren.splice(
              overIdx !== -1 ? overIdx + 1 : destChildren.length,
              0,
              activeRow.option,
            )
            return { ...opt, children: destChildren }
          }
          return opt
        })
        onTreeSort?.(finalTree)
      }

      setDragTree(null)
    },
    [dragTree, options, displayRows, onTreeSort, onGroupSortEnd],
  )

  // ---- Render the scrollable virtualised content ----
  const listContent = (
    <div
      ref={parentRef}
      className={cn(
        'max-h-75 overflow-x-hidden',
        activeIndex !== null ? 'overflow-y-visible' : 'overflow-y-auto',
      )}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualizer.getVirtualItems().map((vItem) => {
          const displayRow = virtualItems[vItem.index]

          // ----- Group header row -----
          if (displayRow.kind === 'group-header') {
            return (
              <div
                key={`gh-${displayRow.groupValue}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vItem.start}px)`,
                }}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
              >
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {displayRow.label}
                </div>
              </div>
            )
          }

          // ----- Leaf option row -----
          const option = displayRow.option

          const row = (
            <OptionRow
              key={option.value}
              option={option}
              selected={selectedSet.has(option.value)}
              renderItem={renderItem}
              onSelect={onSelect}
            />
          )

          const wrappedRow = sortable ? (
            <SortableItem
              key={option.value}
              id={`${option.value}`}
              disabled={option.disabled}
            >
              {row}
            </SortableItem>
          ) : (
            row
          )

          return (
            <div
              key={option.value}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vItem.start}px)`,
              }}
              data-index={vItem.index}
              ref={virtualizer.measureElement}
            >
              {wrappedRow}
            </div>
          )
        })}
      </div>
    </div>
  )

  if (sortable) {
    const handleDragStart = (event: { active: { id: string | number } }) => {
      setActiveId(`${event.active.id}`)
    }
    const handleCancel = () => {
      setActiveId(null)
      setDragTree(null)
    }

    return (
      <DndContext
        modifiers={DND_MODIFIERS}
        sensors={sensors}
        collisionDetection={
          grouped && !sortableAcrossGroups ? sameGroupCollision : closestCenter
        }
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={grouped ? handleDragEndGrouped : handleDragEndFlat}
        onDragCancel={handleCancel}
      >
        <SortableContext items={flatSortableIds} strategy={sortingStrategy}>
          {listContent}
        </SortableContext>
      </DndContext>
    )
  }

  return listContent
}

// ===========================================================================
// Main component
// ===========================================================================

export function LayoutSelect(props: LayoutSelectProps) {
  const {
    type,
    options,
    placeholder = 'Select item',
    disabled = false,
    readOnly = false,
    error = false,
    clearable = false,
    className,
    triggerClassName,
    popupClassName,
    renderTrigger,
    renderItem,
    listPrefix,
    listSuffix,
    queryFn,
    label,
  } = props

  // Extract type-specific props once to avoid including `props` in deps.
  const selectValue =
    type === 'single'
      ? (props as SingleSelectProps).selectValue
      : (props as MultipleSelectProps).selectValue
  const collapsed =
    type === 'multiple' ? (props as MultipleSelectProps).collapsed : undefined
  const showItemsLength =
    type === 'multiple'
      ? (props as MultipleSelectProps).showItemsLength
      : undefined

  const sortable = props.sortable ?? false
  const sortableAcrossGroups = props.sortable
    ? ((props as SortableEnabledProps).sortableAcrossGroups ?? false)
    : false
  const consumerOnSortEnd = props.sortable
    ? (props as SortableEnabledProps).onSortEnd
    : undefined

  // ---- State ----
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [asyncOptions, setAsyncOptions] = useState<Array<IOption> | null>(null)
  const [loading, setLoading] = useState(false)
  const [internalSortedOptions, setInternalSortedOptions] =
    useState<Array<IOption> | null>(null)

  // `useDeferredValue` keeps the search input responsive while the
  // (potentially expensive) list filtering is deferred to a lower priority.
  const deferredSearch = useDeferredValue(search)

  // ---- Resolve current value ----
  const currentValue = useMemo(() => {
    if (type === 'single') return selectValue ?? null
    return selectValue ?? []
  }, [type, selectValue])

  // ---- Refs for stable callbacks (advanced-event-handler-refs pattern) ----
  // By reading mutable values from refs, callbacks that are passed deep into
  // the tree (VirtualList → OptionRow) maintain a *stable identity* even
  // when the selected value or onChange handler changes.  This is critical
  // for React.memo on OptionRow to be effective.

  const currentValueRef = useRef(currentValue)
  currentValueRef.current = currentValue

  const onChangeRef = useRef<
    SingleSelectProps['onChange'] | MultipleSelectProps['onChange'] | undefined
  >(undefined)
  onChangeRef.current =
    type === 'single'
      ? (props as SingleSelectProps).onChange
      : (props as MultipleSelectProps).onChange

  // ---- Resolve display options ----
  const resolvedOptions = useMemo(() => {
    const base = asyncOptions ?? options
    return internalSortedOptions ?? base
  }, [asyncOptions, options, internalSortedOptions])

  const flatOptions = useMemo(
    () => flattenOptions(resolvedOptions),
    [resolvedOptions],
  )

  const flatOptionsRef = useRef(flatOptions)
  flatOptionsRef.current = flatOptions

  // ---- Filtered options (search) ----
  // Uses `deferredSearch` so the input stays responsive for large lists.
  const filteredOptions = useMemo(() => {
    if (!deferredSearch) return flatOptions
    const q = deferredSearch.toLowerCase()
    return flatOptions.filter((o) => o.label.toLowerCase().includes(q))
  }, [flatOptions, deferredSearch])

  /** Resolved options filtered by search, preserving group structure. */
  const filteredGroupedOptions = useMemo(() => {
    if (!deferredSearch) return resolvedOptions
    const q = deferredSearch.toLowerCase()
    return resolvedOptions
      .map((opt) => {
        if (opt.children && opt.children.length > 0) {
          const matched = opt.children.filter((c) =>
            c.label.toLowerCase().includes(q),
          )
          if (matched.length === 0) return null
          return { ...opt, children: matched }
        }
        return opt.label.toLowerCase().includes(q) ? opt : null
      })
      .filter(Boolean) as Array<IOption>
  }, [resolvedOptions, deferredSearch])

  // ---- Async loading ----
  useEffect(() => {
    if (open && queryFn) {
      let cancelled = false
      setLoading(true)
      queryFn()
        .then((data) => {
          if (!cancelled) setAsyncOptions(data)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => {
        cancelled = true
      }
    }
  }, [open, queryFn])

  // Reset search when closed.
  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  // ---- Selection handler (STABLE – uses refs) ----
  const handleSelect = useCallback(
    (option: IOption) => {
      if (readOnly) return

      if (type === 'single') {
        const onChange = onChangeRef.current as
          | SingleSelectProps['onChange']
          | undefined
        const current = currentValueRef.current as IOption | null
        if (clearable && current && optionEq(current, option)) {
          onChange?.(null, option)
        } else {
          onChange?.(option, option)
        }
        setOpen(false)
      } else {
        const onChange = onChangeRef.current as
          | MultipleSelectProps['onChange']
          | undefined
        const current = currentValueRef.current as Array<IOption>
        const exists = current.some((v) => optionEq(v, option))
        if (exists) {
          onChange?.(
            current.filter((v) => !optionEq(v, option)),
            option,
          )
        } else {
          onChange?.([...current, option], option)
        }
      }
    },
    [type, clearable, readOnly],
  )

  // ---- Remove chip (STABLE – uses refs) ----
  const handleRemoveChip = useCallback(
    (option: IOption) => {
      if (type !== 'multiple' || readOnly || disabled) return
      const onChange = onChangeRef.current as
        | MultipleSelectProps['onChange']
        | undefined
      const current = currentValueRef.current as Array<IOption>
      onChange?.(
        current.filter((v) => !optionEq(v, option)),
        option,
      )
    },
    [type, readOnly, disabled],
  )

  // ---- Select all / unselect all (multiple only, STABLE – uses refs) ----
  const handleToggleAll = useCallback(() => {
    if (type !== 'multiple' || readOnly || disabled) return
    const onChange = onChangeRef.current as
      | MultipleSelectProps['onChange']
      | undefined
    const current = currentValueRef.current as Array<IOption>
    const selectable = flatOptionsRef.current.filter((o) => !o.disabled)
    if (selectable.length === 0) return

    // Use Set for O(1) membership checks instead of nested .some() loops.
    const currentSet = new Set(current.map((v) => v.value))
    const allSelected = selectable.every((o) => currentSet.has(o.value))

    if (allSelected) {
      const selectableSet = new Set(selectable.map((o) => o.value))
      const kept = current.filter((v) => !selectableSet.has(v.value))
      onChange?.(kept, selectable[0])
    } else {
      const missing = selectable.filter((o) => !currentSet.has(o.value))
      onChange?.([...current, ...missing], selectable[0])
    }
  }, [type, readOnly, disabled])

  const allSelected = useMemo(() => {
    if (type !== 'multiple') return false
    const current = currentValue as Array<IOption>
    if (current.length === 0) return false
    const selectable = flatOptions.filter((o) => !o.disabled)
    if (selectable.length === 0) return false
    // Set-based O(n+m) check instead of O(n*m).
    const currentSet = new Set(current.map((v) => v.value))
    return selectable.every((o) => currentSet.has(o.value))
  }, [type, currentValue, flatOptions])

  // ---- Sort handlers ----
  const handleSortEnd = useCallback(
    (sorted: Array<IOption>) => {
      setInternalSortedOptions(sorted)
      consumerOnSortEnd?.(sorted)
    },
    [consumerOnSortEnd],
  )

  const handleGroupSortEnd = useCallback(
    (groupValue: string | number, reorderedChildren: Array<IOption>) => {
      const updated = resolvedOptions.map((opt) => {
        if (opt.value === groupValue && opt.children) {
          return { ...opt, children: reorderedChildren }
        }
        return opt
      })
      setInternalSortedOptions(updated)
      consumerOnSortEnd?.(flattenOptions(updated))
    },
    [resolvedOptions, consumerOnSortEnd],
  )

  const handleTreeSort = useCallback(
    (newTree: Array<IOption>) => {
      setInternalSortedOptions(newTree)
      consumerOnSortEnd?.(flattenOptions(newTree))
    },
    [consumerOnSortEnd],
  )

  // ---- Open handler ----
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (disabled || readOnly) return
      setOpen(nextOpen)
    },
    [disabled, readOnly],
  )

  // ---- Trigger content ----
  const triggerContent = useMemo(() => {
    if (renderTrigger) {
      return renderTrigger({
        value: currentValue,
        open,
        disabled,
        readOnly,
        error,
        placeholder,
      })
    }

    if (type === 'single') {
      return (
        <SingleTriggerContent
          value={currentValue as IOption | null}
          placeholder={placeholder}
        />
      )
    }

    return (
      <MultipleTriggerContent
        value={currentValue as Array<IOption>}
        placeholder={placeholder}
        collapsed={collapsed}
        showItemsLength={showItemsLength}
        onRemove={handleRemoveChip}
        readOnly={readOnly}
        disabled={disabled}
      />
    )
  }, [
    renderTrigger,
    type,
    currentValue,
    open,
    disabled,
    readOnly,
    error,
    placeholder,
    collapsed,
    showItemsLength,
    handleRemoveChip,
  ])

  return (
    <Tooltip.Provider>
      <div className={cn('relative inline-flex flex-col', className)}>
        {label && (
          <label className="mb-1 text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <Popover.Root open={open} onOpenChange={handleOpenChange}>
          <Popover.Trigger
            disabled={disabled}
            render={
              <button
                type="button"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-invalid={error || undefined}
                data-readonly={readOnly || undefined}
                className={cn(
                  'border-input flex min-h-9 w-full min-w-45 items-center gap-2 rounded-md border bg-transparent px-3 py-1.5 text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none',
                  'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                  'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
                  'data-readonly:pointer-events-none data-readonly:opacity-70',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  "[&_svg:not([class*='text-'])]:text-muted-foreground",
                  triggerClassName,
                )}
              />
            }
          >
            <div className="flex min-w-0 flex-1 items-center">
              {triggerContent}
            </div>
            <ChevronDown className="size-4 shrink-0 opacity-50" />
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Positioner sideOffset={4}>
              <Popover.Popup
                className={cn(
                  'z-50 min-w-(--anchor-width) rounded-md border bg-popover text-popover-foreground shadow-md outline-none',
                  'data-starting-style:scale-95 data-starting-style:opacity-0',
                  'data-ending-style:scale-95 data-ending-style:opacity-0',
                  'origin-(--transform-origin) transition-[transform,scale,opacity] duration-150',
                  popupClassName,
                )}
              >
                <Command shouldFilter={false} loop>
                  {/* Search input */}
                  <div className="border-b p-1">
                    <Command.Input
                      value={search}
                      onValueChange={setSearch}
                      placeholder="Search..."
                      className="h-8 w-full rounded-sm bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>

                  {/* List prefix */}
                  {listPrefix && (
                    <div className="border-b px-2 py-1.5">{listPrefix}</div>
                  )}

                  {/* Select all / Unselect all */}
                  {type === 'multiple' && !readOnly && (
                    <div className="border-b px-1 py-1">
                      <button
                        type="button"
                        onClick={handleToggleAll}
                        className="w-full rounded-sm px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        {allSelected ? 'Unselect all' : 'Select all'}
                      </button>
                    </div>
                  )}

                  <Command.List className="p-1">
                    {loading && (
                      <Command.Loading>
                        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                          Loading…
                        </div>
                      </Command.Loading>
                    )}

                    {!loading && filteredOptions.length === 0 && (
                      <Command.Empty className="py-4 text-center text-sm text-muted-foreground">
                        No results found.
                      </Command.Empty>
                    )}

                    {!loading && filteredOptions.length > 0 && (
                      <VirtualList
                        options={filteredGroupedOptions}
                        items={filteredOptions}
                        selectedValue={currentValue}
                        renderItem={renderItem}
                        onSelect={handleSelect}
                        sortable={sortable}
                        sortableAcrossGroups={sortableAcrossGroups}
                        onSortEnd={handleSortEnd}
                        onGroupSortEnd={handleGroupSortEnd}
                        onTreeSort={handleTreeSort}
                      />
                    )}
                  </Command.List>

                  {/* List suffix */}
                  {listSuffix && (
                    <div className="border-t px-2 py-1.5">{listSuffix}</div>
                  )}
                </Command>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </Tooltip.Provider>
  )
}

export default LayoutSelect
