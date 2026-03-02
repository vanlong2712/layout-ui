---
name: tanstack-pacer
description: TanStack Pacer quick reference for queueing, debouncing, throttling, rate-limiting, and batching in React with @tanstack/react-pacer. Use for tasks involving Queuer/Debouncer APIs, scheduler-style mount control, hook selectors, and smoothing expensive UI updates.
---

# TanStack Pacer – Quick Reference

> **Package**: `@tanstack/react-pacer` (re-exports core `@tanstack/pacer`)
>
> **Install**: `npm i @tanstack/react-pacer`
>
> **Status**: BETA (v0)

---

## 1. Queuer (synchronous queue)

### 1.1 Core Class – `Queuer<TValue>`

```ts
import { Queuer } from '@tanstack/react-pacer' // or '@tanstack/pacer'

const q = new Queuer<number>(
  (item) => console.log('process', item), // fn called for each item
  {
    // ── Processing ──
    started: true, // begin auto-processing immediately (default true)
    wait: 0, // ms delay between processing items (default 0)
    //   can also be (queuer) => number

    // ── Ordering ──
    addItemsTo: 'back', // 'front' | 'back' (default 'back')
    getItemsFrom: 'front', // 'front' | 'back' (default 'front')  → FIFO
    getPriority: undefined, // (item) => number  – higher = first

    // ── Limits / Expiry ──
    maxSize: Infinity,
    expirationDuration: Infinity, // ms; items older than this are removed
    getIsExpired: undefined, // (item, addedAt) => boolean

    // ── Callbacks ──
    onItemsChange: undefined, // (queuer) => void
    onExecute: undefined, // (item, queuer) => void
    onReject: undefined, // (item, queuer) => void  (when full)
    onExpire: undefined, // (item, queuer) => void

    // ── Initial data ──
    initialItems: [],
    initialState: undefined, // Partial<QueuerState<TValue>>

    // ── Devtools ──
    key: undefined, // string identifier
  },
)
```

### 1.2 Methods

| Method                     | Description                                         |
| -------------------------- | --------------------------------------------------- |
| `addItem(item, position?)` | Add to queue. Returns `boolean` (false if full).    |
| `start()`                  | Begin auto-processing.                              |
| `stop()`                   | Pause processing (keeps items).                     |
| `execute(position?)`       | Process next item immediately, returns the item.    |
| `getNextItem(position?)`   | Remove & return next item WITHOUT processing.       |
| `flush(count?)`            | Process `count` items synchronously (default: all). |
| `clear()`                  | Remove all pending items.                           |
| `reset()`                  | Reset to default state.                             |
| `peekNextItem()`           | View next item without removing.                    |
| `peekAllItems()`           | View copy of all items.                             |
| `setOptions(partial)`      | Merge new options.                                  |

### 1.3 State (reactive via TanStack Store)

Access: `queuer.store.state.*`

```ts
interface QueuerState<TValue> {
  size: number
  isEmpty: boolean
  isFull: boolean
  isIdle: boolean // isRunning && isEmpty
  isRunning: boolean
  status: 'idle' | 'running' | 'stopped'
  items: Array<TValue>
  itemTimestamps: number[]
  executionCount: number
  expirationCount: number
  rejectionCount: number
  addItemCount: number
  pendingTick: boolean
}
```

### 1.4 `queue()` helper

Simple wrapper that creates an always-started Queuer and returns `addItem`:

```ts
import { queue } from '@tanstack/react-pacer'

const addItem = queue<number>((n) => console.log(n), { wait: 1000 })
addItem(1) // logs 1 immediately
addItem(2) // logs 2 after 1s
```

---

## 2. Debouncer (synchronous)

### 2.1 Core Class – `Debouncer<TFn>`

```ts
import { Debouncer } from '@tanstack/react-pacer'

const d = new Debouncer(
  (query: string) => performSearch(query), // fn
  {
    wait: 500, // ms delay (required). Can be number | (debouncer) => number
    leading: false, // execute on leading edge (default false)
    trailing: true, // execute on trailing edge (default true)
    enabled: true, // boolean | (debouncer) => boolean
    onExecute: undefined, // (args, debouncer) => void
    initialState: undefined,
    key: undefined,
  },
)
```

### 2.2 Methods

| Method                  | Description                       |
| ----------------------- | --------------------------------- |
| `maybeExecute(...args)` | Trigger (resets timer each call). |
| `cancel()`              | Cancel pending execution.         |
| `flush()`               | Execute pending immediately.      |
| `reset()`               | Reset state to defaults.          |
| `setOptions(partial)`   | Merge new options.                |

### 2.3 State

Access: `debouncer.store.state.*`

```ts
interface DebouncerState<TFn> {
  canLeadingExecute: boolean
  executionCount: number
  isPending: boolean
  lastArgs: Parameters<TFn> | undefined
  maybeExecuteCount: number
  status: 'disabled' | 'idle' | 'pending'
}
```

### 2.4 `debounce()` helper

