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
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  PASTE_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical'
import { useCallback, useEffect, useRef } from 'react'

import { computeHighlightSegments } from './compute-segments'
import {
  CODEPOINT_DISPLAY_MAP,
  NL_MARKER_PREFIX,
  setCodepointOverrides,
} from './constants'
import { $createHighlightNode, $isHighlightNode } from './highlight-node'
import {
  $createMentionNode,
  $isMentionNode,
  getMentionPattern,
} from './mention-node'
import { $globalOffsetToPoint, $pointToGlobalOffset } from './selection-helpers'

import type {
  ElementNode,
  LexicalEditor,
  LexicalNode,
  PointType,
} from 'lexical'
import type { IMentionRule, ITagRule, MooRule, RuleAnnotation } from './types'

/** Saved mention position recorded during the text-collection phase. */
interface SavedMention {
  /** Global character offset where this mention starts */
  start: number
  /** Global character offset where this mention ends */
  end: number
  /** Data needed to recreate the MentionNode */
  mentionId: string
  mentionName: string
  text: string
}

// ─── Highlights Plugin ────────────────────────────────────────────────────────

interface HighlightsPluginProps {
  rules: Array<MooRule>
  annotationMapRef: React.MutableRefObject<Map<string, RuleAnnotation>>
  codepointDisplayMap?: Record<number, string>
}

