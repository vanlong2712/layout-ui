/**
 * @module use-editor-grid-store
 *
 * TanStack Store provider for the virtualized CATEditor grid.
 * Owns three shared resources and one piece of UI state:
 *
 *   1. **virtualizer** – the `MassiveVirtualizerResult` powering the scroll /
 *      stretch transform.  Written by `VirtualizedEditorList` after each
 *      render; read by anyone via `useGridVirtualizer()` / `getVirtualizer()`.
 *   2. **crossHistory** – the `CrossEditorHistoryApi` for global undo / redo.
 *      Created *inside* the provider via `useCrossEditorHistory`.
 *   3. **editorRefsMap** – a `Map<number, CATEditorRef>` of per-row handles.
 *   4. **focusedRow** – index of the currently focused editor row (or `null`).
 *
 * All schemas use Zod v4 (`z.custom<T>()` for opaque runtime objects) so that
 * the store's shape is documented and validated at the type level.
 */

import { createContext, useContext, useEffect, useRef } from 'react'
import { Store } from '@tanstack/store'
import { useStore } from '@tanstack/react-store'
import { z } from 'zod'

import { cellKey, useCrossEditorHistory } from './use-cross-editor-history'
import type {
  OnAfterApply,
  OnBeforeCrossApply,
} from './use-cross-editor-history'
import type { PropsWithChildren } from 'react'

import type { CATEditorRef } from '../layout/cat-editor'
import type { MassiveVirtualizerResult } from './use-massive-virtualizer'

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

/**
 * The return type of `useCrossEditorHistory`.
 * Because it contains closures / refs we use `z.custom` — Zod just acts as a
 * structural label here, not a runtime validator.
 */
const CrossEditorHistoryApiSchema = z.object({
  registerEditor:
    z.custom<(row: number, column: number, ref: CATEditorRef) => void>(),
  unregisterEditor: z.custom<(row: number, column: number) => void>(),
  undo: z.custom<
    (
      onBeforeCrossApply?: OnBeforeCrossApply,
      onAfterApply?: OnAfterApply,
    ) => Promise<void>
  >(),
  redo: z.custom<
    (
      onBeforeCrossApply?: OnBeforeCrossApply,
      onAfterApply?: OnAfterApply,
    ) => Promise<void>
  >(),
  clearHistory: z.custom<() => void>(),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
})

/** Inferred TS type for cross-editor history API. */
export type CrossEditorHistoryApi = z.infer<typeof CrossEditorHistoryApiSchema>

/**
 * Top-level store state.
 *
 * - `virtualizer` is `null` until the virtualizer mounts.
 * - `crossHistory` is `null` until the provider's first render commit.
 * - `editorRefsMap` always exists (starts empty).
 * - `focusedRow` is `null` when no editor has focus.
 */
const EditorGridStateSchema = z.object({
  virtualizer: z.custom<MassiveVirtualizerResult>().nullable(),
  crossHistory: CrossEditorHistoryApiSchema.nullable(),
  editorRefsMap: z.custom<Map<string, CATEditorRef>>(),
  focusedRow: z.number().nullable(),
})

/** Inferred TS type for the full store state. */
export type EditorGridState = z.infer<typeof EditorGridStateSchema>

/** The TanStack Store generic type. */
export type EditorGridStore = Store<EditorGridState>

// ─── Defaults ────────────────────────────────────────────────────────────────

function createDefaultState(): EditorGridState {
  return {
    virtualizer: null,
    crossHistory: null,
    editorRefsMap: new Map(),
    focusedRow: null,
  }
}

// ─── Context + Provider ──────────────────────────────────────────────────────

const EditorGridStoreContext = createContext<EditorGridStore | null>(null)

/**
 * Wrap the editor-grid subtree with this provider.  It creates a single
 * `Store<EditorGridState>` that lives for the lifetime of the provider AND
 * calls `useCrossEditorHistory` so that cross-editor undo / redo is
 * available to every descendant via `useGridCrossHistory()`.
 */
