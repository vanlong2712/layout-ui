import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $addUpdateTag,
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_RIGHT_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical'
import { useCallback, useEffect, useRef } from 'react'

import { computeHighlightSegments } from './compute-segments'
import { CODEPOINT_DISPLAY_MAP, NL_MARKER_PREFIX } from './constants'
import { $createHighlightNode, $isHighlightNode } from './highlight-node'
import { $globalOffsetToPoint, $pointToGlobalOffset } from './selection-helpers'

import type {
  ElementNode,
  LexicalEditor,
  LexicalNode,
  PointType,
} from 'lexical'
import type { MooRule, RuleAnnotation } from './types'

// ─── Highlights Plugin ────────────────────────────────────────────────────────

interface HighlightsPluginProps {
  rules: Array<MooRule>
  annotationMapRef: React.MutableRefObject<Map<string, RuleAnnotation>>
}

export function HighlightsPlugin({
  rules,
  annotationMapRef,
}: HighlightsPluginProps) {
  const [editor] = useLexicalComposerContext()
  const rafRef = useRef<number | null>(null)

  const applyHighlights = useCallback(() => {
    editor.update(
      () => {
        // Tag so our own listener skips this update
        $addUpdateTag('cat-highlights')

        const root = $getRoot()

        // 1. Collect plain text content (flatten paragraphs).
        //    Skip line-break marker nodes (prefixed __nl-) so that
        //    the ↩ display symbol doesn't compound on each pass.
        const paragraphs = root.getChildren()
        const lines: Array<string> = []
        for (const p of paragraphs) {
          let lineText = ''
          if ('getChildren' in p) {
            for (const child of (p as ElementNode).getChildren()) {
              if (
                $isHighlightNode(child) &&
                child.__ruleIds.startsWith(NL_MARKER_PREFIX)
              ) {
                continue
              }
              lineText += child.getTextContent()
            }
          } else {
            lineText = p.getTextContent()
          }
          lines.push(lineText)
        }
        const fullText = lines.join('\n')

        // 2. Compute highlight segments (supports nesting)
        const segments = computeHighlightSegments(fullText, rules)

        // 3. Update annotation map for popover
        const newMap = new Map<string, RuleAnnotation>()
        for (const seg of segments) {
          for (const ann of seg.annotations) {
            newMap.set(ann.id, ann)
          }
        }
        annotationMapRef.current = newMap

        // ── Save selection as global offsets before rebuilding ──
        const prevSelection = $getSelection()
        let savedAnchor: number | null = null
        let savedFocus: number | null = null
        if ($isRangeSelection(prevSelection)) {
          savedAnchor = $pointToGlobalOffset(
            prevSelection.anchor.key,
            prevSelection.anchor.offset,
          )
          savedFocus = $pointToGlobalOffset(
            prevSelection.focus.key,
            prevSelection.focus.offset,
          )
        }

        // 4. Rebuild the content tree with highlights
        root.clear()

        if (fullText.length === 0) {
          const p = $createParagraphNode()
          p.append($createTextNode(''))
          root.append(p)
          return
        }

        const textLines = fullText.split('\n')
        let globalOffset = 0

        for (const line of textLines) {
          const paragraph = $createParagraphNode()
          const lineStart = globalOffset
          const lineEnd = globalOffset + line.length

          // Filter segments within this line
          const lineSegments = segments.filter(
            (s) => s.start < lineEnd && s.end > lineStart,
          )

          let pos = lineStart
          for (const seg of lineSegments) {
            const sStart = Math.max(seg.start, lineStart)
            const sEnd = Math.min(seg.end, lineEnd)

            // Plain text before highlight
            if (sStart > pos) {
              paragraph.append($createTextNode(fullText.slice(pos, sStart)))
            }

            // Highlighted text — carries all annotation types & IDs
            // Glossary annotations include their label in the CSS type
            // so each label gets a unique highlight class.
            const types = [
              ...new Set(
                seg.annotations.map((a) =>
                  a.type === 'glossary' ? `glossary-${a.data.label}` : a.type,
                ),
              ),
            ].join(',')
            const ids = seg.annotations.map((a) => a.id).join(',')

            // If segment contains a tag annotation, pass its displayText
            const tagAnn = seg.annotations.find((a) => a.type === 'tag')
            const displayText =
              tagAnn?.type === 'tag' ? tagAnn.data.displayText : undefined
            paragraph.append(
              $createHighlightNode(
                fullText.slice(sStart, sEnd),
                types,
                ids,
                displayText,
              ),
            )

            pos = sEnd
          }

          // Remaining plain text after last highlight
          if (pos < lineEnd) {
            paragraph.append($createTextNode(fullText.slice(pos, lineEnd)))
          }

          // Line-break indicator: \n sits at lineEnd in fullText but is a
          // paragraph boundary in Lexical — it never appears as inline text.
          // Append a visible ↩ symbol with a __nl- prefixed ruleId so we
          // can skip it when collecting text on the next pass.
          const nlPos = lineEnd
          if (nlPos < fullText.length && fullText[nlPos] === '\n') {
            const nlSegments = segments.filter(
              (s) => s.start <= nlPos && s.end > nlPos,
            )
            if (nlSegments.length > 0) {
              const nlAnns = nlSegments.flatMap((s) => s.annotations)
              const types = [
                ...new Set(
                  nlAnns.map((a) =>
                    a.type === 'glossary' ? `glossary-${a.data.label}` : a.type,
                  ),
                ),
              ].join(',')
              const ids = nlAnns.map((a) => a.id).join(',')
              const symbol = CODEPOINT_DISPLAY_MAP[0x000a]
              // Ensure there's a text node before the NL marker so the
              // cursor has a landing spot (NL markers are contentEditable=false)
              if (paragraph.getChildrenSize() === 0) {
                paragraph.append($createTextNode(''))
              }
              paragraph.append(
                $createHighlightNode(symbol, types, NL_MARKER_PREFIX + ids),
              )
            }
          }

          // Ensure paragraph has at least one child
          if (paragraph.getChildrenSize() === 0) {
            paragraph.append($createTextNode(''))
          }

          root.append(paragraph)
          globalOffset = lineEnd + 1 // +1 for \n
        }

        // ── Restore selection at the equivalent position ──
        if (savedAnchor !== null && savedFocus !== null) {
          const anchorPt = $globalOffsetToPoint(savedAnchor)
          const focusPt = $globalOffsetToPoint(savedFocus)
          if (anchorPt && focusPt) {
            const sel = $createRangeSelection()
            sel.anchor.set(anchorPt.key, anchorPt.offset, anchorPt.type)
            sel.focus.set(focusPt.key, focusPt.offset, focusPt.type)
            $setSelection(sel)
          }
        }
      },
      { tag: 'historic' },
    )
  }, [editor, rules, annotationMapRef])

  // Run on mount and when rules change
  useEffect(() => {
    applyHighlights()
  }, [applyHighlights])

  // Re-run highlights after any content change (typing, paste, undo, …).
  // Skip our own 'cat-highlights' updates to avoid infinite loops.
  // The 'historic' tag keeps recomputation out of the undo stack.
  useEffect(() => {
    const unregister = editor.registerUpdateListener(({ tags }) => {
      if (tags.has('cat-highlights')) return
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        applyHighlights()
      })
    })
    return () => {
      unregister()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [editor, applyHighlights])

  return null
}

