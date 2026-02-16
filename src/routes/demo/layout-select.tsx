import React, { useCallback, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { FileText, Globe, Mail, MapPin, Phone, User } from 'lucide-react'

import type { IOption } from '@/layout/select'
import { LayoutSelect } from '@/layout/select'
import { layoutDemos } from '@/data/layout-demos'

// Minimal markdown -> JSX renderer supporting headings, unordered lists, bold and inline code.
function renderMarkdown(md: string): React.ReactNode {
  if (!md) return null
  const lines = md.trim().split(/\r?\n/)
  const nodes: Array<React.ReactNode> = []

  const parseInline = (text: string) => {
    const parts: Array<React.ReactNode> = []
    let lastIndex = 0
    const re = /\*\*(.+?)\*\*|`([^`]+)`/g
    let m
    while ((m = re.exec(text)) !== null) {
      const idx = m.index
      if (idx > lastIndex) parts.push(text.slice(lastIndex, idx))
      if (m[1]) parts.push(<strong key={idx}>{m[1]}</strong>)
      else if (m[2])
        parts.push(
          <code key={idx} className="rounded bg-muted px-1">
            {m[2]}
          </code>,
        )
      lastIndex = idx + m[0].length
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex))
    return parts
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (line.startsWith('- ')) {
      // collect consecutive list items
      const items: Array<string> = []
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        items.push(lines[i].trim().slice(2))
        i++
      }
      nodes.push(
        <ul
          className="list-disc list-inside text-sm text-muted-foreground/80"
          key={nodes.length}
        >
          {items.map((it, idx) => (
            <li key={idx}>{parseInline(it)}</li>
          ))}
        </ul>,
      )
      continue
    }
    if (line.startsWith('#')) {
      const level = line.match(/^#+/)?.[0].length ?? 1
      const text = line.slice(level).trim()
      nodes.push(
        React.createElement(
          'h' + Math.min(3, level),
          { key: nodes.length, className: 'text-lg font-semibold' },
          text,
        ),
      )
      i++
      continue
    }
    if (line.length === 0) {
      nodes.push(<div key={nodes.length} />)
      i++
      continue
    }
    nodes.push(<p key={nodes.length}>{parseInline(line)}</p>)
    i++
  }
  return <>{nodes}</>
}

export const Route = createFileRoute('/demo/layout-select')({
  component: LayoutSelectDemo,
})

// ---------------------------------------------------------------------------
// TypeScript helper: conditional sortable props
// ---------------------------------------------------------------------------
// The discriminated union `SortableEnabledProps | SortableDisabledProps`
// loses narrowing when spread via `...(flag ? {...} : {})`. This helper casts
// to one branch or the other so the spread is accepted.

type SortableOn = {
  sortable: true
  onSortEnd: (s: Array<IOption>) => void
  sortableAcrossGroups?: boolean
}
type SortableOff = { sortable?: undefined; onSortEnd?: undefined }

function sortableIf(
  enabled: boolean,
  onSortEnd: (s: Array<IOption>) => void,
  sortableAcrossGroups?: boolean,
): SortableOn | SortableOff {
  return enabled ? { sortable: true, onSortEnd, sortableAcrossGroups } : {}
}

// ---------------------------------------------------------------------------
// Shared option data
// ---------------------------------------------------------------------------

const SIMPLE_OPTIONS: Array<IOption> = [
  { label: 'Apple', value: 'apple' },
  { label: 'Banana', value: 'banana' },
  { label: 'Cherry', value: 'cherry' },
  { label: 'Date', value: 'date' },
  { label: 'Elderberry', value: 'elderberry' },
]

const OPTIONS_WITH_ICONS: Array<IOption> = [
  { label: 'John Doe', value: 'john', icon: <User className="size-4" /> },
  { label: 'Jane Smith', value: 'jane', icon: <Mail className="size-4" /> },
  { label: 'Bob Wilson', value: 'bob', icon: <Phone className="size-4" /> },
  {
    label: 'Alice Brown',
    value: 'alice',
    icon: <Globe className="size-4" />,
  },
  {
    label: 'Charlie Davis',
    value: 'charlie',
    icon: <MapPin className="size-4" />,
  },
]

const OPTIONS_WITH_DISABLED: Array<IOption> = [
  { label: 'Available Option A', value: 'a' },
  {
    label: 'Disabled Option B',
    value: 'b',
    disabled: true,
    disabledTooltip: 'This option is not available in your plan',
  },
  { label: 'Available Option C', value: 'c' },
  {
    label: 'Disabled Option D',
    value: 'd',
    disabled: true,
    disabledTooltip: 'Requires admin access',
  },
  { label: 'Available Option E', value: 'e' },
]

const NESTED_OPTIONS: Array<IOption> = [
  {
    label: 'Fruits',
    value: 'fruits-group',
    children: [
      { label: 'Apple', value: 'apple-nested' },
      { label: 'Banana', value: 'banana-nested' },
      { label: 'Cherry', value: 'cherry-nested' },
    ],
  },
  {
    label: 'Vegetables',
    value: 'vegetables-group',
    children: [
      { label: 'Carrot', value: 'carrot' },
      { label: 'Broccoli', value: 'broccoli' },
      { label: 'Spinach', value: 'spinach' },
    ],
  },
  {
    label: 'Grains',
    value: 'grains-group',
    children: [
      { label: 'Rice', value: 'rice' },
      { label: 'Wheat', value: 'wheat' },
      { label: 'Oats', value: 'oats' },
    ],
  },
]

const lazyIconFactory = () => <FileText className="size-4" />

const LARGE_OPTIONS: Array<IOption> = Array.from({ length: 5000 }, (_, i) => ({
  label: `Item ${i + 1}`,
  value: i + 1,
  icon: lazyIconFactory,
}))

const MANY_SELECTED: Array<IOption> = [
  { label: 'Redan Frederic', value: 1, icon: <User className="size-4" /> },
  { label: 'Sophie Martin', value: 2, icon: <User className="size-4" /> },
  { label: 'Lucas Bernard', value: 3, icon: <User className="size-4" /> },
  { label: 'Emma Dubois', value: 4, icon: <User className="size-4" /> },
  { label: 'Louis Moreau', value: 5, icon: <User className="size-4" /> },
  { label: 'Chloe Laurent', value: 6, icon: <User className="size-4" /> },
]

// ---------------------------------------------------------------------------
// Toggle button
// ---------------------------------------------------------------------------

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
        checked
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-muted text-muted-foreground hover:bg-accent'
      }`}
    >
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Section helper
// ---------------------------------------------------------------------------

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div>
        <h3 className="text-lg font-semibold text-card-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Demo page
