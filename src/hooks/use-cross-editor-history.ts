import { useCallback, useRef, useState } from 'react'
import { Debouncer, Queuer } from '@tanstack/react-pacer'

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

interface HistoryEntry {
  rowIndex: number
  beforeText: string
  beforeSelection: { anchor: number; focus: number } | null
  afterText: string
  afterSelection: { anchor: number; focus: number } | null
  timestamp: number
}

export interface CrossEditorHistoryDeps {
  /**
   * Scroll to a row index.  Must handle stretching mode internally
   * (i.e. use `useMassiveVirtualizer.scrollToRow` which bypasses
   * TanStack's retry-based `scrollToIndex`).
   */
  scrollToRow: (
    rowIndex: number,
    opts?: { align?: 'center' | 'start' | 'end' },
  ) => void
  /** Try to get the CATEditorRef for a row (may be `undefined` if not mounted). */
  getEditorRef: (rowIndex: number) => CATEditorRef | undefined
  /**
   * Optional callback fired after a snapshot is applied.
   * Use this for caret centering, scroll fine-tuning, etc.
   */
  onAfterApply?: (rowIndex: number, wasScrolled: boolean) => void
}

/** Consecutive edits to the same row within this window are merged. */
const HISTORY_MERGE_INTERVAL = 300

export function useCrossEditorHistory(deps: CrossEditorHistoryDeps) {
  const depsRef = useRef(deps)
  depsRef.current = deps

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
    ) => {
      cancelPending()

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
        // ref.focus()

        // Re-assert lastKnown after applying.  On the slow path,
        // `registerEditor` may have clobbered it with the stale
        // `initialText` when the editor mounted.  This ensures the
        // update listener's before-text is correct for the next edit.
        lastKnownRef.current.set(entry.rowIndex, {
          text,
          selection: clamped,
        })
      }

      // ── Fast path: editor already mounted ──
      const immediate = depsRef.current.getEditorRef(entry.rowIndex)
      if (immediate) {
        applyToEditor(immediate)
        depsRef.current.onAfterApply?.(entry.rowIndex, false)
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
          const ref = depsRef.current.getEditorRef(entry.rowIndex)
          if (ref) {
            applyToEditor(ref)
            // Re-scroll after apply to ensure centering (text change may
            // have shifted things in dynamic-height mode).
            requestAnimationFrame(() =>
              depsRef.current.scrollToRow(entry.rowIndex, { align: 'center' }),
            )
            depsRef.current.onAfterApply?.(entry.rowIndex, true)
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
      requestAnimationFrame(enqueuePoll)
    },
    [bumpRevision],
  )

  const undo = useCallback(() => {
    const entry = undoStackRef.current.pop()
    if (!entry) return
    applySnapshot(entry, 'beforeText', 'beforeSelection', redoStackRef.current)
  }, [applySnapshot])

  const redo = useCallback(() => {
    const entry = redoStackRef.current.pop()
    if (!entry) return
    applySnapshot(entry, 'afterText', 'afterSelection', undoStackRef.current)
  }, [applySnapshot])

  /** Reset all history (e.g. on full demo reset). */
  const clearHistory = useCallback(() => {
    cancelPending()
    sealDebouncerRef.current?.cancel()
    pendingEntryRef.current = null
    undoStackRef.current.length = 0
    redoStackRef.current.length = 0
    for (const unreg of listenersRef.current.values()) unreg()
    listenersRef.current.clear()
    lastKnownRef.current.clear()
    bumpRevision()
  }, [bumpRevision])

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
