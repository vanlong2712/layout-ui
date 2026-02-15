import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { FileText, Globe, Mail, MapPin, Phone, User } from 'lucide-react'

import type { IOption } from '@/layout/select'
import { LayoutSelect } from '@/layout/select'

export const Route = createFileRoute('/demo/layout-select')({
  component: LayoutSelectDemo,
})

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

/** Lazy icon — the function is only called when the row is rendered. */
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
    <div className="space-y-3 rounded-lg border border-border bg-card p-6">
      <div>
        <h3 className="text-lg font-semibold text-card-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap gap-4">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Demo page
// ---------------------------------------------------------------------------

function LayoutSelectDemo() {
  // ---- Simple single ----
  const [single1, setSingle1] = useState<IOption | null>(null)
  const [single2, setSingle2] = useState<IOption | null>(OPTIONS_WITH_ICONS[1])

  // ---- Simple multiple ----
  const [multi1, setMulti1] = useState<Array<IOption>>([])
  const [multi2, setMulti2] = useState<Array<IOption>>(
    MANY_SELECTED.slice(0, 4),
  )

  // ---- States ----
  const [errorSingle, setErrorSingle] = useState<IOption | null>(null)

  // ---- Complex ----
  const [nested, setNested] = useState<IOption | null>(null)
  const [large, setLarge] = useState<IOption | null>(null)
  const [sortableVal, setSortableVal] = useState<Array<IOption>>(
    SIMPLE_OPTIONS.slice(0, 3),
  )
  const [asyncVal, setAsyncVal] = useState<IOption | null>(null)
  const [clearableSingle, setClearableSingle] = useState<IOption | null>(
    SIMPLE_OPTIONS[0],
  )
  const [customRendered, setCustomRendered] = useState<IOption | null>(null)
  const [collapsedMulti, setCollapsedMulti] =
    useState<Array<IOption>>(MANY_SELECTED)
  const [showItemsMulti, setShowItemsMulti] =
    useState<Array<IOption>>(MANY_SELECTED)

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">
          LayoutSelect Demo
        </h1>
        <p className="text-muted-foreground">
          Comprehensive test cases for the LayoutSelect component
        </p>
      </div>

      {/* ================================================================
          SIMPLE TEST CASES
          ================================================================ */}

      <h2 className="text-xl font-semibold text-foreground">
        Simple Test Cases
      </h2>

      <Section
        title="1. Single Select — Empty"
        description="Basic single selection with no initial value."
      >
        <LayoutSelect
          type="single"
          options={SIMPLE_OPTIONS}
          selectValue={single1}
          onChange={(val) => setSingle1(val)}
          label="Fruit"
        />
        <pre className="self-center text-xs text-muted-foreground">
          selected: {single1 ? single1.label : 'none'}
        </pre>
      </Section>

      <Section
        title="2. Single Select — Preselected with Icons"
        description="Single selection with an initial value and icons on each option."
      >
        <LayoutSelect
          type="single"
          options={OPTIONS_WITH_ICONS}
          selectValue={single2}
          onChange={(val) => setSingle2(val)}
          label="Contact"
          placeholder="Pick a contact"
        />
        <pre className="self-center text-xs text-muted-foreground">
          selected: {single2 ? single2.label : 'none'}
        </pre>
      </Section>

      <Section
        title="3. Multiple Select — Empty"
        description="Multi-select starting with nothing selected."
      >
        <LayoutSelect
          type="multiple"
          options={OPTIONS_WITH_ICONS}
          selectValue={multi1}
          onChange={(val) => setMulti1(val)}
          label="Team members"
          placeholder="Select members"
          className="w-80"
        />
        <pre className="self-center text-xs text-muted-foreground">
          selected: {multi1.length}
        </pre>
      </Section>

      <Section
        title="4. Multiple Select — Preselected (Overflow)"
        description="Four chips preselected in a constrained width → automatic +N overflow badge."
      >
        <LayoutSelect
          type="multiple"
          options={MANY_SELECTED}
          selectValue={multi2}
          onChange={(val) => setMulti2(val)}
          label="Assignees"
          className="w-72"
        />
      </Section>

      {/* ================================================================
          STATE TEST CASES
          ================================================================ */}

      <h2 className="text-xl font-semibold text-foreground">
        State Test Cases
      </h2>

      <Section
        title="5. Disabled State"
        description="The select is fully disabled and cannot be opened."
      >
        <LayoutSelect
          type="single"
          options={SIMPLE_OPTIONS}
          selectValue={SIMPLE_OPTIONS[2]}
          disabled
          label="Disabled"
        />
      </Section>

      <Section
        title="6. Read-Only State"
        description="Looks like a normal select but cannot be interacted with."
      >
        <LayoutSelect
          type="single"
          options={SIMPLE_OPTIONS}
          selectValue={SIMPLE_OPTIONS[1]}
          readOnly
          label="Read only"
        />
      </Section>

      <Section
        title="7. Error State"
        description="The select is marked with a validation error."
      >
        <LayoutSelect
          type="single"
          options={SIMPLE_OPTIONS}
          selectValue={errorSingle}
          onChange={(val) => setErrorSingle(val)}
          error
          label="Required field"
          placeholder="Select a fruit"
        />
      </Section>

      <Section
        title="8. Disabled Options with Tooltips"
        description="Some options are disabled and show a tooltip explaining why."
      >
        <LayoutSelect
          type="single"
          options={OPTIONS_WITH_DISABLED}
          selectValue={null}
          onChange={() => {}}
          label="Plan options"
        />
      </Section>

      {/* ================================================================
          COMPLEX TEST CASES
          ================================================================ */}

      <h2 className="text-xl font-semibold text-foreground">
        Complex Test Cases
      </h2>

      <Section
        title="9. Nested Options"
        description="Options with children — flattened in the dropdown list."
      >
        <LayoutSelect
          type="single"
          options={NESTED_OPTIONS}
          selectValue={nested}
          onChange={(val) => setNested(val)}
          label="Category"
        />
        <pre className="self-center text-xs text-muted-foreground">
          selected: {nested ? nested.label : 'none'}
        </pre>
      </Section>

      <Section
        title="10. Large Virtualized List (5 000 items)"
        description="5 000 items with lazy icon functions — opens instantly thanks to virtualisation."
      >
        <LayoutSelect
          type="single"
          options={LARGE_OPTIONS}
          selectValue={large}
          onChange={(val) => setLarge(val)}
          label="Large dataset"
          sortable
          onSortEnd={(sorted) => console.log('sorted', sorted)}
        />
        <pre className="self-center text-xs text-muted-foreground">
          selected: {large ? large.label : 'none'}
        </pre>
      </Section>

      <Section
        title="11. Sortable Multi-Select"
        description="Drag & drop reordering of options inside the popup list."
      >
        <LayoutSelect
          type="multiple"
          options={SIMPLE_OPTIONS}
          selectValue={sortableVal}
          onChange={(val) => setSortableVal(val)}
          sortable
          onSortEnd={(sorted) => console.log('sorted', sorted)}
          label="Reorderable"
          className="w-72"
        />
      </Section>

      <Section
        title="12. Async / Lazy-loaded Options (queryFn)"
        description="Options are fetched when the popup opens (simulated 1s delay)."
      >
        <LayoutSelect
          type="single"
          options={[]}
          selectValue={asyncVal}
          onChange={(val) => setAsyncVal(val)}
          queryFn={async () => {
            await new Promise((r) => setTimeout(r, 1000))
            return [
              { label: 'Fetched A', value: 'fa' },
              { label: 'Fetched B', value: 'fb' },
              { label: 'Fetched C', value: 'fc' },
              { label: 'Fetched D', value: 'fd' },
            ]
          }}
          label="Async options"
        />
        <pre className="self-center text-xs text-muted-foreground">
          selected: {asyncVal ? asyncVal.label : 'none'}
        </pre>
      </Section>

      <Section
        title="13. Clearable Single Select"
        description="Click the already-selected option again to deselect it."
      >
        <LayoutSelect
          type="single"
          options={SIMPLE_OPTIONS}
          selectValue={clearableSingle}
          onChange={(val) => setClearableSingle(val)}
          clearable
          label="Clearable"
        />
        <pre className="self-center text-xs text-muted-foreground">
          selected: {clearableSingle ? clearableSingle.label : 'none'}
        </pre>
      </Section>

      <Section
        title="14. Custom Item Renderer"
        description="Each option row is replaced with a custom renderer showing a colored dot."
      >
        <LayoutSelect
          type="single"
          options={SIMPLE_OPTIONS}
          selectValue={customRendered}
          onChange={(val) => setCustomRendered(val)}
          label="Custom renderer"
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
      </Section>

      <Section
        title="15. Multiple with collapsed=true"
        description="All chips are visible regardless of overflow (collapsed bypasses overflow detection)."
      >
        <LayoutSelect
          type="multiple"
          options={MANY_SELECTED}
          selectValue={collapsedMulti}
          onChange={(val) => setCollapsedMulti(val)}
          collapsed
          label="Collapsed (show all)"
          className="w-72"
        />
      </Section>

      <Section
        title="16. Multiple with showItemsLength=2"
        description="At most 2 chips are shown, remaining displayed as +N badge."
      >
        <LayoutSelect
          type="multiple"
          options={MANY_SELECTED}
          selectValue={showItemsMulti}
          onChange={(val) => setShowItemsMulti(val)}
          showItemsLength={2}
          label="Max 2 visible"
          className="w-80"
        />
      </Section>

      <Section
        title="17. List Prefix & Suffix"
        description="Custom components rendered before and after the option list."
      >
        <LayoutSelect
          type="single"
          options={SIMPLE_OPTIONS}
          selectValue={null}
          onChange={() => {}}
          label="With chrome"
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
      </Section>

      <Section
        title="18. Custom Trigger Renderer"
        description="The entire trigger is replaced with a custom UI."
      >
        <LayoutSelect
          type="single"
          options={SIMPLE_OPTIONS}
          selectValue={single1}
          onChange={(val) => setSingle1(val)}
          label="Custom trigger"
          renderTrigger={({ value, open }) => (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {(value as IOption | null)?.label ?? '— pick one —'}
              </span>
              <span
                className={`text-xs transition-transform ${open ? 'rotate-180' : ''}`}
              >
                ▼
              </span>
            </div>
          )}
        />
      </Section>
    </div>
  )
}
