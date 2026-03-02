import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'

import { NL_MARKER_PREFIX } from '../constants'

import type { PopoverState, RuleAnnotation } from '../types'

// ─── usePopoverHover ─────────────────────────────────────────────────────────
// Encapsulates the popover show/hide logic, mouse event tracking, and
// link/mention click handling.

export const PopoverHoverOptionsSchema = z.object({
  annotationMapRef:
    z.custom<React.MutableRefObject<Map<string, RuleAnnotation>>>(),
  openLinksOnClick: z.boolean(),
  onLinkClick: z.custom<(url: string) => void>().optional(),
  onMentionClick: z
    .custom<(userId: string, userName: string) => void>()
    .optional(),
})
export type PopoverHoverOptions = z.infer<typeof PopoverHoverOptionsSchema>

export const PopoverHoverReturnSchema = z.object({
  popoverState: z.custom<PopoverState>(),
  scheduleHide: z.custom<() => void>(),
  cancelHide: z.custom<() => void>(),
  isOverPopoverRef: z.custom<React.MutableRefObject<boolean>>(),
})
export type PopoverHoverReturn = z.infer<typeof PopoverHoverReturnSchema>

export function usePopoverHover(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: PopoverHoverOptions,
): PopoverHoverReturn {
  const { annotationMapRef, openLinksOnClick, onLinkClick, onMentionClick } =
    options

  const [popoverState, setPopoverState] = useState<PopoverState>({
    visible: false,
    x: 0,
    y: 0,
    ruleIds: [],
  })

  const isOverHighlightRef = useRef(false)
  const isOverPopoverRef = useRef(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Hover scheduling ─────────────────────────────────────────────

  const scheduleHide = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    dismissTimerRef.current = setTimeout(() => {
      if (!isOverHighlightRef.current && !isOverPopoverRef.current) {
        setPopoverState((prev) => ({ ...prev, visible: false }))
      }
    }, 400)
  }, [])

  const cancelHide = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
  }, [])

  // ── Mouse hover over highlights ──────────────────────────────────

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.cat-highlight')
      if (!target) {
        if (isOverHighlightRef.current) {
          isOverHighlightRef.current = false
          scheduleHide()
        }
        return
      }

      const ruleIdsAttr = target.getAttribute('data-rule-ids')
      if (!ruleIdsAttr) return

      const ruleIds = [
        ...new Set(
          ruleIdsAttr
            .split(',')
            .map((id) =>
              id.startsWith(NL_MARKER_PREFIX)
                ? id.slice(NL_MARKER_PREFIX.length)
                : id,
            ),
        ),
      ]

      isOverHighlightRef.current = true
      cancelHide()

      const rect = target.getBoundingClientRect()
      setPopoverState({
        visible: true,
        x: rect.left,
        y: rect.bottom,
        anchorRect: {
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        },
        ruleIds,
      })
    }

    const handleMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null
      if (related?.closest('.cat-highlight')) return
      isOverHighlightRef.current = false
      scheduleHide()
    }

    container.addEventListener('mouseover', handleMouseOver)
    container.addEventListener('mouseout', handleMouseOut)

    return () => {
      container.removeEventListener('mouseover', handleMouseOver)
      container.removeEventListener('mouseout', handleMouseOut)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [containerRef, scheduleHide, cancelHide])

  // ── Click handling for links / mentions ──────────────────────────

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleClick = (e: MouseEvent) => {
      // Link highlights
      if (openLinksOnClick) {
        const highlightTarget = (e.target as HTMLElement).closest(
          '.cat-highlight',
        )
        if (highlightTarget) {
          const ruleIdsAttr = highlightTarget.getAttribute('data-rule-ids')
          if (ruleIdsAttr) {
            const ids = ruleIdsAttr.split(',')
            for (const id of ids) {
              const ann = annotationMapRef.current.get(id)
              if (!ann) continue
              if (ann.type === 'link') {
                e.preventDefault()
                if (onLinkClick) {
                  onLinkClick(ann.data.url)
                } else {
                  window.open(ann.data.url, '_blank', 'noopener,noreferrer')
                }
                return
              }
            }
          }
        }
      }

      // Mention nodes
      const mentionTarget = (e.target as HTMLElement).closest(
        '.cat-mention-node',
      )
      if (mentionTarget) {
        const mentionId = mentionTarget.getAttribute('data-mention-id')
        const mentionName = mentionTarget.getAttribute('data-mention-name')
        if (mentionId && mentionName) {
          e.preventDefault()
          onMentionClick?.(mentionId, mentionName)
          return
        }
      }
    }

    container.addEventListener('click', handleClick)
    return () => {
      container.removeEventListener('click', handleClick)
    }
  }, [
    containerRef,
    openLinksOnClick,
    onLinkClick,
    onMentionClick,
    annotationMapRef,
  ])

  return { popoverState, scheduleHide, cancelHide, isOverPopoverRef }
}