```ts
import { debounce } from '@tanstack/react-pacer'

const debouncedFn = debounce(fn, { wait: 1000 })
debouncedFn('arg') // returns void, fires fn after 1s of inactivity
```

---

## 3. React Hooks

All hooks re-export everything from core. Import from `@tanstack/react-pacer`.

### 3.1 `useQueuer(fn, options, selector?)`

```tsx
import { useQueuer } from '@tanstack/react-pacer'

const queuer = useQueuer(
  (item: number) => processItem(item),
  {
    started: true,
    wait: 1000,
    maxSize: 25,
    // ... all QueuerOptions
    onUnmount: (q) => q.stop(), // default: stop. alt: (q) => q.flush()
  },
  // Optional selector – only selected state triggers re-renders
  // (state) => ({ size: state.size, isRunning: state.isRunning })
)

// queuer.addItem(value)
// queuer.start() / queuer.stop() / queuer.flush() / queuer.clear()
// queuer.state  → {} by default. Populated only when selector provided.
// <queuer.Subscribe selector={(s) => s}>{(state) => ...}</queuer.Subscribe>
```

### 3.2 `useDebouncer(fn, options, selector?)`

```tsx
import { useDebouncer } from '@tanstack/react-pacer'

const debouncer = useDebouncer(
  (query: string) => fetchResults(query),
  {
    wait: 500,
    // ... all DebouncerOptions
    onUnmount: (d) => d.cancel(), // default: cancel
  },
  // (state) => ({ isPending: state.isPending })
)

// debouncer.maybeExecute('value')
// debouncer.cancel() / debouncer.flush()
// debouncer.state.isPending  (only if selector provided)
```

### 3.3 Other React Hooks

| Hook                                | Description                                                  |
| ----------------------------------- | ------------------------------------------------------------ |
| `useDebouncedCallback(fn, opts)`    | Returns a debounced function directly.                       |
| `useDebouncedValue(value, opts)`    | Returns `[debouncedValue, debouncer]`.                       |
| `useDebouncedState(fn, opts, sel?)` | Returns `[state, setValue, debouncer]` with auto state mgmt. |
| `useQueuedState(fn, opts, sel?)`    | Returns `[items, addItem, queuer]` with auto state mgmt.     |
| `useQueuedValue(value, fn, opts)`   | Queues value changes.                                        |
| `useThrottler(fn, opts, sel?)`      | Throttle hook.                                               |
| `useRateLimiter(fn, opts, sel?)`    | Rate limiter hook.                                           |
| `useBatcher(fn, opts, sel?)`        | Batch hook.                                                  |

### 3.4 Selector Pattern (Performance)

By default, `hook.state` is `{}` – **no re-renders from state changes**.
Opt-in via 3rd argument:

```tsx
const debouncer = useDebouncer(
  fn,
  { wait: 500 },
  (state) => ({ isPending: state.isPending }), // only re-render on isPending change
)
// debouncer.state.isPending → reactive
```

### 3.5 Subscribe Component

Alternative to selector – subscribe deep in tree:

```tsx
<queuer.Subscribe selector={(s) => ({ size: s.size })}>
  {({ size }) => <span>Queue: {size}</span>}
</queuer.Subscribe>
```

---

## 4. Option Helpers (type-safe shared options)

```ts
import { queuerOptions, debouncerOptions } from '@tanstack/pacer'

const shared = queuerOptions({ wait: 100, maxSize: 50 })
const q = new Queuer(fn, { ...shared, started: true })
```

---

## 5. Common Patterns

### 5.1 Module-level singleton Queuer (scheduler)

```ts
// process one item per ~16ms frame
const scheduler = new Queuer<() => void>((job) => job(), {
  started: true,
  wait: 16,
})
// scheduler.addItem(() => doWork())
// To cancel: scheduler.clear() or keep reference and remove
```

### 5.2 Debounce merge window

```ts
const debouncer = new Debouncer(
  (entry: EditEntry) => pushToUndoStack(entry),
  { wait: 300 }, // merges rapid edits within 300ms
)
debouncer.maybeExecute(entry) // resets 300ms timer each call
```

### 5.3 Unmount behavior

Hooks default: `onUnmount: (instance) => instance.stop()` (Queuer) / `instance.cancel()` (Debouncer).
Override to flush remaining work:

```ts
useQueuer(fn, { onUnmount: (q) => q.flush() })
useDebouncer(fn, { onUnmount: (d) => d.flush() })
```

---

## 6. Key Differences from hand-rolled solutions

| Hand-rolled                  | TanStack Pacer                            |
| ---------------------------- | ----------------------------------------- |
| `requestAnimationFrame` loop | `Queuer` with `wait: 16`                  |
| `setTimeout` merge window    | `Debouncer` with `wait: N`                |
| Manual cancelled flag        | `queuer.clear()` or `queuer.stop()`       |
| Ref-based state tracking     | `store.state` reactive via TanStack Store |
| No devtools                  | Optional devtools integration             |
