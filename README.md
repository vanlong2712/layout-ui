# @longd/layout-ui

A React component library featuring a powerful, feature-rich select component with virtualization, drag-and-drop sorting, grouped options, and intelligent chip overflow management. Built with **Tailwind CSS v4**.

## Features

- **Single & multiple selection** with chip-based display
- **Virtualized list** via `@tanstack/react-virtual` — handles 10,000+ options smoothly
- **Drag-and-drop sorting** (flat & grouped) via `@dnd-kit`
- **Grouped options** with visual headers
- **Intelligent chip overflow** — auto-detects available space, shows partial (truncated) chips, and collapses into a `+N` overflow badge with tooltip
- **Async option loading** via `queryFn`
- **Search / filter** built-in
- **Keyboard accessible** — full keyboard navigation
- **Fully typed** — comprehensive TypeScript definitions
- **Tailwind CSS v4** — themeable via CSS custom properties (shadcn/ui compatible)

## Demo

- **Full demo site**: https://layout-ui-seven.vercel.app
- **LayoutSelect component**: https://layout-ui-seven.vercel.app/demo/layout-select

---

## Installation

```bash
npm install @longd/layout-ui
```

### Peer dependencies

The library requires **React 18+** (installed as peer dependency):

```bash
npm install react react-dom
```

---

## Prerequisites

### 1. Tailwind CSS v4

This library uses Tailwind CSS utility classes. Your project must have **Tailwind CSS v4** set up.

Tell Tailwind to scan the library's dist files so it generates the necessary utility classes. Add a `@source` directive in your main CSS file:

```css
@import 'tailwindcss';
@source "../node_modules/@longd/layout-ui/dist";
```

### 2. Theme CSS variables

The components use semantic color tokens (e.g. `bg-secondary`, `text-muted-foreground`, `border-border`) that map to CSS custom properties. You need these variables defined in your CSS. If you use [shadcn/ui](https://ui.shadcn.com), they are already set up.

If not, add the following minimal theme to your global CSS (adjust colors to your design):

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.141 0.005 285.823);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.141 0.005 285.823);
  --primary: oklch(0.21 0.006 285.885);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.967 0.001 286.375);
  --muted-foreground: oklch(0.552 0.016 285.938);
  --accent: oklch(0.967 0.001 286.375);
  --accent-foreground: oklch(0.21 0.006 285.885);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.92 0.004 286.32);
  --input: oklch(0.92 0.004 286.32);
  --ring: oklch(0.871 0.006 286.286);
  --radius: 0.625rem;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
```

### 3. `cn` utility

The library bundles its own `cn` helper (`clsx` + `tailwind-merge`) internally. You do **not** need to provide one.

---

## Quick start

```tsx
import { useState } from 'react'
import { LayoutSelect } from '@longd/layout-ui'
import type { IOption } from '@longd/layout-ui'

const options: IOption[] = [
  { label: 'Apple', value: 'apple' },
  { label: 'Banana', value: 'banana' },
  { label: 'Cherry', value: 'cherry' },
]

