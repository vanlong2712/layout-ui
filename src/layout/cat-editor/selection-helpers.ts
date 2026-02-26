import { $getRoot } from 'lexical'

import { NL_MARKER_PREFIX } from './constants'
import { $isHighlightNode } from './highlight-node'

import type { ElementNode } from 'lexical'

// ─── Selection ↔ global-offset helpers ────────────────────────────────────────

/** Map a Lexical selection point (nodeKey + offset) to a global char offset,
 *  skipping NL-marker indicator nodes. */
export function $pointToGlobalOffset(nodeKey: string, offset: number): number {
  const root = $getRoot()
  const paragraphs = root.getChildren()
  let global = 0

  for (let pi = 0; pi < paragraphs.length; pi++) {
    if (pi > 0) global += 1 // \n between paragraphs
    const p = paragraphs[pi]

    // Selection sits on the paragraph element itself (e.g. empty paragraph)
    if (p.getKey() === nodeKey) {
      if ('getChildren' in p) {
        const children = (p as ElementNode).getChildren()
        let childChars = 0
        for (let ci = 0; ci < Math.min(offset, children.length); ci++) {
          const child = children[ci]
          if (
            $isHighlightNode(child) &&
            child.__ruleIds.startsWith(NL_MARKER_PREFIX)
          )
            continue
          childChars += child.getTextContent().length
        }
        return global + childChars
      }
      return global
    }

    if (!('getChildren' in p)) continue
    for (const child of (p as ElementNode).getChildren()) {
      const isNlMarker =
        $isHighlightNode(child) && child.__ruleIds.startsWith(NL_MARKER_PREFIX)

      if (child.getKey() === nodeKey) {
        // If cursor landed on a NL-marker node, clamp to end-of-line
        // (= current global offset, which is past all real text in this para)
        if (isNlMarker) return global
        return global + offset
      }

      if (isNlMarker) continue
      global += child.getTextContent().length
    }
  }
  return global
}

/** Map a global character offset back to a Lexical node key + offset. */
export function $globalOffsetToPoint(
  target: number,
): { key: string; offset: number; type: 'text' | 'element' } | null {
  const root = $getRoot()
  const paragraphs = root.getChildren()
  let remaining = target

  for (let pi = 0; pi < paragraphs.length; pi++) {
    if (pi > 0) {
      if (remaining <= 0) {
        const p = paragraphs[pi]
        if ('getChildren' in p) {
          for (const child of (p as ElementNode).getChildren()) {
            if (
              $isHighlightNode(child) &&
              child.__ruleIds.startsWith(NL_MARKER_PREFIX)
            )
              continue
            return { key: child.getKey(), offset: 0, type: 'text' }
          }
        }
        return { key: paragraphs[pi].getKey(), offset: 0, type: 'element' }
      }
      remaining -= 1 // \n
    }

    const p = paragraphs[pi]
    if (!('getChildren' in p)) continue

    for (const child of (p as ElementNode).getChildren()) {
      if (
        $isHighlightNode(child) &&
        child.__ruleIds.startsWith(NL_MARKER_PREFIX)
      )
        continue
      const len = child.getTextContent().length
      if (remaining <= len) {
        return { key: child.getKey(), offset: remaining, type: 'text' }
      }
      remaining -= len
    }
  }

  // Fallback: end of last text node
  for (let pi = paragraphs.length - 1; pi >= 0; pi--) {
    const p = paragraphs[pi]
    if ('getChildren' in p) {
      const children = (p as ElementNode).getChildren()
      for (let ci = children.length - 1; ci >= 0; ci--) {
        const child = children[ci]
        if (
          $isHighlightNode(child) &&
          child.__ruleIds.startsWith(NL_MARKER_PREFIX)
        )
          continue
        return {
          key: child.getKey(),
          offset: child.getTextContent().length,
          type: 'text',
        }
      }
    }
  }

  return null
}