// ─── Editor Ref Plugin ────────────────────────────────────────────────────────

/** Tracks the editor instance and persists the last known selection so that
 *  `insertText` works even after the editor loses focus. */
export function EditorRefPlugin({
  editorRef,
  savedSelectionRef,
}: {
  editorRef: React.MutableRefObject<LexicalEditor | null>
  savedSelectionRef: React.MutableRefObject<{
    anchor: number
    focus: number
  } | null>
}) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    editorRef.current = editor
  }, [editor, editorRef])

  // Persist selection on every selection change so we can restore it later
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const sel = $getSelection()
        if ($isRangeSelection(sel)) {
          savedSelectionRef.current = {
            anchor: $pointToGlobalOffset(sel.anchor.key, sel.anchor.offset),
            focus: $pointToGlobalOffset(sel.focus.key, sel.focus.offset),
          }
        }
      })
    })
  }, [editor, savedSelectionRef])
  return null
}

// ─── NL Marker Navigation Guard ─────────────────────────────────────────────

/** Helper: given a selection point, check if it sits on or right-after
 *  an NL-marker node and return a corrected position, or null if fine. */
function $clampPointAwayFromNlMarker(point: PointType): {
  key: string
  offset: number
  type: 'text' | 'element'
} | null {
  const node = point.getNode()

  // Point directly on an NL-marker HighlightNode
  if ($isHighlightNode(node) && node.__ruleIds.startsWith(NL_MARKER_PREFIX)) {
    const prev = node.getPreviousSibling()
    if (prev) {
      return {
        key: prev.getKey(),
        offset: prev.getTextContent().length,
        type: 'text',
      }
    }
    const parent = node.getParent()
    if (parent) {
      return { key: parent.getKey(), offset: 0, type: 'element' }
    }
  }

  // Point on an element (paragraph) at a child-index at/past NL marker
  if (point.type === 'element' && 'getChildren' in node) {
    const children = node.getChildren()
    for (const idx of [point.offset - 1, point.offset]) {
      const child = children[idx] as LexicalNode | undefined
      if (
        child &&
        $isHighlightNode(child) &&
        child.__ruleIds.startsWith(NL_MARKER_PREFIX)
      ) {
        const prev = child.getPreviousSibling()
        if (prev) {
          return {
            key: prev.getKey(),
            offset: prev.getTextContent().length,
            type: 'text',
          }
        }
        return { key: node.getKey(), offset: 0, type: 'element' }
      }
    }
  }

  return null
}

