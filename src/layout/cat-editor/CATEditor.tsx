import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $setSelection,
} from 'lexical'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'

import { NL_MARKER_PREFIX } from './constants'
import { $isHighlightNode, HighlightNode } from './highlight-node'
import {
  EditorRefPlugin,
  HighlightsPlugin,
  NLMarkerNavigationPlugin,
} from './plugins'
import { HighlightPopover } from './popover'
import { $globalOffsetToPoint, $pointToGlobalOffset } from './selection-helpers'

import type { LexicalEditor } from 'lexical'

import type {
  CATEditorRef,
  MooRule,
  PopoverContentRenderer,
  PopoverState,
  RuleAnnotation,
} from './types'
import { cn } from '@/lib/utils'

// ─── Main CATEditor Component ────────────────────────────────────────────────

export interface CATEditorProps {
  /** Initial text content for the editor */
  initialText?: string
  /** Rules to apply for highlighting */
  rules?: Array<MooRule>
  /** Called when editor content changes */
  onChange?: (text: string) => void
  /** Called when a suggestion is applied.
   *  Provides the ruleId, the replacement text, the original text
   *  span (start / end / content), and the ruleType so consumers
   *  can identify which rule triggered the replacement. */
  onSuggestionApply?: (
    ruleId: string,
    suggestion: string,
    range: { start: number; end: number; content: string },
    ruleType: RuleAnnotation['type'],
  ) => void
  /** Custom renderer for popover content per annotation.
   *  Return `null`/`undefined` to use the built-in default. */
  renderPopoverContent?: PopoverContentRenderer
  /** Placeholder text */
  placeholder?: string
  /** Additional class name for the editor container */
  className?: string
  /** Whether the editor is read-only */
  readOnly?: boolean
}

