import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $isParentElementRTL } from '@lexical/selection'
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical'

import { NL_MARKER_PREFIX } from '../../cat-editor/constants'
import { $isHighlightNode } from '../../cat-editor/highlight-node'

import type { ElementNode, LexicalNode, PointType } from 'lexical'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check whether a node is non-editable in the DOM.
 *  Only HighlightNodes with contentEditable="false" qualify: NL markers,
 *  collapsed tags, quote-char nodes, and atomic keyword nodes.
 *  MentionNodes are handled by Lexical's built-in token mode. */
function $isNonEditableNode(node: LexicalNode): boolean {
  if (!$isHighlightNode(node)) return false
  if (node.__ruleIds.startsWith(NL_MARKER_PREFIX)) return true
  const types = node.__highlightTypes.split(',')
  if (types.includes('tag-collapsed')) return true
  if (types.includes('quote') && node.__displayText) return true
  if (types.includes('keyword-atomic')) return true
  return false
}

/** If a selection point sits on a non-editable node, return the nearest
 *  valid element-type gap position.  Returns null when no fix is needed. */
function $clampPointAwayFromNonEditable(point: PointType): {
  key: string
  offset: number
  type: 'text' | 'element'
} | null {
  if (point.type === 'element') return null

  const node = point.getNode()
  if (!$isNonEditableNode(node)) return null

  // Convert back to an element gap position around this child
  const parent = node.getParent()
  if (parent && 'getChildren' in parent) {
    const siblings = parent.getChildren()
    const idx = siblings.findIndex((s) => s.getKey() === node.getKey())
    if (idx >= 0) {
      const elemOffset = point.offset > 0 ? idx + 1 : idx
      return { key: parent.getKey(), offset: elemOffset, type: 'element' }
    }
  }
  return null
}

/** Find the landing position one step to the right of `startNode`. */
function $findNextEditable(
  startNode: LexicalNode,
): { key: string; offset: number; type: 'text' | 'element' } | null {
  // NL marker → cross to the next paragraph
  if (
    $isHighlightNode(startNode) &&
    startNode.__ruleIds.startsWith(NL_MARKER_PREFIX)
  ) {
    const paragraph = startNode.getParent()
    const nextParagraph = paragraph?.getNextSibling()
    if (nextParagraph && 'getChildren' in nextParagraph) {
      const first = (nextParagraph as ElementNode).getFirstChild()
      if (first && !$isNonEditableNode(first)) {
        return { key: first.getKey(), offset: 0, type: 'text' }
      }
      if (first) {
        return { key: nextParagraph.getKey(), offset: 0, type: 'element' }
      }
    }
    return null
  }

  // Immediate next sibling is editable
  const next = startNode.getNextSibling()
  if (next && !$isNonEditableNode(next)) {
    return { key: next.getKey(), offset: 0, type: 'text' }
  }

  // Element gap after startNode
  const paragraph = startNode.getParent()
  if (paragraph && 'getChildren' in paragraph) {
    const children = paragraph.getChildren()
    const idx = children.findIndex((s) => s.getKey() === startNode.getKey())
    if (idx >= 0) {
      return { key: paragraph.getKey(), offset: idx + 1, type: 'element' }
    }
  }
  return null
}

