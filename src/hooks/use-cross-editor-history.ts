import { useCallback, useEffect, useRef, useState } from 'react'
import { Debouncer, Queuer } from '@tanstack/react-pacer'
import { z } from 'zod'

import type { CATEditorRef } from '@/layout/cat-editor'

// ─── Cross-editor history hook ───────────────────────────────────────────────

/**
 * Manages a global undo/redo stack across multiple virtualized Lexical editors.
 *
 * Instead of relying on Lexical's per-editor `HistoryState` (which dies when
 * the virtualizer unmounts a row), we store **text + selection snapshots**
 * directly in the undo/redo stacks.  This makes the history fully
 * virtualization-safe — undo/redo works even for rows that are currently
 * off-screen.
 *
 * When the target row is not mounted, we scroll to it via `scrollToRow`,
 * poll until the editor appears, then apply the snapshot.
 */

// ── Zod Schemas ────────────────────────────────────────────────────────────────────

const SelectionOffsetsSchema = z.object({
  anchor: z.number(),
  focus: z.number(),
})

const HistoryEntrySchema = z.object({
  rowIndex: z.number(),
  beforeText: z.string(),
  beforeSelection: SelectionOffsetsSchema.nullable(),
  afterText: z.string(),
  afterSelection: SelectionOffsetsSchema.nullable(),
  timestamp: z.number(),
})
type HistoryEntry = z.infer<typeof HistoryEntrySchema>

export const CrossEditorHistoryDepsSchema = z.object({
  /**
   * Scroll to a row index.  Must handle stretching mode internally
   * (i.e. use `useMassiveVirtualizer.scrollToRow` which bypasses
   * TanStack's retry-based `scrollToIndex`).
   */
  scrollToRow:
    z.custom<
      (rowIndex: number, opts?: { align?: 'center' | 'start' | 'end' }) => void
    >(),
  /** Try to get the CATEditorRef for a row (may be `undefined` if not mounted). */
  getEditorRef: z.custom<(rowIndex: number) => CATEditorRef | undefined>(),
})
export type CrossEditorHistoryDeps = z.infer<
  typeof CrossEditorHistoryDepsSchema
>

/**
 * Optional callback fired after a snapshot is applied.
 * Use this for caret centering, scroll fine-tuning, etc.
 */
export const OnAfterApplySchema =
  z.custom<(rowIndex: number, wasScrolled: boolean) => void>()
export type OnAfterApply = z.infer<typeof OnAfterApplySchema>

/**
 * Async guard passed to `undo()` / `redo()`.
 * Called only when the operation crosses rows (target ≠ active row).
 *
 * - Resolve / return `true` / `void` → proceed normally.
 * - Return `false` or reject → cancel, entry pushed back onto its stack.
 */
export const OnBeforeCrossApplySchema =
  z.custom<
    (
      currentRowIndex: number,
      targetRowIndex: number,
    ) => Promise<boolean | void> | boolean | void
  >()
export type OnBeforeCrossApply = z.infer<typeof OnBeforeCrossApplySchema>

/** Consecutive edits to the same row within this window are merged. */
const HISTORY_MERGE_INTERVAL = 300