export function HighlightsPlugin({
  rules,
  annotationMapRef,
  codepointDisplayMap,
}: HighlightsPluginProps) {
  const [editor] = useLexicalComposerContext()
  const rafRef = useRef<number | null>(null)

  const applyHighlights = useCallback(() => {
    // Sync code-point display overrides from the editor-level prop
    setCodepointOverrides(codepointDisplayMap)

    // Check focus BEFORE editor.update() — if the editor doesn't own
    // focus we must not restore (or leave) a selection, otherwise
    // Lexical's DOM reconciliation will move the browser caret back
    // into the editor, stealing focus from external inputs like the
    // search field.
    const editorElement = editor.getRootElement()
    const editorHasFocus =
      editorElement != null &&
      editorElement.contains(editorElement.ownerDocument.activeElement)

    editor.update(
      () => {
        // Tag so our own listener skips this update
        $addUpdateTag('cat-highlights')

        const root = $getRoot()

        // 1. Collect plain text content (flatten paragraphs).
        //    Skip line-break marker nodes (prefixed __nl-) so that
        //    the ↩ display symbol doesn't compound on each pass.
        //    Record MentionNode positions so they survive the rebuild.
        const paragraphs = root.getChildren()
        const lines: Array<string> = []
        const savedMentions: Array<SavedMention> = []
        let collectOffset = 0

        for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
          const p = paragraphs[pIdx]
          let lineText = ''
          if ('getChildren' in p) {
            for (const child of (p as ElementNode).getChildren()) {
              if (
                $isHighlightNode(child) &&
                child.__ruleIds.startsWith(NL_MARKER_PREFIX)
              ) {
                continue
              }
              if ($isMentionNode(child)) {
                const text = child.getTextContent()
                savedMentions.push({
                  start: collectOffset + lineText.length,
                  end: collectOffset + lineText.length + text.length,
                  mentionId: child.__mentionId,
                  mentionName: child.__mentionName,
                  text,
                })
              }
              lineText += child.getTextContent()
            }
          } else {
            lineText = p.getTextContent()
          }
          lines.push(lineText)
          collectOffset += lineText.length + 1 // +1 for \n between paragraphs
        }
        const fullText = lines.join('\n')

        // 1b. Detect mention patterns in the text that aren't already
        //     MentionNodes.  This handles pasted text, initial text, or
        //     programmatic insertions containing the mention pattern.
        const mentionRule = rules.find(
          (r): r is IMentionRule => r.type === 'mention',
        )
        if (mentionRule) {
          const pattern = getMentionPattern()
          let match: RegExpExecArray | null
          while ((match = pattern.exec(fullText)) !== null) {
            const matchStart = match.index
            const matchEnd = matchStart + match[0].length
            const matchId = match[1]

            // Skip if already tracked as a MentionNode
            const alreadySaved = savedMentions.some(
              (m) => m.start === matchStart && m.end === matchEnd,
            )
            if (alreadySaved) continue

            // Resolve user name from the mention rule's user list
            const user = mentionRule.users.find((u) => u.id === matchId)
            if (user) {
              savedMentions.push({
                start: matchStart,
                end: matchEnd,
                mentionId: user.id,
                mentionName: user.name,
                text: match[0],
              })
            }
          }
        }

        // 2. Compute highlight segments (supports nesting).
        //    Replace mention ranges with placeholder chars so that
        //    highlight patterns (e.g. tag pattern matching `{id}`)
        //    don't produce segments inside mention model text.
        let segmentText = fullText
        for (let mi = savedMentions.length - 1; mi >= 0; mi--) {
          const m = savedMentions[mi]
          segmentText =
            segmentText.slice(0, m.start) +
            '\x01'.repeat(m.end - m.start) +
            segmentText.slice(m.end)
        }
        const segments = computeHighlightSegments(segmentText, rules)

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

        // 4. Rebuild the content tree with highlights,
        //    preserving MentionNodes at their original positions.
        root.clear()

        if (fullText.length === 0) {
          const p = $createParagraphNode()
          p.append($createTextNode(''))
          root.append(p)
          return
        }

        // Track emitted mentions to prevent duplicates when a mention
        // spans multiple segment/gap ranges.
        const emittedMentionStarts = new Set<number>()

        /** Append nodes for a text range, splitting around any
         *  saved MentionNodes that overlap the range.
         *  `makeNode` creates either a TextNode or HighlightNode
         *  for the non-mention portions. */
        const appendWithMentions = (
          paragraph: ElementNode,
          rangeStart: number,
          rangeEnd: number,
          makeNode: (text: string) => LexicalNode,
        ) => {
          // Collect mentions that overlap this range (skip already-emitted)
          const overlapping = savedMentions.filter(
            (m) =>
              m.start < rangeEnd &&
              m.end > rangeStart &&
              !emittedMentionStarts.has(m.start),
          )
          if (overlapping.length === 0) {
            // No mentions — emit the full range with the provided factory
            const text = fullText.slice(rangeStart, rangeEnd)
            if (text.length > 0) {
              paragraph.append(makeNode(text))
            }
            return
          }

          // Sort mentions by start offset
          overlapping.sort((a, b) => a.start - b.start)
          let cursor = rangeStart

          for (const m of overlapping) {
            const mStart = Math.max(m.start, rangeStart)
            const mEnd = Math.min(m.end, rangeEnd)

            // Text before this mention
            if (mStart > cursor) {
              const beforeText = fullText.slice(cursor, mStart)
              if (beforeText.length > 0) {
                paragraph.append(makeNode(beforeText))
              }
            }

            // The mention node itself
            paragraph.append(
              $createMentionNode(m.mentionId, m.mentionName, m.text),
            )
            emittedMentionStarts.add(m.start)
            cursor = mEnd
          }

          // Text after the last mention
          if (cursor < rangeEnd) {
            const afterText = fullText.slice(cursor, rangeEnd)
            if (afterText.length > 0) {
              paragraph.append(makeNode(afterText))
            }
          }
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
              appendWithMentions(paragraph, pos, sStart, (text) =>
                $createTextNode(text),
              )
            }

            // Detect collapsed-tag state early so it can influence types.
            const tagAnn = seg.annotations.find((a) => a.type === 'tag')
            const tagRule = rules.find((r): r is ITagRule => r.type === 'tag')
            const tagsCollapsed = !!tagRule?.collapsed
            // Decide if *this specific* tag should be collapsed.
            // When collapseScope is 'html-only', only HTML tags collapse.
            const collapseScope = tagRule?.collapseScope ?? 'all'
            const thisTagCollapsed =
              tagsCollapsed &&
              !!tagAnn &&
              (collapseScope === 'all' || tagAnn.data.isHtml)

            // Highlighted text — carries all annotation types & IDs
            // Glossary annotations include their label in the CSS type
            // so each label gets a unique highlight class.
            const typesArr = [
              ...new Set(
                seg.annotations.map((a) => {
                  if (a.type === 'glossary') return `glossary-${a.data.label}`
                  if (a.type === 'spellcheck')
                    return `spellcheck-${a.data.categoryId}`
                  return a.type
                }),
              ),
            ]
            // Mark collapsed tags explicitly so highlight-node.ts can
            // distinguish from non-collapsed tags that carry displayText
            // from a quote annotation.
            if (thisTagCollapsed) {
              typesArr.push('tag-collapsed')
            }
            const types = typesArr.join(',')
            const ids = seg.annotations.map((a) => a.id).join(',')
            // Only use tag displayText when collapsed — otherwise it would
            // override the quote replacement char for segments that carry
            // both tag and quote annotations.
            const tagDisplayText =
              tagAnn?.type === 'tag' && thisTagCollapsed
                ? tagAnn.data.displayText
                : undefined
            const isTagToken = thisTagCollapsed

            // Quote annotations: pass the replacement char as displayText
            // and force token mode, similar to special-char nodes.
            const quoteAnn = seg.annotations.find((a) => a.type === 'quote')
            const quoteDisplayText =
              quoteAnn?.type === 'quote'
                ? quoteAnn.data.replacementChar
                : undefined
            const isQuoteToken = !!quoteAnn

            // Check if this highlight segment entirely falls within a mention.
            // Mention content is masked before segment computation, so this
            // should rarely trigger — it's a safety net.
            const containingMention = savedMentions.find(
              (m) => m.start <= sStart && m.end >= sEnd,
            )

            if (containingMention) {
              // Mention takes precedence — create it if not yet emitted
              if (!emittedMentionStarts.has(containingMention.start)) {
                paragraph.append(
                  $createMentionNode(
                    containingMention.mentionId,
                    containingMention.mentionName,
                    containingMention.text,
                  ),
                )
                emittedMentionStarts.add(containingMention.start)
              }
              // If already emitted, skip (no node for this range)
            } else {
              appendWithMentions(paragraph, sStart, sEnd, (text) =>
                $createHighlightNode(
                  text,
                  types,
                  ids,
                  tagDisplayText ?? quoteDisplayText,
                  isTagToken || isQuoteToken,
                ),
              )
            }

            pos = sEnd
          }

          // Remaining plain text after last highlight
          if (pos < lineEnd) {
            appendWithMentions(paragraph, pos, lineEnd, (text) =>
              $createTextNode(text),
            )
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
                  nlAnns.map((a) => {
                    if (a.type === 'glossary') return `glossary-${a.data.label}`
                    if (a.type === 'spellcheck')
                      return `spellcheck-${a.data.categoryId}`
                    return a.type
                  }),
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
        // Only restore when the editor is focused, otherwise the
        // $setSelection call will steal focus from external inputs
        // (e.g. search field).  Explicitly null-out the selection
        // so Lexical's DOM reconciliation doesn't try to apply a
        // stale selection either.
        if (editorHasFocus && savedAnchor !== null && savedFocus !== null) {
          const anchorPt = $globalOffsetToPoint(savedAnchor)
          const focusPt = $globalOffsetToPoint(savedFocus)
          if (anchorPt && focusPt) {
            const sel = $createRangeSelection()
            sel.anchor.set(anchorPt.key, anchorPt.offset, anchorPt.type)
            sel.focus.set(focusPt.key, focusPt.offset, focusPt.type)
            $setSelection(sel)
          }
        } else {
          $setSelection(null)
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
    const unregister = editor.registerUpdateListener(
      ({ tags, dirtyElements, dirtyLeaves }) => {
        if (tags.has('cat-highlights')) return
        // Skip selection-only changes — only rebuild when actual
        // content changed.  Without this guard every arrow-key press
        // triggers a full tree rebuild on the next frame, which can
        // fight with cursor movement.
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(() => {
          applyHighlights()
        })
      },
    )
    return () => {
      unregister()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [editor, applyHighlights])

  // Strip trailing newlines from pasted text.  Some browsers / OSes add
  // a trailing \n to clipboard content which causes Lexical to create an
  // extra empty paragraph after the pasted text.
  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const clipboardData = event.clipboardData
        if (!clipboardData) return false
        const text = clipboardData.getData('text/plain')
        if (text && text !== text.replace(/\n+$/, '')) {
          event.preventDefault()
          const trimmed = text.replace(/\n+$/, '')
          editor.update(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
              selection.insertRawText(trimmed)
            }
          })
          return true
        }
        return false
      },
      COMMAND_PRIORITY_HIGH,
    )
  }, [editor])

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

