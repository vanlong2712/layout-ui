/**
 * useMassiveVirtualizer — drop-in wrapper around @tanstack/react-virtual's
 * `useVirtualizer` that transparently handles row counts that exceed the
 * browser's maximum element height.
 *
 * ## The problem
 * Each browser caps the CSS height of a `<div>` (Chrome ~33 M px, Firefox
 * ~17.9 M px).  A virtualizer container whose `getTotalSize()` exceeds this
 * limit cannot be scrolled to all rows — the scroll-bar simply stops.
 *
 * ## The solution (AG Grid's "Stretching" technique)
 * 1. Detect the browser's max height **once**.
 * 2. Cap the container height at that limit.
 * 3. Override `observeElementOffset` to **amplify** the physical scroll
 *    position into a virtual offset so he virtualizer thinks the container is
 *    taller than it really is.
 * 4. Override `scrollToFn` to **reverse** the amplification for programmatic
 *    scrolls (`scrollToIndex`, `scrollToOffset`).
 * 5. Subtract a `rowOffset` from each item's `translateY` to compensate for
 *    the virtual space that doesn't physically exist.
 *
 * When the total size is below the limit **all of this is completely inert**
 * — zero runtime overhead, identical behavior to plain `useVirtualizer`.
 *
 * @module
 */

import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

// ─── Browser max-height detection ────────────────────────────────────────────

let _detectedMaxDivHeight: number | null = null

/**
 * Detect (and cache) the browser's maximum element height.
 * Returns a conservative value (90 % of detected) to stay safely below the
 * actual ceiling.  Falls back to 15 M px for SSR / non-browser envs.
 */
export function getMaxDivHeight(): number {
  if (_detectedMaxDivHeight !== null) return _detectedMaxDivHeight
  if (typeof document === 'undefined')
    return (_detectedMaxDivHeight = 15_000_000)
  const el = document.createElement('div')
  el.style.cssText = 'position:absolute;visibility:hidden;height:1000000000px'
  document.body.appendChild(el)
  const detected = el.clientHeight
  document.body.removeChild(el)
  _detectedMaxDivHeight =
    detected > 1_000_000 ? Math.floor(detected * 0.9) : 15_000_000
  return _detectedMaxDivHeight
}

// ─── Types ───────────────────────────────────────────────────────────────────

/** All options accepted by `useVirtualizer`, with the scroll element fixed to `HTMLDivElement`. */
type VirtualizerOptions = Parameters<
  typeof useVirtualizer<HTMLDivElement, Element>
>[0]

export interface UseMassiveVirtualizerOptions extends VirtualizerOptions {
  /**
   * If provided, the caller's `observeElementOffset` is called **after** the
   * stretching layer has been applied.  This lets you add extra logic
   * (e.g. keep a `focusedRow` pinned) on top of the stretching transform.
   */
  // (we handle this internally — no extra prop needed for now)
}

