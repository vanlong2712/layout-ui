---
name: tanstack-virtual-v3
description: TanStack Virtual v3 reference for building performant virtualized lists, grids, sticky rows, and infinite scrolling in React using @tanstack/react-virtual. Use for tasks involving useVirtualizer/useWindowVirtualizer, dynamic measurement, overscan tuning, scroll performance, or React 19 flushSync settings.
---

# TanStack Virtual v3 – Quick Reference

> **Package**: `@tanstack/react-virtual` (React adapter for `@tanstack/virtual-core`)
>
> **Install**: `npm i @tanstack/react-virtual`
>
> **Version**: v3 (3.13.x)

---

## 1. Overview

TanStack Virtual is a **headless** UI utility for virtualizing long lists. It renders no markup — you supply your own DOM structure and styles. The core abstraction is the **Virtualizer**, which can be oriented vertically (default) or horizontally, and combined for grid layouts.

---

## 2. React Hooks

Import from `@tanstack/react-virtual`.

### 2.1 `useVirtualizer`

Virtualizes a list inside a scrollable HTML element.

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

const virtualizer = useVirtualizer({
  count: 10000,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 35,
})
```

### 2.2 `useWindowVirtualizer`

Uses the **window** as the scroll element (no `getScrollElement` needed).

```tsx
import { useWindowVirtualizer } from '@tanstack/react-virtual'

const virtualizer = useWindowVirtualizer({
  count: 10000,
  estimateSize: () => 35,
  scrollMargin: parentOffsetRef.current,
})
```

---

## 3. Virtualizer Options

### 3.1 Required

| Option             | Type                           | Description                                                                 |
| ------------------ | ------------------------------ | --------------------------------------------------------------------------- |
| `count`            | `number`                       | Total number of items to virtualize.                                        |
| `getScrollElement` | `() => TScrollElement \| null` | Returns the scrollable container element.                                   |
| `estimateSize`     | `(index: number) => number`    | Estimated size (px) per item. Overestimate for best smooth-scroll behavior. |

### 3.2 Common Optional

| Option                  | Type / Default           | Description                                                                |
| ----------------------- | ------------------------ | -------------------------------------------------------------------------- |
| `enabled`               | `boolean` / `true`       | Disable observers and reset state when `false`.                            |
| `overscan`              | `number` / `1`           | Extra items rendered above/below visible area. Higher = less blank items.  |
| `horizontal`            | `boolean` / `false`      | Horizontal orientation.                                                    |
| `gap`                   | `number` / `0`           | Spacing in px between items.                                               |
| `lanes`                 | `number` / `1`           | Number of columns (vertical) or rows (horizontal) — masonry layouts.       |
| `paddingStart`          | `number` / `0`           | Padding at the start of the list (px).                                     |
| `paddingEnd`            | `number` / `0`           | Padding at the end of the list (px).                                       |
| `scrollPaddingStart`    | `number` / `0`           | Padding when scrolling to an element (start).                              |
| `scrollPaddingEnd`      | `number` / `0`           | Padding when scrolling to an element (end).                                |
| `scrollMargin`          | `number` / `0`           | Offset origin of scroll (e.g. header height above a window virtualizer).   |
| `initialOffset`         | `number \| () => number` | Scroll position on first render (SSR-friendly).                            |
| `initialRect`           | `Rect`                   | Initial rect of scroll element (SSR).                                      |
| `isRtl`                 | `boolean` / `false`      | Right-to-left scrolling.                                                   |
| `isScrollingResetDelay` | `number` / `150`         | Delay (ms) after last scroll event before `isScrolling` resets to `false`. |
| `useScrollendEvent`     | `boolean` / `false`      | Use native `scrollend` event instead of debounce fallback.                 |
| `debug`                 | `boolean` / `false`      | Enable debug logs.                                                         |

### 3.3 Dynamic Measurement

| Option                                | Description                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `measureElement`                      | `(element, resizeEntry, instance) => number` — custom measurement function.              |
| `useAnimationFrameWithResizeObserver` | `boolean` (default `false`) — defer ResizeObserver callbacks to next rAF. Rarely needed. |

### 3.4 Callbacks & Customization

| Option           | Type                                  | Description                                                     |
| ---------------- | ------------------------------------- | --------------------------------------------------------------- |
| `getItemKey`     | `(index: number) => Key`              | Unique key per item. **Always override** for stable identities. |
| `rangeExtractor` | `(range: Range) => number[]`          | Custom indexes to render (sticky items, headers, etc.).         |
| `scrollToFn`     | `(offset, options, instance) => void` | Custom scroll implementation.                                   |
| `onChange`       | `(instance, sync: boolean) => void`   | Fires on internal state change. `sync=true` while scrolling.    |

### 3.5 React-Specific

| Option         | Type / Default     | Description                                                                               |
| -------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| `useFlushSync` | `boolean` / `true` | Use `flushSync` for synchronous rendering during scroll. Set `false` for React 19 compat. |

---

## 4. Virtualizer Instance

### 4.1 Properties

| Property          | Type                                | Description                          |
| ----------------- | ----------------------------------- | ------------------------------------ |
| `options`         | `VirtualizerOptions` (readonly)     | Current options.                     |
| `scrollElement`   | `TScrollElement \| null` (readonly) | Current scroll element.              |
| `scrollRect`      | `Rect`                              | Current scroll element rect.         |
| `isScrolling`     | `boolean`                           | Whether user is currently scrolling. |
| `scrollDirection` | `'forward' \| 'backward' \| null`   | Current scroll direction.            |
| `scrollOffset`    | `number`                            | Current scroll position in px.       |

### 4.2 Methods

| Method                          | Signature                                 | Description                                              |
| ------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| `getVirtualItems()`             | `() => VirtualItem[]`                     | Get currently visible + overscanned virtual items.       |
| `getVirtualIndexes()`           | `() => number[]`                          | Get visible row indexes only (no VirtualItem objects).   |
| `getTotalSize()`                | `() => number`                            | Total size (px) of all items. Updates as items measured. |
| `scrollToIndex(index, opts?)`   | `(index, { align?, behavior? }) => void`  | Scroll to item by index.                                 |
| `scrollToOffset(offset, opts?)` | `(offset, { align?, behavior? }) => void` | Scroll to pixel offset.                                  |
| `measure()`                     | `() => void`                              | Reset all item measurements (force re-measure).          |
| `measureElement(el)`            | `(el: TItemElement \| null) => void`      | Measure a specific element. Use as React `ref` callback. |
| `resizeItem(index, size)`       | `(index: number, size: number) => void`   | Manually set an item's size (e.g. morphing transitions). |

**`scrollToIndex` / `scrollToOffset` align options**: `'start' | 'center' | 'end' | 'auto'`

**`behavior` options**: `'auto' | 'smooth'`

> ⚠️ `smoothScroll` does not work with dynamically measured elements.

---

## 5. VirtualItem

Each item from `getVirtualItems()`:

```ts
interface VirtualItem {
  key: string | number | bigint // Unique key (from getItemKey or index)
  index: number // Item index in the full list
  start: number // Starting pixel offset
  end: number // Ending pixel offset
  size: number // Current size (estimated or measured)
  lane: number // Lane index (0 for regular lists)
}
```

---

## 6. Layout Patterns

### 6.1 Fixed-Size (simplest)

```tsx
const virtualizer = useVirtualizer({
  count: 10000,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 35, // exact fixed height
})