/** Prevents the cursor from ever resting on or after an NL-marker node.
 *  - Intercepts Right arrow at end-of-line to jump to next paragraph.
 *  - Watches every selection change (mouse click, drag, keyboard) and
 *    clamps the cursor back when it lands on an NL marker. */
export function NLMarkerNavigationPlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    // 1. Right arrow: when cursor is right before an NL-marker, skip it
    //    and move to the start of the next paragraph.
    const unregArrow = editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      (event) => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed())
          return false

        const { anchor } = selection
        const node = anchor.getNode()

        // Check if the next sibling of the current node is an NL marker
        let nextNode: LexicalNode | null = null
        if (anchor.type === 'text') {
          // Only trigger when cursor is at the end of the text node
          if (anchor.offset < node.getTextContent().length) return false
          nextNode = node.getNextSibling()
        } else {
          const children = (node as ElementNode).getChildren()
          nextNode = children[anchor.offset] ?? null
        }

        if (
          nextNode &&
          $isHighlightNode(nextNode) &&
          nextNode.__ruleIds.startsWith(NL_MARKER_PREFIX)
        ) {
          // Skip the NL marker — move to start of next paragraph
          const paragraph = nextNode.getParent()
          if (!paragraph) return false
          const nextParagraph = paragraph.getNextSibling()
          if (nextParagraph && 'getChildren' in nextParagraph) {
            const firstChild = (nextParagraph as ElementNode).getFirstChild()
            if (firstChild) {
              selection.anchor.set(firstChild.getKey(), 0, 'text')
              selection.focus.set(firstChild.getKey(), 0, 'text')
            } else {
              selection.anchor.set(nextParagraph.getKey(), 0, 'element')
              selection.focus.set(nextParagraph.getKey(), 0, 'element')
            }
          }
          // No next paragraph — stay put (end of document)
          event.preventDefault()
          return true
        }

        return false
      },
      COMMAND_PRIORITY_HIGH,
    )

    // 2. Selection change: catch mouse clicks/drags that land on NL markers
    const unregSel = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return false

        const anchorFix = $clampPointAwayFromNlMarker(selection.anchor)
        const focusFix = $clampPointAwayFromNlMarker(selection.focus)

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
      unregArrow()
      unregSel()
    }
  }, [editor])
  return null
}