function App() {
  const [value, setValue] = useState<IOption | null>(null)

  return (
    <LayoutSelect
      type="single"
      options={options}
      selectValue={value}
      onChange={(val) => setValue(val)}
      placeholder="Pick a fruit"
    />
  )
}
```

### Deep import (tree-shaking)

```tsx
import { LayoutSelect } from '@longd/layout-ui/layout/select'
import type { IOption } from '@longd/layout-ui/layout/select'
```

---

## API reference

### `<LayoutSelect>`

| Prop               | Type                              | Default         | Description                                                                 |
| ------------------ | --------------------------------- | --------------- | --------------------------------------------------------------------------- |
| `type`             | `'single' \| 'multiple'`          | —               | **Required.** Selection mode.                                               |
| `options`          | `IOption[]`                       | —               | **Required.** Available options (may contain nested `children` for groups). |
| `selectValue`      | `IOption \| IOption[] \| null`    | —               | Controlled value. `IOption` for single, `IOption[]` for multiple.           |
| `onChange`         | `(value, selectedOption) => void` | —               | Called when selection changes.                                              |
| `placeholder`      | `string`                          | `'Select item'` | Placeholder text when nothing is selected.                                  |
| `disabled`         | `boolean`                         | `false`         | Disable the entire select.                                                  |
| `readOnly`         | `boolean`                         | `false`         | Read-only mode — looks interactive but prevents changes.                    |
| `error`            | `boolean`                         | `false`         | Marks the select as having a validation error.                              |
| `clearable`        | `boolean`                         | `false`         | Allow clearing the selection (single mode).                                 |
| `label`            | `string`                          | —               | Label rendered above the select.                                            |
| `className`        | `string`                          | —               | Custom class for the root wrapper.                                          |
| `triggerClassName` | `string`                          | —               | Custom class for the trigger button.                                        |
| `popupClassName`   | `string`                          | —               | Custom class for the dropdown popup.                                        |

#### Multiple-mode props

| Prop              | Type      | Default | Description                                                                                                                   |
| ----------------- | --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `collapsed`       | `boolean` | `false` | When `true`, the trigger expands to show all chips (wraps to multiple rows) instead of collapsing overflow into a `+N` badge. |
| `showItemsLength` | `number`  | —       | Force a maximum number of visible chips.                                                                                      |

#### Sortable props

| Prop                   | Type                                 | Default | Description                                                      |
| ---------------------- | ------------------------------------ | ------- | ---------------------------------------------------------------- |
| `sortable`             | `boolean`                            | `false` | Enable drag-and-drop reordering of options in the dropdown list. |
| `onSortEnd`            | `(sortedOptions: IOption[]) => void` | —       | Called after reordering. Required when `sortable` is `true`.     |
| `sortableAcrossGroups` | `boolean`                            | `false` | Allow dragging items across groups.                              |

#### Render overrides

| Prop            | Type                           | Description                              |
| --------------- | ------------------------------ | ---------------------------------------- |
| `renderTrigger` | `(props) => ReactNode`         | Replace the entire trigger UI.           |
| `renderItem`    | `(option, state) => ReactNode` | Replace the default option row renderer. |
| `listPrefix`    | `ReactNode`                    | Content rendered before the option list. |
| `listSuffix`    | `ReactNode`                    | Content rendered after the option list.  |

#### Async loading

| Prop      | Type                       | Description                                                                   |
| --------- | -------------------------- | ----------------------------------------------------------------------------- |
| `queryFn` | `() => Promise<IOption[]>` | Called when popup opens. Returned options replace the current `options` prop. |

### `IOption`

```ts
interface IOption {
  label: string
  value: string | number
  icon?: IconProp // ReactNode or () => ReactNode
  disabled?: boolean
  disabledTooltip?: string
  children?: IOption[] // Nested children — rendered as a visual group
}
```

### `IconProp`

```ts
type IconProp = React.ReactNode | (() => React.ReactNode)
```

The render-function form `() => ReactNode` lets you pass lazy/memoised icons so the component only mounts them when visible (better perf for large lists with heavy SVG icons).

---

## Examples

### Multiple select

```tsx
const [selected, setSelected] = useState<IOption[]>([])

<LayoutSelect
  type="multiple"
  options={options}
  selectValue={selected}
  onChange={(val) => setSelected(val)}
  placeholder="Select items"
/>
```

### Grouped options

```tsx
const groupedOptions: IOption[] = [
  {
    label: 'Fruits',
    value: 'fruits',
    children: [
      { label: 'Apple', value: 'apple' },
      { label: 'Banana', value: 'banana' },
    ],
  },
  {
    label: 'Vegetables',
    value: 'vegetables',
    children: [
      { label: 'Carrot', value: 'carrot' },
      { label: 'Broccoli', value: 'broccoli' },
    ],
  },
]

<LayoutSelect
  type="single"
  options={groupedOptions}
  selectValue={value}
  onChange={(val) => setValue(val)}