/** Check whether a node is non-editable in the DOM.
 *  Only nodes with contentEditable="false" qualify: NL markers,
 *  collapsed tags, and quote-char nodes.  Special-char nodes are
 *  token-mode but still navigable — they are NOT non-editable. */
function $isNonEditableNode(node: LexicalNode): boolean {
  if (!$isHighlightNode(node)) return false
  if (node.__ruleIds.startsWith(NL_MARKER_PREFIX)) return true
  const types = node.__highlightTypes.split(',')
  if (types.includes('tag-collapsed')) return true
  if (types.includes('quote') && node.__displayText) return true
  return false
}

/** Given a selection point, if it sits on a non-editable node, move
 *  it to the nearest editable landing spot.
 *  Element-type positions (between children) are always valid — the
 *  browser can render a caret at element boundaries even next to
 *  contentEditable=false nodes — so we only clamp text-type points.
 *
 *  IMPORTANT: Lexical internally resolves element positions to text
 *  positions on the nearest text node.  So `{ paragraph, 0, element }`
 *  can become `{ firstChild, 0, text }` — which, if that child is
 *  CE=false, would trigger clamping.  To avoid "bounce-back" we detect
 *  this case and return the corresponding element position instead of
 *  jumping away. */
function $clampPointAwayFromNonEditable(point: PointType): {
  key: string
  offset: number
  type: 'text' | 'element'
} | null {
  // Element-type positions are always valid.
  if (point.type === 'element') return null

  const node = point.getNode()
  if (!$isNonEditableNode(node)) return null

  // The cursor landed on a CE=false node as a text-type point.  This can
  // happen when Lexical resolves an element-type position (set by us or by
  // click) to the nearest text node.  Convert it back to a valid element
  // gap position:
  //   offset === 0 → before this child (element offset = childIndex)
  //   offset > 0  → after this child  (element offset = childIndex + 1)
  const parent = node.getParent()
  if (parent && 'getChildren' in parent) {
    const siblings = parent.getChildren()
    const idx = siblings.findIndex((s) => s.getKey() === node.getKey())
    if (idx >= 0) {
      const elemOffset = point.offset > 0 ? idx + 1 : idx
      return {
        key: parent.getKey(),
        offset: elemOffset,
        type: 'element',
      }
    }
  }

  return null
}