return (
  <div ref={parentRef} style={{ height: 400, overflow: 'auto' }}>
    <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {virtualizer.getVirtualItems().map((item) => (
        <div
          key={item.key}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: item.size,
            transform: `translateY(${item.start}px)`,
          }}
        >
          Row {item.index}
        </div>
      ))}
    </div>
  </div>
)
```

### 6.2 Dynamic Measurement

Add `data-index` and `ref={virtualizer.measureElement}` to each item:

```tsx
const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 45, // generous estimate
})

const virtualItems = virtualizer.getVirtualItems()

return (
  <div
    ref={parentRef}
    style={{ height: 400, overflow: 'auto', contain: 'strict' }}
  >
    <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
        }}
      >
        {virtualItems.map((vRow) => (
          <div
            key={vRow.key}
            data-index={vRow.index}
            ref={virtualizer.measureElement}
          >
            {items[vRow.index]}
          </div>
        ))}
      </div>
    </div>
  </div>
)
```

### 6.3 Window Virtualizer with `scrollMargin`

```tsx
const parentOffsetRef = useRef(0)
useLayoutEffect(() => {
  parentOffsetRef.current = parentRef.current?.offsetTop ?? 0
}, [])

const virtualizer = useWindowVirtualizer({
  count: items.length,
  estimateSize: () => 350,
  overscan: 5,
  scrollMargin: parentOffsetRef.current,
})

// In CSS transform, subtract scrollMargin:
// transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`
```

### 6.4 Sticky Items with Custom `rangeExtractor`

```tsx
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import type { Range } from '@tanstack/react-virtual'

const stickyIndexes = [0, 15, 30] // header indexes

const virtualizer = useVirtualizer({
  count: rows.length,
  estimateSize: () => 50,
  getScrollElement: () => parentRef.current,
  rangeExtractor: useCallback((range: Range) => {
    const activeSticky =
      [...stickyIndexes].reverse().find((i) => range.startIndex >= i) ?? 0

    const next = new Set([activeSticky, ...defaultRangeExtractor(range)])
    return [...next].sort((a, b) => a - b)
  }, []),
})