/** Find the landing position one step to the left of `startNode`. */
function $findPrevEditable(
  startNode: LexicalNode,
): { key: string; offset: number; type: 'text' | 'element' } | null {
  const prev = startNode.getPreviousSibling()

  if (prev && !$isNonEditableNode(prev)) {
    return {
      key: prev.getKey(),
      offset: prev.getTextContent().length,
      type: 'text',
    }
  }

  const paragraph = startNode.getParent()
  if (paragraph && 'getChildren' in paragraph) {
    const children = paragraph.getChildren()
    const idx = children.findIndex((s) => s.getKey() === startNode.getKey())
    if (idx >= 0) {
      return { key: paragraph.getKey(), offset: idx, type: 'element' }
    }
  }
  return null
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

/** Prevents the cursor from resting on non-editable nodes.
 *  - Intercepts Left/Right arrows to skip over CE=false nodes.
 *  - Watches selection changes (click, drag) and clamps back. */
export function NLMarkerNavigationPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    // ── Right arrow ──
    const unregRight = editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      (event) => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed())
          return false

        const isRTL = $isParentElementRTL(selection)
        const { anchor } = selection
        const node = anchor.getNode()

        let adjacentNode: LexicalNode | null = null
        if (isRTL) {
          if (anchor.type === 'text') {
            if (anchor.offset > 0) return false
            adjacentNode = node.getPreviousSibling()
          } else {
            const children = (node as ElementNode).getChildren()
            adjacentNode = children[anchor.offset - 1] ?? null
          }
        } else {
          if (anchor.type === 'text') {
            if (anchor.offset < node.getTextContent().length) return false
            adjacentNode = node.getNextSibling()
          } else {
            const children = (node as ElementNode).getChildren()
            adjacentNode = children[anchor.offset] ?? null
          }
        }

        if (adjacentNode && $isNonEditableNode(adjacentNode)) {
          const target = isRTL
            ? $findPrevEditable(adjacentNode)
            : $findNextEditable(adjacentNode)
          if (target) {
            selection.anchor.set(target.key, target.offset, target.type)
            selection.focus.set(target.key, target.offset, target.type)
            event.preventDefault()
            return true
          }
          return false
        }

        if ($isNonEditableNode(node)) {
          const target = isRTL
            ? $findPrevEditable(node)
            : $findNextEditable(node)
          if (target) {
            selection.anchor.set(target.key, target.offset, target.type)
            selection.focus.set(target.key, target.offset, target.type)
            event.preventDefault()
            return true
          }
          return false
        }

        return false
      },
      COMMAND_PRIORITY_HIGH,
    )

    // ── Left arrow ──
    const unregLeft = editor.registerCommand(
      KEY_ARROW_LEFT_COMMAND,
      (event) => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed())
          return false

        const isRTL = $isParentElementRTL(selection)
        const { anchor } = selection
        const node = anchor.getNode()

        let adjacentNode: LexicalNode | null = null
        if (isRTL) {
          if (anchor.type === 'text') {
            if (anchor.offset < node.getTextContent().length) return false
            adjacentNode = node.getNextSibling()
          } else {
            const children = (node as ElementNode).getChildren()
            adjacentNode = children[anchor.offset] ?? null
          }
        } else {
          if (anchor.type === 'text') {
            if (anchor.offset > 0) return false
            adjacentNode = node.getPreviousSibling()
          } else {
            const children = (node as ElementNode).getChildren()
            adjacentNode = children[anchor.offset - 1] ?? null
          }
        }

        if (adjacentNode && $isNonEditableNode(adjacentNode)) {
          const target = isRTL
            ? $findNextEditable(adjacentNode)
            : $findPrevEditable(adjacentNode)
          if (target) {
            selection.anchor.set(target.key, target.offset, target.type)
            selection.focus.set(target.key, target.offset, target.type)
            event.preventDefault()
            return true
          }
          return false
        }

        if ($isNonEditableNode(node)) {
          const target = isRTL
            ? $findNextEditable(node)
            : $findPrevEditable(node)
          if (target) {
            selection.anchor.set(target.key, target.offset, target.type)
            selection.focus.set(target.key, target.offset, target.type)
            event.preventDefault()
            return true
          }
          return false
        }

        return false
      },
      COMMAND_PRIORITY_HIGH,
    )

    // ── Selection change: clamp clicks/drags on non-editable nodes ──
    const unregSel = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return false

        const anchorFix = $clampPointAwayFromNonEditable(selection.anchor)
        const focusFix = $clampPointAwayFromNonEditable(selection.focus)

        if (anchorFix) {
          selection.anchor.set(anchorFix.key, anchorFix.offset, anchorFix.type)
        }
        if (focusFix) {
          selection.focus.set(focusFix.key, focusFix.offset, focusFix.type)
        }

        return false
      },
      COMMAND_PRIORITY_HIGH,
    )

    return () => {
      unregRight()
      unregLeft()
      unregSel()
    }
  }, [editor])

  return null
}