export interface MassiveVirtualizerResult {
  /** The underlying tanstack virtualizer instance. */
  virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>
  /** Height (px) to set on the inner "spacer" div.  Uses capped height when stretching. */
  containerHeight: number
  /** Whether stretching is currently active (totalSize > maxDivHeight). */
  isStretching: boolean
  /**
   * Offset (px) to **subtract** from each `virtualRow.start` in your
   * `translateY`.  Zero when not stretching.
   *
   * Usage: `transform: translateY(${virtualRow.start - rowOffset}px)`
   */
  rowOffset: number
  /**
   * Scroll to a row by index, centering it in the viewport.
   *
   * In normal mode this delegates to `scrollToIndex({ align })`.
   * In stretching mode it computes the physical scroll position directly,
   * bypassing the 10-attempt internal retry limit that would otherwise fail
   * when estimate drift is too large.
   */
  scrollToRow: (
    rowIndex: number,
    opts?: { align?: 'center' | 'start' | 'end' },
  ) => void
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useMassiveVirtualizer(
  options: UseMassiveVirtualizerOptions,
): MassiveVirtualizerResult {
  // ── Refs survive across renders without recreating the virtualizer ──
  const stretchRef = useRef({
    active: false,
    additionalPx: 0,
    maxPhysicalScroll: 1,
  })
  const physicalScrollRef = useRef(0)

  // We need estimateSize for the scrollToRow fallback calculation.
  // Capture whatever the caller passed (it may be a closure that changes).
  const estimateSizeRef = useRef(options.estimateSize)
  estimateSizeRef.current = options.estimateSize

  // ── Create the virtualizer with stretch overrides ──────────────────
  const virtualizer = useVirtualizer<HTMLDivElement, Element>({
    ...options,

    observeElementOffset: (instance, cb) => {
      const el = instance.scrollElement
      if (!el) return
      const handler = (event?: Event) => {
        const physical = el.scrollTop
        physicalScrollRef.current = physical
        const s = stretchRef.current
        if (s.active && s.maxPhysicalScroll > 0) {
          const pct = Math.min(1, physical / s.maxPhysicalScroll)
          cb(physical + pct * s.additionalPx, event?.isTrusted ?? false)
        } else {
          cb(physical, event?.isTrusted ?? false)
        }
      }
      handler()
      el.addEventListener('scroll', handler as EventListener, {
        passive: true,
      })
      return () => el.removeEventListener('scroll', handler as EventListener)
    },

    scrollToFn: (offset, { adjustments, behavior }, instance) => {
      const el = instance.scrollElement
      if (!el) return
      const total = offset + (adjustments ?? 0)
      const s = stretchRef.current
      let physical: number
      if (s.active && s.maxPhysicalScroll > 0) {
        const ratio = 1 + s.additionalPx / s.maxPhysicalScroll
        physical = total / ratio
      } else {
        physical = total
      }
      if (behavior === 'smooth') {
        el.scrollTo({ top: physical, behavior: 'smooth' })
      } else {
        el.scrollTop = physical
      }
    },
  })

  // ── Synchronous stretch-parameter update (every render) ────────────
  const totalSize = virtualizer.getTotalSize()
  const maxDiv = getMaxDivHeight()
  const isStretching = totalSize > maxDiv
  const cappedHeight = isStretching ? maxDiv : totalSize
  const scrollEl = virtualizer.scrollElement as HTMLElement | null
  const viewportH = scrollEl?.clientHeight ?? 0

  stretchRef.current = {
    active: isStretching,
    additionalPx: isStretching ? totalSize - maxDiv : 0,
    maxPhysicalScroll: Math.max(1, cappedHeight - viewportH),
  }

  const rowOffset = isStretching
    ? Math.min(
        1,
        physicalScrollRef.current / stretchRef.current.maxPhysicalScroll,
      ) * stretchRef.current.additionalPx
    : 0

  // ── scrollToRow ────────────────────────────────────────────────────
  // Stored in a ref so the returned function is stable across renders.
  const virtualizerRef = useRef(virtualizer)
  virtualizerRef.current = virtualizer

  const scrollToRowRef = useRef(
    (rowIndex: number, opts?: { align?: 'center' | 'start' | 'end' }) => {
      const v = virtualizerRef.current
      const ts = v.getTotalSize()
      const md = getMaxDivHeight()
      const align = opts?.align ?? 'center'

      if (ts <= md) {
        // Normal mode — delegate to TanStack's retry-based scrollToIndex.
        v.scrollToIndex(rowIndex, { align })
        return
      }

      // ── Stretching mode ──────────────────────────────────────────────
      //
      // We CANNOT use `scrollToIndex` or `getOffsetForIndex` here.
      //
      // 1. `scrollToIndex` has a retry loop checking
      //    `approxEqual(target, current) < 1.01px`.  The stretching
      //    virtual↔physical round-trip amplifies `el.scrollTop` integer
      //    rounding by the stretch ratio (~4.67×), so retries never
      //    converge and the scroll lands at a random position.
      //
      // 2. `getOffsetForIndex` internally calls `getOffsetForAlignment`
      //    which clamps to `getMaxScrollOffset()` — but that returns
      //    the PHYSICAL max (`scrollHeight - clientHeight ≈ 30M`) while
      //    item offsets are in VIRTUAL coordinates (up to ~140M).  So
      //    any row past ~21% of the list gets clamped to the same value.
      //
      // Fix: read `start`/`size` directly from `measurementsCache`
      // (public property) and compute the virtual target ourselves,
      // then convert to physical and set `el.scrollTop` directly.
      // ────────────────────────────────────────────────────────────────

      const el = v.scrollElement as HTMLElement | null
      if (!el) return

      const vh = el.clientHeight
      const maxPhys = Math.max(1, md - vh)
      const maxVirt = Math.max(1, ts - vh)

      // Read the measurement-accurate item position from the cache.
      const clampedIndex = Math.max(0, Math.min(rowIndex, v.options.count - 1))
      const item = v.measurementsCache[clampedIndex] as
        | (typeof v.measurementsCache)[number]
        | undefined

      let virtualTarget: number
      if (item) {
        // Use the accurate, measurement-aware offset.
        if (align === 'start') {
          virtualTarget = item.start
        } else if (align === 'end') {
          virtualTarget = item.end - vh
        } else {
          // center: place the item's midpoint at the viewport's midpoint
          virtualTarget = item.start + item.size / 2 - vh / 2
        }
      } else {
        // Fallback: naive estimate (only if measurementsCache is empty).
        const estSize = estimateSizeRef.current(rowIndex)
        if (align === 'start') {
          virtualTarget = rowIndex * estSize
        } else if (align === 'end') {
          virtualTarget = rowIndex * estSize + estSize - vh
        } else {
          virtualTarget = rowIndex * estSize + estSize / 2 - vh / 2
        }
      }
      virtualTarget = Math.max(0, Math.min(maxVirt, virtualTarget))

      el.scrollTop = (virtualTarget / maxVirt) * maxPhys
    },
  )

  return {
    virtualizer,
    containerHeight: cappedHeight,
    isStretching,
    rowOffset,
    scrollToRow: scrollToRowRef.current,
  }
}