export function useCrossEditorHistory(deps: CrossEditorHistoryDeps) {
  const depsRef = useRef(deps)
  depsRef.current = deps

  // The row that was most recently edited or restored via undo/redo.
  // Used to detect "cross-row" operations for the `onBeforeCrossApply` guard.
  const activeRowRef = useRef<number | null>(null)

  // Last known text + selection per row — survives unmount.
  const lastKnownRef = useRef<
    Map<
      number,
      { text: string; selection: { anchor: number; focus: number } | null }
    >
  >(new Map())

  // Per-row update-listener cleanup functions
  const listenersRef = useRef<Map<number, () => void>>(new Map())

  // Global undo / redo stacks
  const undoStackRef = useRef<Array<HistoryEntry>>([])
  const redoStackRef = useRef<Array<HistoryEntry>>([])

  // ── Merge-window management via TanStack Pacer Debouncer ──
  // Instead of comparing Date.now() timestamps, we use a Debouncer to
  // track the "current typing burst".  While the debouncer is pending,
  // subsequent edits to the same row merge into the existing top entry.
  // When 300 ms of inactivity passes, the debouncer fires and clears
  // the pending entry ref, so the next edit creates a new undo entry.
  const pendingEntryRef = useRef<HistoryEntry | null>(null)
  const sealDebouncerRef = useRef<Debouncer<() => void> | null>(null)
  if (!sealDebouncerRef.current) {
    sealDebouncerRef.current = new Debouncer(
      () => {
        pendingEntryRef.current = null
      },
      { wait: HISTORY_MERGE_INTERVAL },
    )
  }

  // Revision counter — drives `canUndo` / `canRedo` reactivity
  const [revision, setRevision] = useState(0)
  const bumpRevision = useCallback(() => setRevision((r) => r + 1), [])

  // ── Undo/redo apply queue via TanStack Pacer Queuer ──
  // Each undo/redo operation is queued as a job.  The Queuer processes
  // them sequentially (FIFO) with a 30 ms gap between items, giving the
  // virtualizer time to mount/scroll between rapid-fire operations.
  // This replaces the manual setTimeout poll loop with a cleaner, more
  // predictable abstraction.
  const applyQueuerRef = useRef<Queuer<() => void> | null>(null)
  if (!applyQueuerRef.current) {
    applyQueuerRef.current = new Queuer<() => void>((job) => job(), {
      started: true,
      wait: 0,
    })
  }
  // Generation counter — incremented at the start of each applySnapshot.
  // Stale requestAnimationFrame / poll callbacks check this and bail out.
  const applyEpochRef = useRef(0)

  const cancelPending = () => {
    applyQueuerRef.current?.clear()
  }

  /** Register a CATEditorRef (called when a row mounts). */
  const registerEditor = useCallback(
    (rowIndex: number, catRef: CATEditorRef) => {
      const editor = catRef.getEditor()
      if (!editor) return

      // Clean up previous listener for this row
      listenersRef.current.get(rowIndex)?.()

      // Seed last-known state so the very first edit has a "before".
      const currentText = catRef.getText()
      const currentSel = catRef.getSelection()
      lastKnownRef.current.set(rowIndex, {
        text: currentText,
        selection: currentSel ?? { anchor: 0, focus: 0 },
      })

      // Listen for user edits — skip internal / synthetic updates
      const unregister = editor.registerUpdateListener(
        ({ tags, dirtyElements, dirtyLeaves }) => {
          if (tags.has('cross-history')) return
          if (tags.has('cat-highlights')) return
          if (tags.has('history-merge')) return
          if (tags.has('historic')) return

          const ref = depsRef.current.getEditorRef(rowIndex)
          if (!ref) return

          const newSel = ref.getSelection()
          const before = lastKnownRef.current.get(rowIndex)

          // Selection-only update — track it for next edit's "before"
          if (dirtyElements.size === 0 && dirtyLeaves.size === 0) {
            if (newSel && before) before.selection = newSel
            return
          }

          const newText = ref.getText()

          // Text unchanged — just track selection
          if (before && before.text === newText) {
            if (newSel) before.selection = newSel
            return
          }

          // ── Record the edit ──
          const pending = pendingEntryRef.current

          if (pending && pending.rowIndex === rowIndex) {
            // Merge into existing top entry (typing continuation)
            pending.afterText = newText
            pending.afterSelection = newSel
            pending.timestamp = Date.now()
            sealDebouncerRef.current!.maybeExecute()
          } else {
            // Seal any previous pending entry from a different row
            if (pending) {
              sealDebouncerRef.current!.cancel()
              pendingEntryRef.current = null
            }

            const entry: HistoryEntry = {
              rowIndex,
              beforeText: before?.text ?? '',
              beforeSelection: before?.selection ?? null,
              afterText: newText,
              afterSelection: newSel,
              timestamp: Date.now(),
            }
            undoStackRef.current.push(entry)
            pendingEntryRef.current = entry
            sealDebouncerRef.current!.maybeExecute()
          }

          // Track this row as the active one
          activeRowRef.current = rowIndex

          // New edit clears the redo stack
          redoStackRef.current.length = 0

          // Update last known
          lastKnownRef.current.set(rowIndex, {
            text: newText,
            selection: newSel ?? { anchor: 0, focus: 0 },
          })

          bumpRevision()
        },
      )

      listenersRef.current.set(rowIndex, unregister)
    },
    [bumpRevision],
  )

  /** Unregister when a row unmounts (virtualizer recycling). */
  const unregisterEditor = useCallback((rowIndex: number) => {
    listenersRef.current.get(rowIndex)?.()
    listenersRef.current.delete(rowIndex)
    // Keep lastKnownRef — survives unmount/remount
  }, [])

  /**
   * Apply a text + selection snapshot to a (possibly unmounted) editor row.
   *
   * Strategy:
   * 1. If the editor is mounted → apply immediately (synchronous).
   * 2. Otherwise → `scrollToRow` then poll via Queuer until mounted.
   *
   * The Queuer processes poll attempts sequentially with a 30 ms gap,
   * replacing the manual setTimeout loop.  `cancelPending` clears the
   * queue, cancelling all outstanding poll attempts instantly.
   *
   * Works identically for fixed/dynamic heights and stretching/non-stretching.
   * `scrollToRow` reads `measurementsCache` directly for accurate offsets
   * and sets `el.scrollTop` directly, bypassing TanStack's retry mechanism
   * that fails to converge in stretching mode.
   */
  const applySnapshot = useCallback(
    (
      entry: HistoryEntry,
      textKey: 'beforeText' | 'afterText',
      selKey: 'beforeSelection' | 'afterSelection',
      pushTo: Array<HistoryEntry>,
      onAfterApply?: OnAfterApply,
    ) => {
      cancelPending()

      // Bump epoch so any in-flight rAF / poll callbacks from a
      // previous applySnapshot become no-ops.
      const epoch = ++applyEpochRef.current

      const text = entry[textKey]
      const selection = entry[selKey]

      const textLen = text.length
      const sel = selection ?? { anchor: 0, focus: 0 }
      const clamped = {
        anchor: Math.min(sel.anchor, textLen),
        focus: Math.min(sel.focus, textLen),
      }

      // ── Commit to stacks IMMEDIATELY (before any async work) ──
      // This prevents rapid undo/redo from losing entries: if the user
      // fires undo again before the poll resolves, `cancelPending` kills
      // the queue but the entry is already safely in `pushTo`.
      pushTo.push(entry)

      // Update lastKnown BEFORE setText so the update listener's
      // text-comparison guard sees "no change".
      lastKnownRef.current.set(entry.rowIndex, {
        text,
        selection: clamped,
      })

      bumpRevision()

      /** Write text + selection to a mounted editor (DOM-only). */
      const applyToEditor = (ref: CATEditorRef) => {
        // Order: setText → setSelection → focus.
        ref.setText(text, { tag: 'cross-history' })
        ref.setSelection(clamped.anchor, clamped.focus)

        // Re-assert lastKnown after applying.  On the slow path,
        // `registerEditor` may have clobbered it with the stale
        // `initialText` when the editor mounted.  This ensures the
        // update listener's before-text is correct for the next edit.
        lastKnownRef.current.set(entry.rowIndex, {
          text,
          selection: clamped,
        })
      }

      /**
       * Scroll the caret (native DOM selection) to the vertical center of
       * the nearest scrollable ancestor.  Called after `applyToEditor` so
       * the browser selection already sits at the restored caret position.
       */
      const scrollCaretToCenter = () => {
        const nativeSel = window.getSelection()
        if (!nativeSel || nativeSel.rangeCount === 0) return

        const range = nativeSel.getRangeAt(0)
        const caretRect = range.getBoundingClientRect()
        // Guard: collapsed range on a hidden/unmeasured node returns a zero rect.
        if (caretRect.top === 0 && caretRect.height === 0) return

        // Walk up from the caret to find the first scrollable ancestor
        // (the virtualizer's scroll container).
        let scrollParent: HTMLElement | null =
          range.startContainer instanceof Element
            ? (range.startContainer as HTMLElement)
            : range.startContainer.parentElement
        while (scrollParent) {
          const { overflowY } = getComputedStyle(scrollParent)
          if (
            overflowY === 'auto' ||
            overflowY === 'scroll' ||
            overflowY === 'overlay'
          ) {
            break
          }
          scrollParent = scrollParent.parentElement
        }
        if (!scrollParent) return

        const containerRect = scrollParent.getBoundingClientRect()
        // Caret position relative to the scroll container's content.
        const caretInContainer =
          caretRect.top - containerRect.top + scrollParent.scrollTop
        // Target: place the caret at the vertical center of the viewport.
        scrollParent.scrollTop =
          caretInContainer - containerRect.height / 2 + caretRect.height / 2
      }

      // ── Fast path: editor already mounted ──
      const immediate = depsRef.current.getEditorRef(entry.rowIndex)
      if (immediate) {
        applyToEditor(immediate)
        requestAnimationFrame(() => {
          if (applyEpochRef.current !== epoch) return
          scrollCaretToCenter()
        })
        onAfterApply?.(entry.rowIndex, false)
        return
      }

      // ── Slow path: scroll then poll via Queuer ──
      depsRef.current.scrollToRow(entry.rowIndex, { align: 'center' })

      const MAX_ATTEMPTS = 40
      let attempts = 0

      // Change the Queuer wait to 30 ms for polling, then add poll jobs.
      const queuer = applyQueuerRef.current!
      queuer.setOptions({ wait: 30 })

      const enqueuePoll = () => {
        queuer.addItem(() => {
          // A newer applySnapshot has started — abandon this poll chain.
          if (applyEpochRef.current !== epoch) return

          const ref = depsRef.current.getEditorRef(entry.rowIndex)
          if (ref) {
            applyToEditor(ref)
            // Center the caret in the scroll viewport after the text
            // change, which may have shifted the caret out of view.
            requestAnimationFrame(() => {
              if (applyEpochRef.current !== epoch) return
              scrollCaretToCenter()
            })
            onAfterApply?.(entry.rowIndex, true)
            return // done — don't enqueue more polls
          }
          if (++attempts < MAX_ATTEMPTS) {
            // Re-scroll every few attempts — progressive correction for
            // large lists where estimate drift may place us far from target.
            if (attempts % 5 === 0) {
              depsRef.current.scrollToRow(entry.rowIndex, { align: 'center' })
            }
            enqueuePoll()
          }
          // If timed out, entry is already in the stack — no data loss.
        })
      }

      // Kick off the first poll after a rAF to give the virtualizer
      // time to mount the target row.
      requestAnimationFrame(() => {
        if (applyEpochRef.current !== epoch) return
        enqueuePoll()
      })
    },
    [bumpRevision],
  )

  const undo = useCallback(
    async (
      onBeforeCrossApply?: OnBeforeCrossApply,
      onAfterApply?: OnAfterApply,
    ) => {
      const entry = undoStackRef.current.pop()
      if (!entry) return

      // Cross-row guard
      const isCross =
        activeRowRef.current !== null && entry.rowIndex !== activeRowRef.current
      if (isCross && onBeforeCrossApply) {
        try {
          const result = await onBeforeCrossApply(
            activeRowRef.current!,
            entry.rowIndex,
          )
          if (result === false) {
            undoStackRef.current.push(entry)
            return
          }
        } catch {
          undoStackRef.current.push(entry)
          return
        }
      }

      activeRowRef.current = entry.rowIndex
      applySnapshot(
        entry,
        'beforeText',
        'beforeSelection',
        redoStackRef.current,
        onAfterApply,
      )
    },
    [applySnapshot],
  )

  const redo = useCallback(
    async (
      onBeforeCrossApply?: OnBeforeCrossApply,
      onAfterApply?: OnAfterApply,
    ) => {
      const entry = redoStackRef.current.pop()
      if (!entry) return

      // Cross-row guard
      const isCross =
        activeRowRef.current !== null && entry.rowIndex !== activeRowRef.current
      if (isCross && onBeforeCrossApply) {
        try {
          const result = await onBeforeCrossApply(
            activeRowRef.current!,
            entry.rowIndex,
          )
          if (result === false) {
            redoStackRef.current.push(entry)
            return
          }
        } catch {
          redoStackRef.current.push(entry)
          return
        }
      }

      activeRowRef.current = entry.rowIndex
      applySnapshot(
        entry,
        'afterText',
        'afterSelection',
        undoStackRef.current,
        onAfterApply,
      )
    },
    [applySnapshot],
  )

  /** Reset all history (e.g. on full demo reset). */
  const clearHistory = useCallback(() => {
    cancelPending()
    sealDebouncerRef.current?.cancel()
    pendingEntryRef.current = null
    undoStackRef.current.length = 0
    redoStackRef.current.length = 0
    activeRowRef.current = null
    for (const unreg of listenersRef.current.values()) unreg()
    listenersRef.current.clear()
    lastKnownRef.current.clear()
    bumpRevision()
  }, [bumpRevision])

  // ── Cleanup on unmount: stop Queuer and cancel Debouncer ──
  // Without this, a pending Debouncer timer or Queuer tick could fire
  // after the component tree unmounts, holding closures in memory.
  useEffect(() => {
    return () => {
      applyQueuerRef.current?.stop()
      applyQueuerRef.current?.clear()
      sealDebouncerRef.current?.cancel()
      // Invalidate all in-flight rAF / poll callbacks.
      applyEpochRef.current++
    }
  }, [])

  const canUndo = undoStackRef.current.length > 0
  const canRedo = redoStackRef.current.length > 0

  void revision

  return {
    registerEditor,
    unregisterEditor,
    undo,
    redo,
    clearHistory,
    canUndo,
    canRedo,
  }
}
