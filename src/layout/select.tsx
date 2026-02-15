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
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, GripVertical, X } from 'lucide-react'

import type { Range } from '@tanstack/react-virtual'
import type { DragEndEvent } from '@dnd-kit/core'

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
  /** Enable drag‑and‑drop reordering of options in the list. */
  sortable?: boolean
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

export type LayoutSelectProps = SharedSelectProps &
  (SingleSelectProps | MultipleSelectProps)

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

/** Flatten a potentially nested option tree into a flat list (depth‑first). */
function flattenOptions(options: Array<IOption>): Array<IOption> {
  const result: Array<IOption> = []
  for (const opt of options) {
    result.push(opt)
    if (opt.children) {
      result.push(...flattenOptions(opt.children))
    }
  }
  return result
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
}

function Chip({ option, onRemove, readOnly, disabled }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-35 items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs leading-5 text-secondary-foreground',
        disabled && 'opacity-50',
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
  const [visibleCount, setVisibleCount] = useState(value.length)
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
      // Reserve space for overflow badge ~40px
      const reservedSpace = 40
      let count = 0

      for (const child of children) {
        // skip hidden overflow badge placeholder
        if (child.dataset.overflowBadge) continue
        const childRight = child.getBoundingClientRect().right
        if (childRight + reservedSpace <= containerRight) {
          count++
        } else {
          break
        }
      }
      // Show at least 1 chip when there are items
      setVisibleCount(Math.max(1, count))
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

  // Determine maximum chips to show
  let maxVisible = collapsed ? value.length : visibleCount
  if (!collapsed && showItemsLength !== undefined) {
    maxVisible = Math.min(maxVisible, showItemsLength)
  }

  const visible = value.slice(0, maxVisible)
  const overflow = value.slice(maxVisible)

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex min-w-0 flex-1 items-center gap-1',
        collapsed ? 'flex-wrap' : 'overflow-hidden',
      )}
    >
      {visible.map((opt) => (
        <Chip
          key={opt.value}
          option={opt}
          onRemove={onRemove ? () => onRemove(opt) : undefined}
          readOnly={readOnly}
          disabled={disabled}
        />
      ))}
      {overflow.length > 0 && (
        <span data-overflow-badge>
          <OverflowBadge items={overflow} onRemove={onRemove} />
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
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
  items: Array<IOption>
  selectedValue: IOption | Array<IOption> | null
  renderItem?: LayoutSelectProps['renderItem']
  onSelect: (option: IOption) => void
  sortable?: boolean
  onSortEnd?: (items: Array<IOption>) => void
}

function VirtualList({
  items,
  selectedValue,
  renderItem,
  onSelect,
  sortable,
  onSortEnd,
}: VirtualListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

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
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 8,
    rangeExtractor,
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveIndex(null)
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

  const sortableIds = useMemo(() => items.map((i) => `${i.value}`), [items])

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
          const option = items[vItem.index]

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
    return (
      <DndContext
        modifiers={[restrictToVerticalAxis]}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(event) => {
          const idx = items.findIndex(
            (i) => `${i.value}` === `${event.active.id}`,
          )
          setActiveIndex(idx !== -1 ? idx : null)
        }}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveIndex(null)}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
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
    sortable = false,
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
  // cmdk handles filtering internally via its `shouldFilter` + `filter` but
  // we still need the flat list for virtualisation.  We let cmdk filter by
  // default (shouldFilter=true) when there is a search term.
  const filteredOptions = useMemo(() => {
    if (!search) return flatOptions
    const q = search.toLowerCase()
    return flatOptions.filter((o) => o.label.toLowerCase().includes(q))
  }, [flatOptions, search])

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

  // ---- Sort handler ----
  const handleSortEnd = useCallback((sorted: Array<IOption>) => {
    setInternalSortedOptions(sorted)
  }, [])

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
                        items={filteredOptions}
                        selectedValue={currentValue}
                        renderItem={renderItem}
                        onSelect={handleSelect}
                        sortable={sortable}
                        onSortEnd={handleSortEnd}
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
