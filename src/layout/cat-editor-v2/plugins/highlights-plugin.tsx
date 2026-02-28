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
  PASTE_COMMAND,
} from 'lexical'
import { useCallback, useEffect, useRef } from 'react'

import { computeHighlightSegments } from '../../cat-editor/compute-segments'
import {
  CODEPOINT_DISPLAY_MAP,
  NL_MARKER_PREFIX,
} from '../../cat-editor/constants'
import {
  $createHighlightNode,
  $isHighlightNode,
  HighlightNode,
} from '../../cat-editor/highlight-node'
import {
  $createMentionNode,
  $isMentionNode,
  getMentionPattern,
} from '../../cat-editor/mention-node'
import {
  $globalOffsetToPoint,
  $pointToGlobalOffset,
} from '../../cat-editor/selection-helpers'

import type { ElementNode, LexicalNode } from 'lexical'
import type {
  HighlightSegment,
  IMentionRule,
  ITagRule,
  MooRule,
  RuleAnnotation,
} from '../../cat-editor/types'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Saved mention position recorded during the text-collection phase. */
interface SavedMention {
  start: number
  end: number
  mentionId: string
  mentionName: string
  text: string
}

// ─── Text Collection ─────────────────────────────────────────────────────────

/** Walk the editor tree and collect plain-text content + mention positions.
 *  Skips NL-marker indicator nodes so their display symbols don't compound. */
