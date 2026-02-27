import { $getRoot } from 'lexical'

import { NL_MARKER_PREFIX } from './constants'
import { $isHighlightNode } from './highlight-node'
import { $isMentionNode } from './mention-node'

import type { ElementNode, NodeKey } from 'lexical'
import type { HighlightNode } from './highlight-node'

// ─── Text content ─────────────────────────────────────────────────────────────

/** Return the plain-text content of the editor, joining paragraphs with a
 *  single `\n`.  This is consistent with the global offset system used by
 *  `$pointToGlobalOffset` / `$globalOffsetToPoint` (which accounts for +1
 *  per paragraph boundary).  Must be called inside `editor.read()` or
 *  `editor.update()`.  Lexical's built-in `$getRoot().getTextContent()` uses
 *  `\n\n` between block elements, which breaks offset calculations. */
export function $getPlainText(): string {
  const root = $getRoot()
  return root
    .getChildren()
    .map((p) => p.getTextContent())
    .join('\n')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true for highlight nodes whose DOM has contentEditable="false":
 *  collapsed tags, quote-char nodes, and atomic keyword nodes.  These must
 *  be skipped when mapping global offsets to Lexical selection points. */
function $isCEFalseToken(node: HighlightNode): boolean {
  const types = node.__highlightTypes.split(',')
  if (types.includes('tag-collapsed')) return true
  if (types.includes('quote') && node.__displayText) return true
  if (types.includes('keyword-atomic')) return true
  return false
}

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

        // Token mode nodes (collapsed tags, quotes, atomic keywords) may
        // have a DOM text (e.g. ZWS, 1 char) that differs from the model
        // text (e.g. `<b>`, 3 chars).  Map DOM offsets:
        //   offset 0  → before token  → global + 0
        //   offset >0 → after token   → global + full model length
        if ($isHighlightNode(child) && child.getMode() === 'token') {
          return global + (offset > 0 ? child.getTextContent().length : 0)
        }

        // MentionNode is a CEF token — cursor at 0 means before, >0 means after.
        if ($isMentionNode(child)) {
          return global + (offset > 0 ? child.getTextContent().length : 0)
        }

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

    const allChildren = (p as ElementNode).getChildren()

    for (let ci = 0; ci < allChildren.length; ci++) {
      const child = allChildren[ci]
      if (
        $isHighlightNode(child) &&
        child.__ruleIds.startsWith(NL_MARKER_PREFIX)
      )
        continue
      const len = child.getTextContent().length

      // CE=false token: cursor cannot land on it.
      // If remaining ≤ 0, the target is BEFORE this node —
      // return an element-type position at this child's index.
      if ($isHighlightNode(child) && $isCEFalseToken(child)) {
        if (remaining <= 0) {
          return { key: p.getKey(), offset: ci, type: 'element' }
        }
        remaining -= len
        continue
      }

      // MentionNode is CE=false token — cursor cannot enter it.
      if ($isMentionNode(child)) {
        if (remaining <= 0) {
          return { key: p.getKey(), offset: ci, type: 'element' }
        }
        remaining -= len
        continue
      }

      // Regular text node
      if (remaining <= len) {
        return {
          key: child.getKey(),
          offset: Math.max(0, remaining),
          type: 'text',
        }
      }
      remaining -= len
    }

    // After all children: remaining ≤ 0 means the target falls within
    // this paragraph.  Return element position after the last real child
    // (just before NL markers, if any).
    if (remaining <= 0) {
      let afterIdx = allChildren.length
      for (let ci = allChildren.length - 1; ci >= 0; ci--) {
        const c = allChildren[ci]
        if ($isHighlightNode(c) && c.__ruleIds.startsWith(NL_MARKER_PREFIX)) {
          afterIdx = ci
        } else {
          break
        }
      }
      return { key: p.getKey(), offset: afterIdx, type: 'element' }
    }
  }

  // Fallback: end of last paragraph
  for (let pi = paragraphs.length - 1; pi >= 0; pi--) {
    const p = paragraphs[pi]
    if ('getChildren' in p) {
      const allChildren = (p as ElementNode).getChildren()
      // Try to find last editable child
      for (let ci = allChildren.length - 1; ci >= 0; ci--) {
        const child = allChildren[ci]
        if (
          $isHighlightNode(child) &&
          child.__ruleIds.startsWith(NL_MARKER_PREFIX)
        )
          continue
        if ($isHighlightNode(child) && $isCEFalseToken(child)) continue
        if ($isMentionNode(child)) continue
        return {
          key: child.getKey(),
          offset: child.getTextContent().length,
          type: 'text',
        }
      }
      // All CE=false: element position after last real child
      let afterIdx = allChildren.length
      for (let ci = allChildren.length - 1; ci >= 0; ci--) {
        const c = allChildren[ci]
        if ($isHighlightNode(c) && c.__ruleIds.startsWith(NL_MARKER_PREFIX)) {
          afterIdx = ci
        } else {
          break
        }
      }
      return { key: p.getKey(), offset: afterIdx, type: 'element' }
    }
  }

  return null
}

// ─── Range → node-key mapping ─────────────────────────────────────────────────

/** Walk the Lexical tree and return the keys of all nodes whose global
 *  offset range `[nodeStart, nodeEnd)` overlaps `[start, end)`.
 *  Must be called inside `editor.getEditorState().read()`. */
export function $getNodeKeysInRange(
  start: number,
  end: number,
): Array<NodeKey> {
  const keys: Array<NodeKey> = []
  const root = $getRoot()
  const paragraphs = root.getChildren()
  let globalOffset = 0

  for (let pi = 0; pi < paragraphs.length; pi++) {
    if (pi > 0) globalOffset += 1 // \n between paragraphs
    const p = paragraphs[pi]
    if (!('getChildren' in p)) continue

    for (const child of (p as ElementNode).getChildren()) {
      if (
        $isHighlightNode(child) &&
        child.__ruleIds.startsWith(NL_MARKER_PREFIX)
      )
        continue

      const textLen = child.getTextContent().length
      const nodeStart = globalOffset
      const nodeEnd = globalOffset + textLen

      // Overlap test: [nodeStart, nodeEnd) ∩ [start, end) ≠ ∅
      if (nodeStart < end && nodeEnd > start) {
        keys.push(child.getKey())
      }

      globalOffset = nodeEnd
    }

    // Early exit: past the requested range
    if (globalOffset >= end) break
  }

  return keys
}
