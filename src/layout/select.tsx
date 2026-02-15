import * as React from 'react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve an `IconProp` to a ReactNode – cheap for already‑rendered nodes,
 *  and defers the call for function icons. */
function resolveIcon(icon: IconProp | undefined): React.ReactNode {
  if (icon === undefined || icon === null) return null
  if (typeof icon === 'function') return (icon as () => React.ReactNode)()
  return icon
}

/** Flatten a potentially nested option tree into a flat list (depth‑first).
 *  Group parents (options with `children`) are **excluded** – only leaves. */
function flattenOptions(options: Array<IOption>): Array<IOption> {
  const result: Array<IOption> = []
  for (const opt of options) {
    if (opt.children && opt.children.length > 0) {
      result.push(...flattenOptions(opt.children))
    } else {
      result.push(opt)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Display row types for virtualised list (group headers + leaf options)
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
function optionEq(a: IOption, b: IOption) {
  return a.value === b.value
}

function isSelected(option: IOption, value: IOption | Array<IOption> | null) {
  if (!value) return false
  if (Array.isArray(value)) return value.some((v) => optionEq(v, option))
  return optionEq(value, option)
}

// ---------------------------------------------------------------------------
// Sortable item wrapper (for dnd‑kit inside virtual list)
// ---------------------------------------------------------------------------

interface SortableItemProps {
  id: string
  children: React.ReactNode
  disabled?: boolean
}

function SortableItem({ id, children, disabled }: SortableItemProps) {
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
}

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
// Chip (for multiple‑select trigger)
// ---------------------------------------------------------------------------

interface ChipProps {
  option: IOption
  onRemove?: () => void
  readOnly?: boolean
  disabled?: boolean
  className?: string
  /** Mark as the "partial" chip that may be squeezed to truncate. */
  partial?: boolean
}

function Chip({
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
            onRemove()
          }}
          tabIndex={-1}
          aria-label={`Remove ${option.label}`}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Overflow chip badge
// ---------------------------------------------------------------------------

function OverflowBadge({
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
}

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
  const containerRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLSpanElement>(null)
  const [visibleCount, setVisibleCount] = useState(value.length)
  const [measured, setMeasured] = useState(false)
  const prevValueRef = useRef(value)
  const needsMeasureRef = useRef(true)

  useLayoutEffect(() => {
    if (collapsed || !containerRef.current || value.length === 0) {
      setVisibleCount(value.length)
      return
    }

    // When value changes, reset to show ALL chips so the next run can
    // measure the real DOM.  The early return prevents measuring stale DOM.
    const valueChanged = prevValueRef.current !== value
    prevValueRef.current = value

    if (valueChanged) {
      needsMeasureRef.current = true
      setVisibleCount(value.length)
      return // triggers sync re-render → effect re-runs with all chips visible
    }

    const calculate = () => {
      const container = containerRef.current
      if (!container) return

      const children = Array.from(container.children) as Array<HTMLElement>
      const containerRight = container.getBoundingClientRect().right
      // When the badge is already rendered it takes space from the outer
      // flex, so the container is already narrower — no extra reservation.
      // On the first measurement the badge hasn't mounted yet, so we
      // reserve ~40 px for it.
      const reservedSpace = badgeRef.current?.offsetWidth ? 0 : 40
      let count = 0

      for (const child of children) {
        // Skip the partial (squeezed) chip — only count full-size chips
        if (child.dataset.partialChip !== undefined) continue
        const childRight = child.getBoundingClientRect().right
        if (childRight + reservedSpace <= containerRight) {
          count++
        } else {
          break
        }
      }
      // Show at least 1 chip when there are items
      setVisibleCount(Math.max(1, count))
      setMeasured(true)
    }

    const observer = new ResizeObserver(calculate)
    observer.observe(containerRef.current)

    // Only calculate immediately after a reset or on initial mount
    if (needsMeasureRef.current) {
      needsMeasureRef.current = false
      calculate()
    }

    return () => {
      observer.disconnect()
    }
  }, [collapsed, value, visibleCount])

  if (value.length === 0) {
    return <span className="truncate text-muted-foreground">{placeholder}</span>
  }

  // Determine maximum fully-visible chips
  let maxVisible = collapsed ? value.length : visibleCount
  const hasExplicitLimit = !collapsed && showItemsLength !== undefined
  if (hasExplicitLimit) {
    // showItemsLength is authoritative – always show that many chips even
    // if they don't all fit at full size (they'll shrink to fit).
    maxVisible = showItemsLength
  }

  const hasOverflow = maxVisible < value.length
  // Show one extra "partial" chip that truncates when overflow is detected
  // by container measurement. Skip the partial chip when showItemsLength is
  // explicitly set — the user wants an exact count, not a truncated extra.
  const displayCount =
    hasOverflow && !hasExplicitLimit
      ? Math.min(maxVisible + 1, value.length)
      : maxVisible

  const displayed = value.slice(0, displayCount)
  const overflowItems = value.slice(displayCount)

  // Hide until first measurement to avoid flash of all chips overflowing.
  // We keep the real container in the DOM (for layout measurement) but
  // visually show a placeholder until `calculate()` has run.
  const showContent = collapsed || measured

  if (!showContent) {
    // Render the real chips invisibly for measurement, overlaid with a
    // short placeholder so the trigger doesn't flash a tall chip list.
    return (
      <div className="relative flex min-w-0 flex-1 items-center gap-1">
        {/* Invisible measurement layer */}
        <div
          ref={containerRef}
          className="pointer-events-none absolute inset-0 flex items-center gap-1 overflow-hidden opacity-0"
        >
          {value.map((opt) => (
            <Chip
              key={opt.value}
              option={opt}
              readOnly={readOnly}
              disabled={disabled}
              className="shrink-0"
            />
          ))}
        </div>
        {/* Visible placeholder */}
        <span className="truncate text-muted-foreground">
          {value.length} selected
        </span>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <div
        ref={containerRef}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1',
          collapsed ? 'flex-wrap' : 'overflow-hidden',
        )}
      >
        {displayed.map((opt, i) => {
          const isPartial =
            hasOverflow && !hasExplicitLimit && i === displayed.length - 1
          // When the user provides an explicit showItemsLength, all chips
          // should be shrinkable so they share the available space evenly.
          const shouldShrink = isPartial || hasExplicitLimit
          return (
            <Chip
              key={opt.value}
              option={opt}
              onRemove={onRemove ? () => onRemove(opt) : undefined}
              readOnly={readOnly}
              disabled={disabled}
              partial={isPartial}
              className={shouldShrink ? 'min-w-0 shrink' : 'shrink-0'}
            />
          )
        })}
      </div>
      {overflowItems.length > 0 && (
        <span ref={badgeRef} className="shrink-0">
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

function OptionRow({
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
}

// ---------------------------------------------------------------------------
// Virtual + Sortable list
// ---------------------------------------------------------------------------

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
  /** Called when items within a group are reordered (grouped mode). Receives
   *  the group parent value and the new ordered children. */
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

  // The flat list used by the virtualizer – either from display rows or the
  // legacy flat items.
  const flatDisplayRows = useMemo(
    () => items.map<DisplayRow>((o) => ({ kind: 'option', option: o })),
    [items],
  )
  const virtualItems = displayRows ?? flatDisplayRows

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

  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) =>
      virtualItems[index].kind === 'group-header' ? 28 : 36,
    overscan: 8,
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

  // Custom collision detection: restrict collisions to same-group items
  // when sortableAcrossGroups is disabled.
  const sameGroupCollision: CollisionDetection = useCallback(
    (args) => {
      if (!displayRows) return closestCenter(args)
      const draggedId = args.active.id
      const activeRow = displayRows.find(
        (r) => r.kind === 'option' && `${r.option.value}` === `${draggedId}`,
      )
      if (!activeRow || activeRow.kind !== 'option') return closestCenter(args)
      const activeGroup = activeRow.groupValue
      const filtered = args.droppableContainers.filter((container) => {
        const row = displayRows.find(
          (r) =>
            r.kind === 'option' && `${r.option.value}` === `${container.id}`,
        )
        return row && row.kind === 'option' && row.groupValue === activeGroup
      })
      return closestCenter({ ...args, droppableContainers: filtered })
    },
    [displayRows],
  )

  // Custom sorting strategy for grouped options.
  // Only displace items that are in the same group as the active (dragged)
  // item. Cross-group items are never displaced — group headers are at
  // fixed virtualizer positions and can't participate in dnd-kit transforms,
  // so shifting items across groups would cause overlaps.
  const sortingStrategy = useMemo(() => {
    if (!grouped || !displayRows) return verticalListSortingStrategy
    const idToGroup = new Map<string, string | number | undefined>()
    for (const row of displayRows) {
      if (row.kind === 'option') {
        idToGroup.set(`${row.option.value}`, row.groupValue)
      }
    }
    const noMove = { x: 0, y: 0, scaleX: 1, scaleY: 1 }
    return (
      args: Parameters<typeof verticalListSortingStrategy>[0],
    ): ReturnType<typeof verticalListSortingStrategy> => {
      const draggedId = flatSortableIds[args.activeIndex]
      const currentId = flatSortableIds[args.index]
      if (
        draggedId &&
        currentId &&
        idToGroup.get(draggedId) !== idToGroup.get(currentId)
      ) {
        return noMove
      }
      return verticalListSortingStrategy(args)
    }
  }, [grouped, displayRows, flatSortableIds])

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

      // Same group — let dnd-kit's sorting strategy handle displacement
      if (activeRow.groupValue === overRow.groupValue) return

      // Cross-group: move item from source group to destination group
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
          // Remove first in case of duplicate, then insert at over position
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
        // No move — revert intermediate drag tree
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
        // Same-group reorder (applies on top of any earlier cross-group move)
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
            // Cross-group move happened earlier — commit full tree
            const finalTree = baseTree.map((opt) => {
              if (opt.value === activeGroup && opt.children) {
                return { ...opt, children: reordered }
              }
              return opt
            })
            onTreeSort?.(finalTree)
          } else {
            // Pure within-group reorder
            onGroupSortEnd?.(activeGroup!, reordered)
          }
        } else if (dragTree) {
          // Cross-group happened but no final reorder within group
          onTreeSort?.(baseTree)
        }
      } else {
        // Fallback: active and over still in different groups at drop time
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
              selected={isSelected(option, selectedValue)}
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

    // Single SortableContext wrapping everything.
    // Custom sortingStrategy handles per-group displacement.
    return (
      <DndContext
        modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [asyncOptions, setAsyncOptions] = useState<Array<IOption> | null>(null)
  const [loading, setLoading] = useState(false)
  const [internalSortedOptions, setInternalSortedOptions] =
    useState<Array<IOption> | null>(null)

  // ---- Resolve current value ----
  const currentValue = useMemo(() => {
    if (type === 'single') {
      return (props as SingleSelectProps).selectValue ?? null
    }
    return (props as MultipleSelectProps).selectValue ?? []
  }, [type, props])

  // ---- Resolve display options ----
  const resolvedOptions = useMemo(() => {
    const base = asyncOptions ?? options
    return internalSortedOptions ?? base
  }, [asyncOptions, options, internalSortedOptions])

  const flatOptions = useMemo(
    () => flattenOptions(resolvedOptions),
    [resolvedOptions],
  )

  // ---- Filtered options (search) ----
  // For virtualisation we need a flat list of leaf options, and when options
  // are grouped we also keep a filtered version of the grouped tree so that
  // VirtualList can render group headers correctly.
  const filteredOptions = useMemo(() => {
    if (!search) return flatOptions
    const q = search.toLowerCase()
    return flatOptions.filter((o) => o.label.toLowerCase().includes(q))
  }, [flatOptions, search])

  /** Resolved options filtered by search, preserving group structure. */
  const filteredGroupedOptions = useMemo(() => {
    if (!search) return resolvedOptions
    const q = search.toLowerCase()
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
  }, [resolvedOptions, search])

  // ---- Async loading ----
  useEffect(() => {
    if (open && queryFn) {
      let cancelled = false
      setLoading(true)
      queryFn()
        .then((data) => {
          if (!cancelled) {
            setAsyncOptions(data)
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => {
        cancelled = true
      }
    }
  }, [open, queryFn])

  // Reset search when closed
  useEffect(() => {
    if (!open) {
      setSearch('')
    }
  }, [open])

  // ---- Selection handler ----
  const handleSelect = useCallback(
    (option: IOption) => {
      if (readOnly) return

      if (type === 'single') {
        const onChange = (props as SingleSelectProps).onChange
        const current = currentValue as IOption | null
        if (clearable && current && optionEq(current, option)) {
          onChange?.(null, option)
        } else {
          onChange?.(option, option)
        }
        setOpen(false)
      } else {
        const onChange = (props as MultipleSelectProps).onChange
        const current = currentValue as Array<IOption>
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
    [type, currentValue, clearable, readOnly, props],
  )

  // ---- Remove chip (multiple) ----
  const handleRemoveChip = useCallback(
    (option: IOption) => {
      if (type !== 'multiple' || readOnly || disabled) return
      const onChange = (props as MultipleSelectProps).onChange
      const current = currentValue as Array<IOption>
      onChange?.(
        current.filter((v) => !optionEq(v, option)),
        option,
      )
    },
    [type, currentValue, readOnly, disabled, props],
  )

  // ---- Select all / unselect all (multiple only) ----
  const handleToggleAll = useCallback(() => {
    if (type !== 'multiple' || readOnly || disabled) return
    const onChange = (props as MultipleSelectProps).onChange
    const current = currentValue as Array<IOption>
    const selectableOptions = flatOptions.filter((o) => !o.disabled)
    const allSelected =
      selectableOptions.length > 0 &&
      selectableOptions.every((o) => current.some((v) => optionEq(v, o)))

    if (allSelected) {
      // Keep only disabled options that were somehow selected
      const kept = current.filter((v) =>
        selectableOptions.every((o) => !optionEq(o, v)),
      )
      onChange?.(kept, selectableOptions[0])
    } else {
      // Merge: keep existing + add missing selectable options
      const missing = selectableOptions.filter(
        (o) => !current.some((v) => optionEq(v, o)),
      )
      onChange?.([...current, ...missing], selectableOptions[0])
    }
  }, [type, currentValue, flatOptions, readOnly, disabled, props])

  const allSelected = useMemo(() => {
    if (type !== 'multiple') return false
    const current = currentValue as Array<IOption>
    const selectableOptions = flatOptions.filter((o) => !o.disabled)
    return (
      selectableOptions.length > 0 &&
      selectableOptions.every((o) => current.some((v) => optionEq(v, o)))
    )
  }, [type, currentValue, flatOptions])

  const sortable = props.sortable ?? false
  const sortableAcrossGroups = props.sortable
    ? ((props as SortableEnabledProps).sortableAcrossGroups ?? false)
    : false
  const consumerOnSortEnd = props.sortable
    ? (props as SortableEnabledProps).onSortEnd
    : undefined

  // ---- Sort handler (flat) ----
  const handleSortEnd = useCallback(
    (sorted: Array<IOption>) => {
      setInternalSortedOptions(sorted)
      consumerOnSortEnd?.(sorted)
    },
    [consumerOnSortEnd],
  )

  // ---- Sort handler (within a group) ----
  const handleGroupSortEnd = useCallback(
    (groupValue: string | number, reorderedChildren: Array<IOption>) => {
      // Rebuild the full options tree with the updated group
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

  // ---- Sort handler (cross-group tree rebuild) ----
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
        collapsed={(props as MultipleSelectProps).collapsed}
        showItemsLength={(props as MultipleSelectProps).showItemsLength}
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
    props,
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