/** Find the landing position one step to the right of `startNode`.
 *  - If startNode is an NL marker, cross to the next paragraph.
 *  - If the immediate next sibling is editable, land on it.
 *  - Otherwise return an element-type gap position just after startNode
 *    (so arrow keys stop at each gap between adjacent CE=false nodes). */
function $findNextEditable(
  startNode: LexicalNode,
): { key: string; offset: number; type: 'text' | 'element' } | null {
  // NL marker → cross to the next paragraph.
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
      // First child is CE=false — land at paragraph start (before the tag).
      if (first) {
        return {
          key: nextParagraph.getKey(),
          offset: 0,
          type: 'element',
        }
      }
    }
    return null
  }

  // Immediate next sibling is editable — land on it.
  const next = startNode.getNextSibling()
  if (next && !$isNonEditableNode(next)) {
    return { key: next.getKey(), offset: 0, type: 'text' }
  }

  // Next sibling is CE=false or absent — return element position just
  // after startNode.  This creates a gap the user can type into.
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

/** Find the landing position one step to the left of `startNode`.
 *  - If the immediate previous sibling is editable, land on it.
 *  - Otherwise return an element-type gap position just before startNode
 *    (so arrow keys stop at each gap between adjacent CE=false nodes). */
function $findPrevEditable(
  startNode: LexicalNode,
): { key: string; offset: number; type: 'text' | 'element' } | null {
  const prev = startNode.getPreviousSibling()

  // Previous sibling is editable — land at its end.
  if (prev && !$isNonEditableNode(prev)) {
    return {
      key: prev.getKey(),
      offset: prev.getTextContent().length,
      type: 'text',
    }
  }

  // Previous sibling is CE=false or absent — return element position
  // just before startNode.
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

/** Prevents the cursor from ever resting on a non-editable node.
 *  - Intercepts Left/Right arrows to skip over non-editable nodes.
 *  - Watches every selection change (mouse click, drag, keyboard) and
 *    clamps the cursor back to the nearest editable node. */
export function NLMarkerNavigationPlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    // ── Right arrow: skip over non-editable nodes (NL markers, collapsed
    //    tags, quote-chars, special-chars). ──
    const unregRight = editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      (event) => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed())
          return false

        const { anchor } = selection
        const node = anchor.getNode()

        // Check if the next sibling is non-editable
        let nextNode: LexicalNode | null = null
        if (anchor.type === 'text') {
          if (anchor.offset < node.getTextContent().length) return false
          nextNode = node.getNextSibling()
        } else {
          const children = (node as ElementNode).getChildren()
          nextNode = children[anchor.offset] ?? null
        }

        if (nextNode && $isNonEditableNode(nextNode)) {
          const target = $findNextEditable(nextNode)
          if (target) {
            selection.anchor.set(target.key, target.offset, target.type)
            selection.focus.set(target.key, target.offset, target.type)
            event.preventDefault()
            return true
          }
          // No editable target — let browser handle (end of content)
          return false
        }

        // Also handle: cursor is ON a non-editable node (e.g. after click)
        if ($isNonEditableNode(node)) {
          const target = $findNextEditable(node)
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

    // ── Left arrow: skip over non-editable nodes. ──
    const unregLeft = editor.registerCommand(
      KEY_ARROW_LEFT_COMMAND,
      (event) => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed())
          return false

        const { anchor } = selection
        const node = anchor.getNode()

        // Check if the previous sibling is non-editable
        let prevNode: LexicalNode | null = null
        if (anchor.type === 'text') {
          if (anchor.offset > 0) return false
          prevNode = node.getPreviousSibling()
        } else {
          const children = (node as ElementNode).getChildren()
          prevNode = children[anchor.offset - 1] ?? null
        }

        if (prevNode && $isNonEditableNode(prevNode)) {
          const target = $findPrevEditable(prevNode)
          if (target) {
            selection.anchor.set(target.key, target.offset, target.type)
            selection.focus.set(target.key, target.offset, target.type)
            event.preventDefault()
            return true
          }
          return false
        }

        // Also handle: cursor is ON a non-editable node (e.g. after click)
        if ($isNonEditableNode(node)) {
          const target = $findPrevEditable(node)
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

    // ── Selection change: catch mouse clicks/drags that land on non-editable nodes ──
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