/>
```

### With icons

```tsx
import { Apple, Cherry } from 'lucide-react'

const options: IOption[] = [
  { label: 'Apple', value: 'apple', icon: <Apple /> },
  { label: 'Cherry', value: 'cherry', icon: () => <Cherry /> }, // lazy icon
]
```

### Sortable list

```tsx
const [options, setOptions] = useState<IOption[]>(initialOptions)

<LayoutSelect
  type="multiple"
  options={options}
  selectValue={selected}
  onChange={setSelected}
  sortable
  onSortEnd={(sorted) => setOptions(sorted)}
/>
```

### Sortable across groups

```tsx
<LayoutSelect
  type="multiple"
  options={groupedOptions}
  selectValue={selected}
  onChange={setSelected}
  sortable
  sortableAcrossGroups
  onSortEnd={(sorted) => setGroupedOptions(sorted)}
/>
```

### Async options

```tsx
<LayoutSelect
  type="single"
  options={[]}
  selectValue={value}
  onChange={(val) => setValue(val)}
  queryFn={async () => {
    const res = await fetch('/api/options')
    return res.json()
  }}
/>
```

### Collapsed mode (show all chips)

```tsx
<LayoutSelect
  type="multiple"
  options={options}
  selectValue={selected}
  onChange={setSelected}
  collapsed
/>
```

---

## Adding new components

This library is structured for easy expansion. To add a new component:

1. **Create the component** in `src/<category>/<component>.tsx`

   ```
   src/
     layout/
       select.tsx        ← existing
       data-table.tsx    ← new component
     feedback/
       toast.tsx         ← new category + component
   ```

2. **Re-export from** `src/index.ts`

   ```ts
   // Layout
   export { LayoutSelect } from './layout/select'
   export type { LayoutSelectProps, IOption, IconProp } from './layout/select'

   // NEW: Layout — DataTable
   export { DataTable } from './layout/data-table'
   export type { DataTableProps } from './layout/data-table'
   ```

3. **Add a build entry** in `tsup.config.ts`

   ```ts
   entry: {
     index: 'src/index.ts',
     'layout/select': 'src/layout/select.tsx',
     'layout/data-table': 'src/layout/data-table.tsx',  // ← add
   },
   ```

4. **Add an exports entry** in `package.json`

   ```json
   "exports": {
     ".": { ... },
     "./layout/select": { ... },
     "./layout/data-table": {
       "import": {
         "types": "./dist/layout/data-table.d.ts",
         "default": "./dist/layout/data-table.js"
       },
       "require": {
         "types": "./dist/layout/data-table.d.cts",
         "default": "./dist/layout/data-table.cjs"
       }
     }
   }
   ```

5. **Update `tsconfig.build.json`** `include` if you added a new category folder:

   ```json
   "include": [
     "src/index.ts",
     "src/layout/**/*.ts",
     "src/layout/**/*.tsx",
     "src/feedback/**/*.ts",
     "src/feedback/**/*.tsx",
     "src/lib/**/*.ts"
   ]
   ```

6. **Build and verify**: `npm run build:lib`

---

## Development

The project includes a TanStack Start demo app for local development:

```bash
# Start the dev server (demo app)
npm run dev

# Build the library
npm run build:lib

# Build the demo app
npm run build
```

---

## Scripts

| Script              | Description                                      |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Start the TanStack Start dev server on port 3000 |
| `npm run build:lib` | Build the library to `dist/` (ESM + CJS + types) |
| `npm run build`     | Build the demo app                               |
| `npm run test`      | Run tests                                        |
| `npm run lint`      | Run ESLint                                       |
| `npm run check`     | Run Prettier + ESLint auto-fix                   |

---

## Publishing

```bash
# Build and publish
npm publish

# Or with a scoped name (update "name" in package.json first)
npm publish --access public
```

The `prepublishOnly` script automatically runs `build:lib` before publishing.

---

## License

MIT