export function EditorGridStoreProvider({ children }: PropsWithChildren) {
  const storeRef = useRef<EditorGridStore | null>(null)
  if (storeRef.current === null) {
    storeRef.current = new Store<EditorGridState>(createDefaultState())
  }
  const store = storeRef.current

  // ── Cross-editor history — owned by the provider ──
  // Deps read lazily from the store so they're always fresh.
  const crossHistory = useCrossEditorHistory({
    scrollToRow: (rowIndex, opts) =>
      store.state.virtualizer?.scrollToRow(rowIndex, opts),
    getEditorRef: (rowIndex, columnIndex) =>
      store.state.editorRefsMap.get(cellKey(rowIndex, columnIndex)),
  })

  // Sync crossHistory into the store each render so selectors pick it up.
  // The hook returns a new object reference whenever canUndo/canRedo flip.
  useEffect(() => {
    store.setState((prev) => ({ ...prev, crossHistory }))
  }, [store, crossHistory])

  return (
    <EditorGridStoreContext.Provider value={store}>
      {children}
    </EditorGridStoreContext.Provider>
  )
}

// ─── Raw store accessor ──────────────────────────────────────────────────────

/** Returns the raw TanStack Store instance (never `null` inside the provider). */
export function useEditorGridStore(): EditorGridStore {
  const store = useContext(EditorGridStoreContext)
  if (!store) {
    throw new Error(
      'useEditorGridStore must be used within <EditorGridStoreProvider>',
    )
  }
  return store
}

// ─── Selector hooks (reactive, fine-grained) ────────────────────────────────

/** Subscribe to the `MassiveVirtualizerResult` (or `null`). */
export function useGridVirtualizer(): MassiveVirtualizerResult | null {
  const store = useEditorGridStore()
  return useStore(store, (s) => s.virtualizer)
}

/** Subscribe to the `CrossEditorHistoryApi` (or `null`). */
export function useGridCrossHistory(): CrossEditorHistoryApi | null {
  const store = useEditorGridStore()
  return useStore(store, (s) => s.crossHistory)
}

/** Subscribe to the full `editorRefsMap`. */
export function useGridEditorRefsMap(): Map<string, CATEditorRef> {
  const store = useEditorGridStore()
  return useStore(store, (s) => s.editorRefsMap)
}

/** Subscribe to the focused row index. */
export function useGridFocusedRow(): number | null {
  const store = useEditorGridStore()
  return useStore(store, (s) => s.focusedRow)
}

// ─── Imperative setters (call from effects / callbacks) ──────────────────────

/** Replace the virtualizer result in the store. */
export function setVirtualizer(
  store: EditorGridStore,
  v: MassiveVirtualizerResult | null,
): void {
  store.setState((prev) => ({ ...prev, virtualizer: v }))
}

/** Set the currently focused row index. */
export function setFocusedRow(
  store: EditorGridStore,
  row: number | null,
): void {
  store.setState((prev) => ({ ...prev, focusedRow: row }))
}

/**
 * Register a single editor ref in the map.
 *
 * Mutates the existing Map **in-place** to avoid allocating a new Map for
 * every editor mount (which would be O(n) with 1 000+ rows).  Because the
 * Map reference doesn't change, reactive `useStore` selectors are NOT
 * triggered — this is intentional for perf-critical registration.
 */
export function setEditorRef(
  store: EditorGridStore,
  row: number,
  column: number,
  ref: CATEditorRef,
): void {
  store.state.editorRefsMap.set(cellKey(row, column), ref)
}

/** Remove a single editor ref from the map (in-place, non-reactive). */
export function deleteEditorRef(
  store: EditorGridStore,
  row: number,
  column: number,
): void {
  store.state.editorRefsMap.delete(cellKey(row, column))
}

/** Get a ref without subscribing to map changes (reads snapshot). */
export function getEditorRef(
  store: EditorGridStore,
  row: number,
  column: number,
): CATEditorRef | undefined {
  return store.state.editorRefsMap.get(cellKey(row, column))
}

/** Get the virtualizer result without subscribing (reads snapshot). */
export function getVirtualizer(
  store: EditorGridStore,
): MassiveVirtualizerResult | null {
  return store.state.virtualizer
}

/** Get the cross-history API without subscribing (reads snapshot). */
export function getCrossHistory(
  store: EditorGridStore,
): CrossEditorHistoryApi | null {
  return store.state.crossHistory
}

/** Clear all editor refs (e.g. on unmount). */
export function clearEditorRefs(store: EditorGridStore): void {
  store.setState((prev) => ({ ...prev, editorRefsMap: new Map() }))
}
