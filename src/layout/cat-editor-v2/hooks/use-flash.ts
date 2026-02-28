import { useCallback, useRef } from 'react'

import {
  $getNodeKeysInRange,
  $globalOffsetToPoint,
} from '../../cat-editor/selection-helpers'

import type { LexicalEditor } from 'lexical'

// ─── useFlash ────────────────────────────────────────────────────────────────
// Encapsulates the flash-highlight feature: temporarily tints editor elements
// (by annotation ID or character range) with a pink overlay.
//
// Two highlighting strategies:
//   1. CSS Custom Highlight API (`CSS.highlights`) — character-precise
//   2. Class-based fallback (whole-node) for older browsers

export interface FlashControls {
  /** Flash elements matching `annotationId` for `durationMs`. */
  flashHighlight: (annotationId: string, durationMs?: number) => void
  /** Flash the text range `[start, end)` for `durationMs`. */
  flashRange: (start: number, end: number, durationMs?: number) => void
  /** Clear any active flash immediately. */
  clearFlash: () => void
}

export function useFlash(
  editorRef: React.MutableRefObject<LexicalEditor | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
): FlashControls {
  const flashIdRef = useRef<string | null>(null)
  const flashRangeRef = useRef<{ start: number; end: number } | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashEditUnregRef = useRef<(() => void) | null>(null)

  // ── Class-based flash (by annotation ID) ─────────────────────────

  const applyFlashClass = useCallback(
    (annotationId: string) => {
      const container = containerRef.current
      if (!container) return
      container
        .querySelectorAll('.cat-highlight-flash')
        .forEach((el) => el.classList.remove('cat-highlight-flash'))
      container.querySelectorAll('.cat-highlight').forEach((el) => {
        const ids = el.getAttribute('data-rule-ids')
        if (ids && ids.split(',').includes(annotationId)) {
          el.classList.add('cat-highlight-flash')
        }
      })
    },
    [containerRef],
  )

  // ── CSS Custom Highlight API flash (by range) ────────────────────

  const applyFlashRangeFallback = useCallback(
    (start: number, end: number) => {
      const editor = editorRef.current
      if (!editor) return
      editor.getEditorState().read(() => {
        const keys = $getNodeKeysInRange(start, end)
        for (const key of keys) {
          const domEl = editor.getElementByKey(key)
          if (domEl) domEl.classList.add('cat-highlight-flash')
        }
      })
    },
    [editorRef],
  )

  const applyFlashRange = useCallback(
    (start: number, end: number) => {
      const editor = editorRef.current
      const container = containerRef.current
      if (!editor || !container) return

      // Clear previous class-based flash
      container
        .querySelectorAll('.cat-highlight-flash')
        .forEach((el) => el.classList.remove('cat-highlight-flash'))

      // ── CSS Custom Highlight API (precise) ──
      if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
        const cssHighlights = (CSS as any).highlights as Map<string, unknown>
        cssHighlights.delete('cat-flash-range')

        editor.getEditorState().read(() => {
          const startPt = $globalOffsetToPoint(start)
          const endPt = $globalOffsetToPoint(end)
          if (!startPt || !endPt) return

          const startDom = editor.getElementByKey(startPt.key)
          const endDom = editor.getElementByKey(endPt.key)
          if (!startDom || !endDom) return

          const resolveTextNode = (
            el: HTMLElement,
            offset: number,
            type: 'text' | 'element',
          ): { node: Node; offset: number } | null => {
            if (type === 'text') {
              for (const child of el.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                  return {
                    node: child,
                    offset: Math.min(offset, child.textContent?.length ?? 0),
                  }
                }
              }
              return { node: el, offset: 0 }
            }
            return { node: el, offset: Math.min(offset, el.childNodes.length) }
          }

          const s = resolveTextNode(startDom, startPt.offset, startPt.type)
          const e = resolveTextNode(endDom, endPt.offset, endPt.type)
          if (!s || !e) return

          try {
            const range = new Range()
            range.setStart(s.node, s.offset)
            range.setEnd(e.node, e.offset)
            const hl = new (globalThis as any).Highlight(range)
            cssHighlights.set('cat-flash-range', hl)
          } catch {
            applyFlashRangeFallback(start, end)
          }
        })
        return
      }

      // ── Fallback: class-based (whole-node) ──
      applyFlashRangeFallback(start, end)
    },
    [editorRef, containerRef, applyFlashRangeFallback],
  )

  // ── Clear all flash state ────────────────────────────────────────

  const clearFlash = useCallback(() => {
    flashIdRef.current = null
    flashRangeRef.current = null
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current)
      flashTimerRef.current = null
    }
    if (flashEditUnregRef.current) {
      flashEditUnregRef.current()
      flashEditUnregRef.current = null
    }
    containerRef.current
      ?.querySelectorAll('.cat-highlight-flash')
      .forEach((el) => el.classList.remove('cat-highlight-flash'))

    if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
      ;(CSS as any).highlights.delete('cat-flash-range')
    }
  }, [containerRef])

  // ── Public API ───────────────────────────────────────────────────

  const flashHighlight = useCallback(
    (annotationId: string, durationMs = 5000) => {
      clearFlash()
      flashIdRef.current = annotationId
      applyFlashClass(annotationId)

      flashTimerRef.current = setTimeout(clearFlash, durationMs)

      const editor = editorRef.current
      if (editor) {
        flashEditUnregRef.current = editor.registerUpdateListener(
          ({ tags }) => {
            if (tags.has('cat-highlights')) {
              if (flashIdRef.current) {
                requestAnimationFrame(() =>
                  applyFlashClass(flashIdRef.current!),
                )
              }
              if (flashRangeRef.current) {
                const { start, end } = flashRangeRef.current
                requestAnimationFrame(() => applyFlashRange(start, end))
              }
              return
            }
            clearFlash()
          },
        )
      }
    },
    [editorRef, applyFlashClass, applyFlashRange, clearFlash],
  )

  const flashRange = useCallback(
    (start: number, end: number, durationMs = 5000) => {
      clearFlash()
      flashRangeRef.current = { start, end }
      applyFlashRange(start, end)

      flashTimerRef.current = setTimeout(clearFlash, durationMs)

      const editor = editorRef.current
      if (editor) {
        flashEditUnregRef.current = editor.registerUpdateListener(
          ({ tags }) => {
            if (tags.has('cat-highlights')) {
              if (flashRangeRef.current) {
                const { start: s, end: e } = flashRangeRef.current
                requestAnimationFrame(() => applyFlashRange(s, e))
              }
              return
            }
            clearFlash()
          },
        )
      }
    },
    [editorRef, applyFlashRange, clearFlash],
  )

  return { flashHighlight, flashRange, clearFlash }
}