// Render sticky items with `position: sticky; top: 0; z-index: 1`
// Render normal items with `position: absolute; transform: translateY(...)`
```

### 6.5 Grid (two virtualizers)

```tsx
const rowVirtualizer = useVirtualizer({
  count: rowCount,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 35,
})

const colVirtualizer = useVirtualizer({
  horizontal: true,
  count: colCount,
  getScrollElement: () => parentRef.current,
  estimateSize: (i) => columnWidths[i],
})

// Render: iterate rowVirtualizer.getVirtualItems() × colVirtualizer.getVirtualItems()
```

### 6.6 Infinite Scroll

```tsx
const { fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(...)
const allRows = data?.pages.flatMap((p) => p.rows) ?? []

const virtualizer = useVirtualizer({
  count: hasNextPage ? allRows.length + 1 : allRows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 100,
  overscan: 5,
})

useEffect(() => {
  const lastItem = virtualizer.getVirtualItems().at(-1)
  if (!lastItem) return
  if (lastItem.index >= allRows.length - 1 && hasNextPage && !isFetchingNextPage) {
    fetchNextPage()
  }
}, [virtualizer.getVirtualItems(), hasNextPage, isFetchingNextPage, allRows.length])
```

---

## 7. Performance Tips

### 7.1 CSS `contain: strict`

Always apply to the scroll container for massive perf gains:

```css
.scroll-container {
  overflow: auto;
  contain: strict; /* isolate layout/paint */
  overflow-anchor: none; /* prevent browser scroll anchoring conflicts */
}
```

### 7.2 `getItemKey` — always provide stable keys

```tsx
useVirtualizer({
  count: items.length,
  getItemKey: useCallback((index: number) => items[index].id, [items]),
  // ...
})
```

### 7.3 Overscan tuning

- `overscan: 1` (default) — minimum rendering, may show blanks during fast scroll.
- `overscan: 5` — good balance for most apps.
- `overscan: 10+` — very smooth but more DOM nodes.

### 7.4 Avoid layout thrashing with mount scheduling

When virtualizing heavy components (e.g. rich-text editors), mount work can cascade:

1. Editor mounts → DOM rebuild → ResizeObserver fires
2. Virtualizer recalculates range → mounts more editors
3. Repeat → frame drops

**Solution**: Schedule mount work one-at-a-time per frame (e.g. via a `Queuer` from `@tanstack/react-pacer` with `wait: 16`).

### 7.5 `useFlushSync: false` for React 19

```tsx
const virtualizer = useVirtualizer({
  // ...
  useFlushSync: false, // eliminates React 19 flushSync warning
})
```

### 7.6 `estimateSize` — overestimate

> 🧠 Estimate the **largest possible size** of your items. This ensures smooth-scrolling works correctly.

---

## 8. Common Gotchas

| Gotcha                                   | Fix                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Items don't render                       | Ensure scroll container has a **fixed height/width** and `overflow: auto`.                   |
| Scroll jumps/flickers                    | Provide accurate `estimateSize` or use dynamic measurement. Add `overflow-anchor: none`.     |
| `resizeItem` + `measureElement` conflict | Use one OR the other per item index, never both.                                             |
| `smoothScroll` not working               | Smooth scroll is incompatible with dynamic measurement.                                      |
| Blank items during fast scroll           | Increase `overscan`.                                                                         |
| React 19 flushSync warning               | Set `useFlushSync: false`.                                                                   |
| Virtualizer not updating                 | Ensure `count` and `getScrollElement` are reactive (not stale closures).                     |
| Scroll position lost on count change     | Use `getItemKey` for stable identity; consider `shouldAdjustScrollPositionOnItemSizeChange`. |

---

## 9. Exports Summary

```ts
// React adapter
import {
  useVirtualizer,
  useWindowVirtualizer,
  defaultRangeExtractor,
} from '@tanstack/react-virtual'

// Types
import type { Range, VirtualItem, Virtualizer } from '@tanstack/react-virtual'

// Core (if needed directly)
import {
  elementScroll,
  windowScroll,
  observeElementRect,
  observeWindowRect,
  observeElementOffset,
  observeWindowOffset,
} from '@tanstack/virtual-core'
```

---

## 10. Key Differences from v2

| v2 (`react-virtual`)            | v3 (`@tanstack/react-virtual`)                |
| ------------------------------- | --------------------------------------------- |
| `useVirtual()` hook             | `useVirtualizer()` / `useWindowVirtualizer()` |
| Returns `{ virtualItems, ... }` | Returns `Virtualizer` instance                |
| `parentRef` option              | `getScrollElement` function                   |
| `size` option                   | `count` option                                |
| `estimateSize` required fn      | Same, but better caching                      |
| No `gap` support                | Built-in `gap` option                         |
| No `lanes`                      | Built-in `lanes` for masonry                  |
| No `measureElement`             | `measureElement` + `data-index` ref           |