// ---------------------------------------------------------------------------

function LayoutSelectDemo() {
  // ---- 1. Basic ----
  const [basicSingle, setBasicSingle] = useState<IOption | null>(null)
  const [basicMulti, setBasicMulti] = useState<Array<IOption>>([])
  const [basicDisabled, setBasicDisabled] = useState(false)
  const [basicReadOnly, setBasicReadOnly] = useState(false)
  const [basicError, setBasicError] = useState(false)
  const [basicClearable, setBasicClearable] = useState(false)
  const [basicSortable, setBasicSortable] = useState(false)

  // ---- 2. With Icons ----
  const [iconsSingle, setIconsSingle] = useState<IOption | null>(
    OPTIONS_WITH_ICONS[1],
  )
  const [iconsMulti, setIconsMulti] = useState<Array<IOption>>(
    MANY_SELECTED.slice(0, 3),
  )
  const [iconsDisabled, setIconsDisabled] = useState(false)
  const [iconsSortable, setIconsSortable] = useState(false)
  const [iconsClearable, setIconsClearable] = useState(false)

  // ---- 3. Disabled Options ----
  const [disabledOptsSingle, setDisabledOptsSingle] = useState<IOption | null>(
    null,
  )
  const [disabledOptsMulti, setDisabledOptsMulti] = useState<Array<IOption>>([])
  const [disabledOptsSortable, setDisabledOptsSortable] = useState(false)

  // ---- 4. Nested ----
  const [nestedSingle, setNestedSingle] = useState<IOption | null>(null)
  const [nestedMulti, setNestedMulti] = useState<Array<IOption>>([])
  const [nestedSortable, setNestedSortable] = useState(false)
  const [nestedCrossGroup, setNestedCrossGroup] = useState(false)

  // ---- 5. Large List ----
  const [largeSingle, setLargeSingle] = useState<IOption | null>(null)
  const [largeMulti, setLargeMulti] = useState<Array<IOption>>([])
  const [largeSortable, setLargeSortable] = useState(false)

  // ---- 6. Overflow chips ----
  const [overflowMulti, setOverflowMulti] =
    useState<Array<IOption>>(MANY_SELECTED)
  const [overflowCollapsed, setOverflowCollapsed] = useState(false)
  const [overflowShowItems, setOverflowShowItems] = useState(false)

  // ---- 7. Async ----
  const [asyncSingle, setAsyncSingle] = useState<IOption | null>(null)
  const [asyncMulti, setAsyncMulti] = useState<Array<IOption>>([])

  // ---- 8. Custom Renderers ----
  const [customSingle, setCustomSingle] = useState<IOption | null>(null)
  const [customMulti, setCustomMulti] = useState<Array<IOption>>([])

  // ---- 9. List Prefix/Suffix ----
  const [chromeSingle, setChromeSingle] = useState<IOption | null>(null)
  const [chromeMulti, setChromeMulti] = useState<Array<IOption>>([])

  // ---- Sort handler factory ----
  const logSort = useCallback((sorted: Array<IOption>) => {
    console.log('onSortEnd', sorted)
  }, [])

  // ---- Async query factory ----
  const asyncQueryFn = useCallback(async () => {
    await new Promise((r) => setTimeout(r, 1000))
    return [
      { label: 'Fetched A', value: 'fa' },
      { label: 'Fetched B', value: 'fb' },
      { label: 'Fetched C', value: 'fc' },
      { label: 'Fetched D', value: 'fd' },
    ]
  }, [])

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <div>
        {/* Use layoutDemos data for heading/description */}
        {(() => {
          // Import at top: import { layoutDemos } from '../../data/layout-demos'
          const demo = layoutDemos.find((d) => d.to === '/demo/layout-select')
          return demo ? (
            <>
              <h1 className="text-3xl font-bold text-foreground">
                {demo.name}
              </h1>
              <p className="text-muted-foreground">{demo.description}</p>
              {demo.featuresMd ? (
                <div className="mt-3">{renderMarkdown(demo.featuresMd)}</div>
              ) : null}
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-foreground">
                Virtualized Select
              </h1>
            </>
          )
        })()}
      </div>

      {/* ================================================================
          1. Basic
          ================================================================ */}
      <Section
        title="1. Basic Select"
        description="Simple options with no icons. Toggle states to test different configurations."
      >
        <div className="mb-2 flex flex-wrap gap-2">
          <Toggle
            label="Disabled"
            checked={basicDisabled}
            onChange={setBasicDisabled}
          />
          <Toggle
            label="Read-only"
            checked={basicReadOnly}
            onChange={setBasicReadOnly}
          />
          <Toggle label="Error" checked={basicError} onChange={setBasicError} />
          <Toggle
            label="Clearable"
            checked={basicClearable}
            onChange={setBasicClearable}
          />
          <Toggle
            label="Sortable"
            checked={basicSortable}
            onChange={setBasicSortable}
          />
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="single"
              options={SIMPLE_OPTIONS}
              selectValue={basicSingle}
              onChange={(val) => setBasicSingle(val)}
              label="Single"
              placeholder="Pick a fruit"
              disabled={basicDisabled}
              readOnly={basicReadOnly}
              error={basicError}
              clearable={basicClearable}
              {...sortableIf(basicSortable, logSort)}
            />
            <pre className="text-xs text-muted-foreground">
              {basicSingle ? basicSingle.label : 'none'}
            </pre>
          </div>
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="multiple"
              options={SIMPLE_OPTIONS}
              selectValue={basicMulti}
              onChange={(val) => setBasicMulti(val)}
              label="Multiple"
              placeholder="Pick fruits"
              disabled={basicDisabled}
              readOnly={basicReadOnly}
              error={basicError}
              clearable={basicClearable}
              {...sortableIf(basicSortable, logSort)}
            />
            <pre className="text-xs text-muted-foreground">
              {basicMulti.length} selected
            </pre>
          </div>
        </div>
      </Section>

      {/* ================================================================
          2. With Icons
          ================================================================ */}
      <Section
        title="2. With Icons"
        description="Options with icons. Single starts preselected."
      >
        <div className="mb-2 flex flex-wrap gap-2">
          <Toggle
            label="Disabled"
            checked={iconsDisabled}
            onChange={setIconsDisabled}
          />
          <Toggle
            label="Clearable"
            checked={iconsClearable}
            onChange={setIconsClearable}
          />
          <Toggle
            label="Sortable"
            checked={iconsSortable}
            onChange={setIconsSortable}
          />
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="single"
              options={OPTIONS_WITH_ICONS}
              selectValue={iconsSingle}
              onChange={(val) => setIconsSingle(val)}
              label="Single"
              placeholder="Pick a contact"
              disabled={iconsDisabled}
              clearable={iconsClearable}
              {...sortableIf(iconsSortable, logSort)}
            />
            <pre className="text-xs text-muted-foreground">
              {iconsSingle ? iconsSingle.label : 'none'}
            </pre>
          </div>
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="multiple"
              options={OPTIONS_WITH_ICONS}
              selectValue={iconsMulti}
              onChange={(val) => setIconsMulti(val)}
              label="Multiple"
              placeholder="Select contacts"
              disabled={iconsDisabled}
              clearable={iconsClearable}
              {...sortableIf(iconsSortable, logSort)}
            />
            <pre className="text-xs text-muted-foreground">
              {iconsMulti.length} selected
            </pre>
          </div>
        </div>
      </Section>

      {/* ================================================================
          3. Disabled Options with Tooltips
          ================================================================ */}
      <Section
        title="3. Disabled Options with Tooltips"
        description="Some options are disabled. Hover disabled items to see tooltip."
      >
        <div className="mb-2 flex flex-wrap gap-2">
          <Toggle
            label="Sortable"
            checked={disabledOptsSortable}
            onChange={setDisabledOptsSortable}
          />
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="single"
              options={OPTIONS_WITH_DISABLED}
              selectValue={disabledOptsSingle}
              onChange={(val) => setDisabledOptsSingle(val)}
              label="Single"
              {...sortableIf(disabledOptsSortable, logSort)}
            />
            <pre className="text-xs text-muted-foreground">
              {disabledOptsSingle ? disabledOptsSingle.label : 'none'}
            </pre>
          </div>
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="multiple"
              options={OPTIONS_WITH_DISABLED}
              selectValue={disabledOptsMulti}
              onChange={(val) => setDisabledOptsMulti(val)}
              label="Multiple"
              {...sortableIf(disabledOptsSortable, logSort)}
            />
            <pre className="text-xs text-muted-foreground">
              {disabledOptsMulti.length} selected
            </pre>
          </div>
        </div>
      </Section>

      {/* ================================================================
          4. Nested Options
          ================================================================ */}
      <Section
        title="4. Nested Options"
        description="Options with children — flattened in the dropdown list."
      >
        <div className="mb-2 flex flex-wrap gap-2">
          <Toggle
            label="Sortable"
            checked={nestedSortable}
            onChange={setNestedSortable}
          />
          <Toggle
            label="Cross-group sort"
            checked={nestedCrossGroup}
            onChange={setNestedCrossGroup}
          />
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="single"
              options={NESTED_OPTIONS}
              selectValue={nestedSingle}
              onChange={(val) => setNestedSingle(val)}
              label="Single"
              {...sortableIf(nestedSortable, logSort, nestedCrossGroup)}
            />
            <pre className="text-xs text-muted-foreground">
              {nestedSingle ? nestedSingle.label : 'none'}
            </pre>
          </div>
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="multiple"
              options={NESTED_OPTIONS}
              selectValue={nestedMulti}
              onChange={(val) => setNestedMulti(val)}
              label="Multiple"
              {...sortableIf(nestedSortable, logSort, nestedCrossGroup)}
            />
            <pre className="text-xs text-muted-foreground">
              {nestedMulti.length} selected
            </pre>
          </div>
        </div>
      </Section>

      {/* ================================================================
          5. Large Virtualized List
          ================================================================ */}
      <Section
        title="5. Large Virtualized List (5 000 items)"
        description="5 000 items with lazy icon functions — opens instantly thanks to virtualisation."
      >
        <div className="mb-2 flex flex-wrap gap-2">
          <Toggle
            label="Sortable"
            checked={largeSortable}
            onChange={setLargeSortable}
          />
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="single"
              options={LARGE_OPTIONS}
              selectValue={largeSingle}
              onChange={(val) => setLargeSingle(val)}
              label="Single"
              {...sortableIf(largeSortable, logSort)}
            />
            <pre className="text-xs text-muted-foreground">
              {largeSingle ? largeSingle.label : 'none'}
            </pre>
          </div>
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="multiple"
              options={LARGE_OPTIONS}
              selectValue={largeMulti}
              onChange={(val) => setLargeMulti(val)}
              label="Multiple"
              {...sortableIf(largeSortable, logSort)}
            />
            <pre className="text-xs text-muted-foreground">
              {largeMulti.length} selected
            </pre>
          </div>
        </div>
      </Section>

      {/* ================================================================
          6. Overflow Chips (Multiple only)
          ================================================================ */}
      <Section
        title="6. Overflow Chips"
        description="Multiple select with many preselected items. Toggle collapsed / showItemsLength."
      >
        <div className="mb-2 flex flex-wrap gap-2">
          <Toggle
            label="Collapsed"
            checked={overflowCollapsed}
            onChange={(v) => {
              setOverflowCollapsed(v)
              if (v) setOverflowShowItems(false)
            }}
          />
          <Toggle
            label="showItemsLength=2"
            checked={overflowShowItems}
            onChange={(v) => {
              setOverflowShowItems(v)
              if (v) setOverflowCollapsed(false)
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="multiple"
              options={MANY_SELECTED}
              selectValue={overflowMulti}
              onChange={(val) => setOverflowMulti(val)}
              label="Multiple"
              collapsed={overflowCollapsed || undefined}
              showItemsLength={overflowShowItems ? 2 : undefined}
            />
            <pre className="text-xs text-muted-foreground">
              {overflowMulti.length} selected
            </pre>
          </div>
        </div>
      </Section>

      {/* ================================================================
          7. Async / Lazy-loaded Options
          ================================================================ */}
      <Section
        title="7. Async / Lazy-loaded Options (queryFn)"
        description="Options are fetched when the popup opens (simulated 1s delay)."
      >
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="single"
              options={[]}
              selectValue={asyncSingle}
              onChange={(val) => setAsyncSingle(val)}
              queryFn={asyncQueryFn}
              label="Single"
            />
            <pre className="text-xs text-muted-foreground">
              {asyncSingle ? asyncSingle.label : 'none'}
            </pre>
          </div>
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="multiple"
              options={[]}
              selectValue={asyncMulti}
              onChange={(val) => setAsyncMulti(val)}
              queryFn={asyncQueryFn}
              label="Multiple"
            />
            <pre className="text-xs text-muted-foreground">
              {asyncMulti.length} selected
            </pre>
          </div>
        </div>
      </Section>

      {/* ================================================================
          8. Custom Item Renderer
          ================================================================ */}
      <Section
        title="8. Custom Item Renderer"
        description="Each option row is replaced with a custom renderer showing a colored dot."
      >
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="single"
              options={SIMPLE_OPTIONS}
              selectValue={customSingle}
              onChange={(val) => setCustomSingle(val)}
              label="Single"
              renderItem={(option, state) => (
                <div className="flex w-full items-center gap-3">
                  <span
                    className="size-3 rounded-full"
                    style={{
                      backgroundColor: state.selected
                        ? 'var(--primary)'
                        : 'var(--muted)',
                    }}
                  />
                  <span
                    className={
                      state.disabled ? 'line-through opacity-50' : undefined
                    }
                  >
                    {option.label}
                  </span>
                  {state.selected && (
                    <span className="ml-auto text-xs text-primary">✓</span>
                  )}
                </div>
              )}
            />
            <pre className="text-xs text-muted-foreground">
              {customSingle ? customSingle.label : 'none'}
            </pre>
          </div>
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="multiple"
              options={SIMPLE_OPTIONS}
              selectValue={customMulti}
              onChange={(val) => setCustomMulti(val)}
              label="Multiple"
              renderItem={(option, state) => (
                <div className="flex w-full items-center gap-3">
                  <span
                    className="size-3 rounded-full"
                    style={{
                      backgroundColor: state.selected
                        ? 'var(--primary)'
                        : 'var(--muted)',
                    }}
                  />
                  <span
                    className={
                      state.disabled ? 'line-through opacity-50' : undefined
                    }
                  >
                    {option.label}
                  </span>
                  {state.selected && (
                    <span className="ml-auto text-xs text-primary">✓</span>
                  )}
                </div>
              )}
            />
            <pre className="text-xs text-muted-foreground">
              {customMulti.length} selected
            </pre>
          </div>
        </div>
      </Section>

      {/* ================================================================
          9. List Prefix & Suffix
          ================================================================ */}
      <Section
        title="9. List Prefix & Suffix"
        description="Custom components rendered before and after the option list."
      >
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="single"
              options={SIMPLE_OPTIONS}
              selectValue={chromeSingle}
              onChange={(val) => setChromeSingle(val)}
              label="Single"
              listPrefix={
                <div className="text-xs font-medium text-muted-foreground">
                  🔍 Tip: type to search
                </div>
              }
              listSuffix={
                <button
                  type="button"
                  className="w-full text-left text-xs text-primary hover:underline"
                >
                  + Add new option…
                </button>
              }
            />
          </div>
          <div className="space-y-1">
            <LayoutSelect
              className="w-full"
              type="multiple"
              options={SIMPLE_OPTIONS}
              selectValue={chromeMulti}
              onChange={(val) => setChromeMulti(val)}
              label="Multiple"
              listPrefix={
                <div className="text-xs font-medium text-muted-foreground">
                  🔍 Tip: type to search
                </div>
              }
              listSuffix={
                <button
                  type="button"
                  className="w-full text-left text-xs text-primary hover:underline"
                >
                  + Add new option…
                </button>
              }
            />
          </div>
        </div>
      </Section>
    </div>
  )
}