export const CATEditor = forwardRef<CATEditorRef, CATEditorProps>(
  function CATEditor(
    {
      initialText = '',
      rules = [],
      onChange,
      onSuggestionApply,
      renderPopoverContent,
      placeholder = 'Start typing or paste text here…',
      className,
      readOnly = false,
    },
    ref,
  ) {
    const annotationMapRef = useRef(new Map<string, RuleAnnotation>())
    const editorRef = useRef<LexicalEditor | null>(null)
    const savedSelectionRef = useRef<{
      anchor: number
      focus: number
    } | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [popoverState, setPopoverState] = useState<PopoverState>({
      visible: false,
      x: 0,
      y: 0,
      ruleIds: [],
    })

    // ── Imperative API ─────────────────────────────────────────────────────
    useImperativeHandle(
      ref,
      () => ({
        insertText: (text: string) => {
          const editor = editorRef.current
          if (!editor) return

          editor.update(() => {
            const saved = savedSelectionRef.current
            if (saved) {
              // Restore selection at the saved global offset
              const anchorPt = $globalOffsetToPoint(saved.anchor)
              const focusPt = $globalOffsetToPoint(saved.focus)
              if (anchorPt && focusPt) {
                const sel = $createRangeSelection()
                sel.anchor.set(anchorPt.key, anchorPt.offset, anchorPt.type)
                sel.focus.set(focusPt.key, focusPt.offset, focusPt.type)
                $setSelection(sel)
                sel.insertText(text)
                return
              }
            }
            // Fallback: append at the end of the last paragraph
            const root = $getRoot()
            const lastChild = root.getLastChild()
            if (lastChild) {
              lastChild.selectEnd()
            }
            const sel = $createRangeSelection()
            $setSelection(sel)
            sel.insertText(text)
          })

          // Re-focus the editor
          editor.focus()
        },
        focus: () => {
          editorRef.current?.focus()
        },
        getText: () => {
          let text = ''
          editorRef.current?.getEditorState().read(() => {
            text = $getRoot().getTextContent()
          })
          return text
        },
      }),
      [],
    )

    const initialConfig = useMemo(
      () => ({
        namespace: 'CATEditor',
        theme: {
          root: 'cat-editor-root',
          paragraph: 'cat-editor-paragraph',
          text: {
            base: 'cat-editor-text',
          },
        },
        nodes: [HighlightNode],
        editable: !readOnly,
        onError: (error: Error) => {
          console.error('CATEditor Lexical error:', error)
        },
        editorState: () => {
          const root = $getRoot()
          const lines = initialText.split('\n')
          for (const line of lines) {
            const p = $createParagraphNode()
            p.append($createTextNode(line))
            root.append(p)
          }
        },
      }),
      [], // intentional: initialConfig should not change
    )

    // ── Popover hover logic ────────────────────────────────────────────────
    const isOverHighlightRef = useRef(false)
    const isOverPopoverRef = useRef(false)

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

    // Handle hover over highlighted DOM elements
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

        const ruleIds = ruleIdsAttr
          .split(',')
          .map((id) =>
            id.startsWith(NL_MARKER_PREFIX)
              ? id.slice(NL_MARKER_PREFIX.length)
              : id,
          )

        isOverHighlightRef.current = true
        cancelHide()

        const rect = target.getBoundingClientRect()
        setPopoverState({
          visible: true,
          x: rect.left,
          y: rect.bottom,
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
    }, [scheduleHide, cancelHide])

    // Handle suggestion click -> replace the highlighted text
    const handleSuggestionClick = useCallback(
      (suggestion: string, ruleId: string) => {
        const editor = editorRef.current
        if (!editor) return

        let replacedRange:
          | { start: number; end: number; content: string }
          | undefined

        editor.update(() => {
          const root = $getRoot()
          const allNodes = root.getAllTextNodes()
          for (const node of allNodes) {
            if (
              $isHighlightNode(node) &&
              node.__ruleIds.split(',').includes(ruleId)
            ) {
              const globalOffset = $pointToGlobalOffset(node.getKey(), 0)
              const originalContent = node.getTextContent()
              replacedRange = {
                start: globalOffset,
                end: globalOffset + originalContent.length,
                content: originalContent,
              }
              const textNode = $createTextNode(suggestion)
              node.replace(textNode)
              break
            }
          }
        })

        setPopoverState((prev) => ({ ...prev, visible: false }))
        if (replacedRange !== undefined) {
          const annotation = annotationMapRef.current.get(ruleId)
          if (annotation) {
            onSuggestionApply?.(
              ruleId,
              suggestion,
              replacedRange,
              annotation.type,
            )
          }
        }
      },
      [onSuggestionApply],
    )

    const handleChange = useCallback(
      (editorState: { read: (fn: () => void) => void }) => {
        if (!onChange) return
        editorState.read(() => {
          const root = $getRoot()
          onChange(root.getTextContent())
        })
      },
      [onChange],
    )

    return (
      <div ref={containerRef} className={cn('cat-editor-container', className)}>
        <LexicalComposer initialConfig={initialConfig}>
          <div className="cat-editor-inner">
            <PlainTextPlugin
              contentEditable={
                <ContentEditable className="cat-editor-editable" />
              }
              placeholder={
                <div className="cat-editor-placeholder">{placeholder}</div>
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <HistoryPlugin />
            <OnChangePlugin onChange={handleChange} />
            <HighlightsPlugin
              rules={rules}
              annotationMapRef={annotationMapRef}
            />
            <EditorRefPlugin
              editorRef={editorRef}
              savedSelectionRef={savedSelectionRef}
            />
            <NLMarkerNavigationPlugin />
          </div>
        </LexicalComposer>

        <HighlightPopover
          state={popoverState}
          annotationMap={annotationMapRef.current}
          onSuggestionClick={handleSuggestionClick}
          onDismiss={() => {
            isOverPopoverRef.current = false
            scheduleHide()
          }}
          onPopoverEnter={() => {
            isOverPopoverRef.current = true
            cancelHide()
          }}
          renderPopoverContent={renderPopoverContent}
        />
      </div>
    )
  },
)

export default CATEditor