function $collectText(root: ElementNode): {
  fullText: string
  savedMentions: Array<SavedMention>
} {
  const paragraphs = root.getChildren()
  const lines: Array<string> = []
  const savedMentions: Array<SavedMention> = []
  let collectOffset = 0

  for (const p of paragraphs) {
    let lineText = ''

    if ('getChildren' in p) {
      for (const child of (p as ElementNode).getChildren()) {
        // Skip NL-marker indicator nodes (they're purely visual)
        if (
          $isHighlightNode(child) &&
          child.__ruleIds.startsWith(NL_MARKER_PREFIX)
        ) {
          continue
        }
        // Record MentionNode positions
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

  return { fullText: lines.join('\n'), savedMentions }
}

// ─── Mention Detection ───────────────────────────────────────────────────────

/** Detect mention patterns in text that aren't already tracked as MentionNodes.
 *  Returns a merged array of all mentions. */
function detectNewMentions(
  fullText: string,
  rules: Array<MooRule>,
  existing: Array<SavedMention>,
): Array<SavedMention> {
  const mentionRule = rules.find((r): r is IMentionRule => r.type === 'mention')
  if (!mentionRule) return existing

  const additional: Array<SavedMention> = []
  const pattern = getMentionPattern()
  let match: RegExpExecArray | null
  while ((match = pattern.exec(fullText)) !== null) {
    const start = match.index
    const end = start + match[0].length
    const id = match[1]
    // Skip if already tracked
    if (existing.some((m) => m.start === start && m.end === end)) continue
    const user = mentionRule.users.find((u) => u.id === id)
    if (user) {
      additional.push({
        start,
        end,
        mentionId: user.id,
        mentionName: user.name,
        text: match[0],
      })
    }
  }

  return additional.length > 0 ? [...existing, ...additional] : existing
}

// ─── Mention Masking ─────────────────────────────────────────────────────────

/** Replace mention ranges with placeholder chars so highlight patterns
 *  (e.g. tag pattern matching `{id}`) don't produce segments inside mentions. */
function maskMentionRanges(
  text: string,
  mentions: Array<SavedMention>,
): string {
  let result = text
  for (let i = mentions.length - 1; i >= 0; i--) {
    const m = mentions[i]
    result =
      result.slice(0, m.start) +
      '\x01'.repeat(m.end - m.start) +
      result.slice(m.end)
  }
  return result
}

// ─── Annotation Map Sync ─────────────────────────────────────────────────────

/** Update the annotation map from computed segments. */
function syncAnnotationMap(
  ref: React.MutableRefObject<Map<string, RuleAnnotation>>,
  segments: Array<HighlightSegment>,
): void {
  const newMap = new Map<string, RuleAnnotation>()
  for (const seg of segments) {
    for (const ann of seg.annotations) {
      newMap.set(ann.id, ann)
    }
  }
  ref.current = newMap
}

// ─── Tree Rebuild ────────────────────────────────────────────────────────────

/** Rebuild the Lexical content tree with highlight/mention nodes.
 *  Must be called inside `editor.update()`. */
function $rebuildTree(
  root: ElementNode,
  fullText: string,
  segments: Array<HighlightSegment>,
  savedMentions: Array<SavedMention>,
  rules: Array<MooRule>,
): void {
  root.clear()

  if (fullText.length === 0) {
    const p = $createParagraphNode()
    p.append($createTextNode(''))
    root.append(p)
    return
  }

  const emittedMentionStarts = new Set<number>()

  /** Append nodes for a text range, splitting around any saved MentionNodes. */
  const appendWithMentions = (
    paragraph: ElementNode,
    rangeStart: number,
    rangeEnd: number,
    makeNode: (text: string) => LexicalNode,
  ) => {
    const overlapping = savedMentions.filter(
      (m) =>
        m.start < rangeEnd &&
        m.end > rangeStart &&
        !emittedMentionStarts.has(m.start),
    )

    if (overlapping.length === 0) {
      const text = fullText.slice(rangeStart, rangeEnd)
      if (text.length > 0) paragraph.append(makeNode(text))
      return
    }

    overlapping.sort((a, b) => a.start - b.start)
    let cursor = rangeStart

    for (const m of overlapping) {
      const mStart = Math.max(m.start, rangeStart)
      const mEnd = Math.min(m.end, rangeEnd)

      if (mStart > cursor) {
        const beforeText = fullText.slice(cursor, mStart)
        if (beforeText.length > 0) paragraph.append(makeNode(beforeText))
      }

      paragraph.append($createMentionNode(m.mentionId, m.mentionName, m.text))
      emittedMentionStarts.add(m.start)
      cursor = mEnd
    }

    if (cursor < rangeEnd) {
      const afterText = fullText.slice(cursor, rangeEnd)
      if (afterText.length > 0) paragraph.append(makeNode(afterText))
    }
  }

  const textLines = fullText.split('\n')
  let globalOffset = 0

  for (const line of textLines) {
    const paragraph = $createParagraphNode()
    const lineStart = globalOffset
    const lineEnd = globalOffset + line.length

    // Segments within this line
    const lineSegments = segments.filter(
      (s) => s.start < lineEnd && s.end > lineStart,
    )

    let pos = lineStart
    for (const seg of lineSegments) {
      const sStart = Math.max(seg.start, lineStart)
      const sEnd = Math.min(seg.end, lineEnd)

      // ── Gap before this segment (plain text / mentions) ──
      if (sStart > pos) {
        appendWithMentions(paragraph, pos, sStart, (text) =>
          $createTextNode(text),
        )
      }

      // ── Determine highlight properties ──
      const tagAnn = seg.annotations.find((a) => a.type === 'tag')
      const tagRule = rules.find((r): r is ITagRule => r.type === 'tag')
      const tagsCollapsed = !!tagRule?.collapsed
      const collapseScope = tagRule?.collapseScope ?? 'all'
      const thisTagCollapsed =
        tagsCollapsed &&
        !!tagAnn &&
        (collapseScope === 'all' || tagAnn.data.isHtml)

      // Build CSS type array
      const typesArr = [
        ...new Set(
          seg.annotations.map((a) => {
            if (a.type === 'keyword') return `keyword-${a.data.label}`
            if (a.type === 'spellcheck')
              return `spellcheck-${a.data.categoryId}`
            return a.type
          }),
        ),
      ]

      // Atomic keyword marker
      const hasAtomic = seg.annotations.some(
        (a) => a.type === 'keyword' && a.data.atomic,
      )
      if (hasAtomic && !typesArr.includes('keyword-atomic')) {
        typesArr.push('keyword-atomic')
      }

      // Tag-collapsed marker
      if (thisTagCollapsed) {
        typesArr.push('tag-collapsed')
      }

      const types = typesArr.join(',')
      const ids = seg.annotations.map((a) => a.id).join(',')

      // Display text (tag or quote)
      const tagDisplayText =
        tagAnn?.type === 'tag' && thisTagCollapsed
          ? tagAnn.data.displayText
          : undefined
      const isTagToken = thisTagCollapsed

      const quoteAnn = seg.annotations.find((a) => a.type === 'quote')
      const quoteDisplayText =
        quoteAnn?.type === 'quote' ? quoteAnn.data.replacementChar : undefined
      const isQuoteToken = !!quoteAnn

      const isAtomicToken = hasAtomic

      // ── Check if within a mention (safety net) ──
      const containingMention = savedMentions.find(
        (m) => m.start <= sStart && m.end >= sEnd,
      )

      if (containingMention) {
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
      } else {
        appendWithMentions(paragraph, sStart, sEnd, (text) =>
          $createHighlightNode(
            text,
            types,
            ids,
            tagDisplayText ?? quoteDisplayText,
            isTagToken || isQuoteToken || isAtomicToken,
          ),
        )
      }

      pos = sEnd
    }

    // ── Remaining plain text after last highlight ──
    if (pos < lineEnd) {
      appendWithMentions(paragraph, pos, lineEnd, (text) =>
        $createTextNode(text),
      )
    }

    // ── NL marker (line-break indicator) ──
    const nlPos = lineEnd
    if (nlPos < fullText.length && fullText[nlPos] === '\n') {
      const nlSegments = segments.filter(
        (s) => s.start <= nlPos && s.end > nlPos,
      )
      if (nlSegments.length > 0) {
        const nlAnns = nlSegments.flatMap((s) => s.annotations)
        const nlTypes = [
          ...new Set(
            nlAnns.map((a) => {
              if (a.type === 'keyword') return `keyword-${a.data.label}`
              if (a.type === 'spellcheck')
                return `spellcheck-${a.data.categoryId}`
              return a.type
            }),
          ),
        ].join(',')
        const nlIds = nlAnns.map((a) => a.id).join(',')
        const symbol = CODEPOINT_DISPLAY_MAP[0x000a]
        if (paragraph.getChildrenSize() === 0) {
          paragraph.append($createTextNode(''))
        }
        paragraph.append(
          $createHighlightNode(symbol, nlTypes, NL_MARKER_PREFIX + nlIds),
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
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

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
    // Sync codepoint overrides for this editor instance
    HighlightNode.__codepointOverrides = codepointDisplayMap

    // Check focus BEFORE editor.update() — if the editor doesn't own
    // focus, we must not restore selection, otherwise Lexical's DOM
    // reconciliation steals focus from external inputs (e.g. search field).
    const editorElement = editor.getRootElement()
    const editorHasFocus =
      editorElement != null &&
      editorElement.contains(editorElement.ownerDocument.activeElement)

    editor.update(
      () => {
        $addUpdateTag('cat-highlights')
        const root = $getRoot()

        // 1. Collect text + existing mentions
        const { fullText, savedMentions } = $collectText(root)

        // 2. Detect mention patterns in pasted/imported text
        const allMentions = detectNewMentions(fullText, rules, savedMentions)

        // 3. Mask mentions and compute highlight segments
        const maskedText = maskMentionRanges(fullText, allMentions)
        const segments = computeHighlightSegments(maskedText, rules)

        // 4. Update annotation map for popovers
        syncAnnotationMap(annotationMapRef, segments)

        // 5. Save selection as global offsets
        let savedAnchor: number | null = null
        let savedFocus: number | null = null
        if (editorHasFocus) {
          const sel = $getSelection()
          if ($isRangeSelection(sel)) {
            savedAnchor = $pointToGlobalOffset(
              sel.anchor.key,
              sel.anchor.offset,
            )
            savedFocus = $pointToGlobalOffset(sel.focus.key, sel.focus.offset)
          }
        }

        // 6. Rebuild content tree with highlights + mentions
        $rebuildTree(root, fullText, segments, allMentions, rules)

        // 7. Restore selection (only when editor is focused)
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
  }, [editor, rules, annotationMapRef, codepointDisplayMap])

  // Run on mount and when rules change
  useEffect(() => {
    applyHighlights()
  }, [applyHighlights])

  // Re-run after content changes (skip our own 'cat-highlights' updates)
  useEffect(() => {
    const unregister = editor.registerUpdateListener(
      ({ tags, dirtyElements, dirtyLeaves }) => {
        if (tags.has('cat-highlights')) return
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

  // Strip trailing newlines from pasted text
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
