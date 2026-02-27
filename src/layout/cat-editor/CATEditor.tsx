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
  $getNodeByKey,
  $getRoot,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  KEY_DOWN_COMMAND,
} from 'lexical'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'

import { NL_MARKER_PREFIX } from './constants'
import { $isHighlightNode, HighlightNode } from './highlight-node'
import { MentionNode } from './mention-node'
import { setMentionNodeConfig } from './mention-node'
import { MentionPlugin } from './mention-plugin'
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
  IMentionUser,
  MooRule,
  PopoverContentRenderer,
  PopoverState,
  RuleAnnotation,
} from './types'
import type { MentionDOMRenderer } from './mention-node'
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
  /** Custom code-point → display symbol map.  Merged on top of the
   *  built-in `CODEPOINT_DISPLAY_MAP`.  Pass `{ 0x00a0: '⍽' }` to
   *  override the symbol shown for non-breaking spaces, etc. */
  codepointDisplayMap?: Record<number, string>
  /** Custom renderer for popover content per annotation.
   *  Return `null`/`undefined` to use the built-in default. */
  renderPopoverContent?: PopoverContentRenderer
  /** Called when a link highlight is clicked.  If not provided, links
   *  open in a new browser tab via `window.open`. */
  onLinkClick?: (url: string) => void
  /** Whether clicking a link highlight should open the URL.
   *  When `false`, link clicks are ignored (the click positions the
   *  cursor in the editor text instead).  Default: `true`. */
  openLinksOnClick?: boolean
  /** Called when a mention node is clicked. */
  onMentionClick?: (userId: string, userName: string) => void
  /** Called when a mention is inserted via the typeahead. */
  onMentionInsert?: (user: IMentionUser) => void
  /** Converts a mention ID to model text.
   *  Default: `` id => `@{${id}}` `` producing `@{5}`, `@{user_abc}`, etc. */
  mentionSerialize?: (id: string) => string
  /** RegExp to detect mention patterns in pasted / imported text.
   *  Must have one capture group for the ID and use the `g` flag.
   *  Default: `/@\{([^}]+)\}/g` */
  mentionPattern?: RegExp
  /** Custom DOM renderer for mention nodes.
   *  Receives the `<span>` host element, the mentionId and the
   *  display name.  Return `true` to take over rendering;
   *  return `false`/`undefined` to use the default `@name` label. */
  renderMentionDOM?: MentionDOMRenderer
  /** Placeholder text */
  placeholder?: string
  /** Additional class name for the editor container */
  className?: string
  /** Text direction.  `'ltr'` (default), `'rtl'`, or `'auto'`. */
  dir?: 'ltr' | 'rtl' | 'auto'
  /** When `true`, applies a Japanese-optimised font stack to the editor. */
  jpFont?: boolean
  /** Whether the editor content is editable.  Default: `true`.
   *  When `false`, all text mutations are blocked.
   *  @see readOnlySelectable */
  editable?: boolean
  /** When `editable` is `false` and this is `true`, the editor still
   *  allows caret placement, range selection and copy — but rejects
   *  any content changes.  Default: `false`. */
  readOnlySelectable?: boolean
  /** Custom keydown handler.  Called before Lexical processes the event.
   *  Return `true` to prevent Lexical (and the browser) from handling
   *  the key.  Useful for intercepting Enter, Tab, Escape, etc.
   *  @example
   *  ```tsx
   *  onKeyDown={(e) => {
   *    if (e.key === 'Enter' && !e.shiftKey) {
   *      e.preventDefault()
   *      handleSubmit()
   *      return true
   *    }
   *    return false
   *  }}
   *  ``` */
  onKeyDown?: (event: KeyboardEvent) => boolean
  /** @deprecated Use `editable` instead. */
  readOnly?: boolean
}

export const CATEditor = forwardRef<CATEditorRef, CATEditorProps>(
  function CATEditor(
    {
      initialText = '',
      rules = [],
      onChange,
      onSuggestionApply,
      codepointDisplayMap,
      renderPopoverContent,
      onLinkClick,
      openLinksOnClick = true,
      onMentionClick,
      onMentionInsert,
      mentionSerialize,
      mentionPattern,
      renderMentionDOM,
      placeholder = 'Start typing or paste text here…',
      className,
      dir,
      jpFont = false,
      editable: editableProp,
      readOnlySelectable = false,
      onKeyDown: onKeyDownProp,
      readOnly: readOnlyLegacy = false,
    },
    ref,
  ) {
    // Resolve effective editable: new `editable` prop takes precedence,
    // falling back to the legacy `readOnly` prop (inverted).
    const isEditable =
      editableProp !== undefined ? editableProp : !readOnlyLegacy
    const annotationMapRef = useRef(new Map<string, RuleAnnotation>())
    const editorRef = useRef<LexicalEditor | null>(null)
    const savedSelectionRef = useRef<{
      anchor: number
      focus: number
    } | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ── Sync MentionNode global config whenever props change ──────────────
    useEffect(() => {
      setMentionNodeConfig({
        renderDOM: renderMentionDOM,
        serialize: mentionSerialize,
        pattern: mentionPattern,
      })
    }, [renderMentionDOM, mentionSerialize, mentionPattern])

    // ── Flash highlight state ──────────────────────────────────────────────
    const flashIdRef = useRef<string | null>(null)
    const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const flashEditUnregRef = useRef<(() => void) | null>(null)

    /** Apply the `cat-highlight-flash` class to all DOM elements whose
     *  `data-rule-ids` contain the given annotation ID. */
    const applyFlashClass = useCallback((annotationId: string) => {
      const container = containerRef.current
      if (!container) return
      // Remove previous flash classes
      container
        .querySelectorAll('.cat-highlight-flash')
        .forEach((el) => el.classList.remove('cat-highlight-flash'))
      // Add to matching elements
      container.querySelectorAll('.cat-highlight').forEach((el) => {
        const ids = el.getAttribute('data-rule-ids')
        if (ids && ids.split(',').includes(annotationId)) {
          el.classList.add('cat-highlight-flash')
        }
      })
    }, [])

    /** Remove all flash highlight classes and clean up timers/listeners. */
    const clearFlashInner = useCallback(() => {
      flashIdRef.current = null
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
    }, [])

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
                // Token-mode nodes (tags, special-chars) are atomic — calling
                // sel.insertText on them replaces the entire node. Instead,
                // insert a new text node before or after the token.
                const anchorNode = $getNodeByKey(anchorPt.key)
                if (
                  anchorNode &&
                  $isHighlightNode(anchorNode) &&
                  anchorNode.getMode() === 'token' &&
                  saved.anchor === saved.focus
                ) {
                  const newText = $createTextNode(text)
                  if (
                    anchorPt.offset === 0 ||
                    anchorPt.offset < anchorNode.getTextContentSize()
                  ) {
                    anchorNode.insertBefore(newText)
                  } else {
                    anchorNode.insertAfter(newText)
                  }
                  newText.selectEnd()
                  return
                }

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
        flashHighlight: (annotationId: string, durationMs = 5000) => {
          // Clear any existing flash first
          clearFlashInner()

          flashIdRef.current = annotationId
          // Apply class to current DOM
          applyFlashClass(annotationId)

          // Auto-remove after timeout
          flashTimerRef.current = setTimeout(() => {
            clearFlashInner()
          }, durationMs)

          // Remove on first user edit (not our own highlight rebuilds).
          // The `applyHighlights` plugin tags its updates with 'cat-highlights'.
          const editor = editorRef.current
          if (editor) {
            flashEditUnregRef.current = editor.registerUpdateListener(
              ({ tags }) => {
                if (tags.has('cat-highlights')) {
                  // Highlight rebuild — re-apply flash class to new DOM elements
                  if (flashIdRef.current) {
                    requestAnimationFrame(() =>
                      applyFlashClass(flashIdRef.current!),
                    )
                  }
                  return
                }
                // User edit — clear flash
                clearFlashInner()
              },
            )
          }
        },
        replaceAll: (search: string, replacement: string): number => {
          const editor = editorRef.current
          if (!editor || !search) return 0

          let count = 0
          editor.update(() => {
            const root = $getRoot()
            const fullText = root.getTextContent()

            // Count occurrences
            let idx = 0
            while ((idx = fullText.indexOf(search, idx)) !== -1) {
              count++
              idx += search.length
            }

            if (count === 0) return

            // Rebuild the content with all replacements applied
            const newText = fullText.split(search).join(replacement)
            root.clear()
            const lines = newText.split('\n')
            for (const line of lines) {
              const p = $createParagraphNode()
              p.append($createTextNode(line))
              root.append(p)
            }
          })

          return count
        },
        clearFlash: () => {
          clearFlashInner()
        },
      }),
      [applyFlashClass, clearFlashInner],
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
        nodes: [HighlightNode, MentionNode],
        // When readOnlySelectable, Lexical must be editable so the caret
        // and selection work — we block mutations via KEY_DOWN_COMMAND.
        editable: isEditable || readOnlySelectable,
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
    }, [scheduleHide, cancelHide])

    // Handle click on link / mention highlights
    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      const handleClick = (e: MouseEvent) => {
        // Check for link highlights
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

        // Check for mention nodes
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
    }, [onLinkClick, openLinksOnClick, onMentionClick])

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
      <div
        ref={containerRef}
        className={cn(
          'cat-editor-container',
          jpFont && 'cat-editor-jp-font',
          className,
        )}
        dir={dir}
      >
        <LexicalComposer initialConfig={initialConfig}>
          <div className="cat-editor-inner">
            <PlainTextPlugin
              contentEditable={
                <ContentEditable
                  className={cn(
                    'cat-editor-editable',
                    !isEditable && !readOnlySelectable && 'cat-editor-readonly',
                    !isEditable &&
                      readOnlySelectable &&
                      'cat-editor-readonly-selectable',
                  )}
                />
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
              codepointDisplayMap={codepointDisplayMap}
            />
            <EditorRefPlugin
              editorRef={editorRef}
              savedSelectionRef={savedSelectionRef}
            />
            <NLMarkerNavigationPlugin />
            {/* Block mutations when read-only but selectable */}
            {!isEditable && readOnlySelectable && <ReadOnlySelectablePlugin />}
            {/* Custom key-down handler */}
            {onKeyDownProp && <KeyDownPlugin onKeyDown={onKeyDownProp} />}
            {/* Mention typeahead plugin — enabled when a mention rule is present */}
            {rules
              .filter(
                (r): r is import('./types').IMentionRule =>
                  r.type === 'mention',
              )
              .map((mentionRule, i) => (
                <MentionPlugin
                  key={`mention-${i}`}
                  users={mentionRule.users}
                  trigger={mentionRule.trigger}
                  onMentionInsert={onMentionInsert}
                />
              ))}
          </div>
        </LexicalComposer>

        <HighlightPopover
          state={popoverState}
          annotationMap={annotationMapRef.current}
          onSuggestionClick={handleSuggestionClick}
          onLinkOpen={onLinkClick}
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

// ─── Internal Plugins ─────────────────────────────────────────────────────────

/** Blocks all content-mutating key presses while keeping caret & selection
 *  functional.  Registered at CRITICAL priority so it fires before Lexical's
 *  own handlers. */
function ReadOnlySelectablePlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        // Allow navigation, selection, copy/paste-select, etc.
        if (
          event.key.startsWith('Arrow') ||
          event.key === 'Home' ||
          event.key === 'End' ||
          event.key === 'PageUp' ||
          event.key === 'PageDown' ||
          event.key === 'Shift' ||
          event.key === 'Control' ||
          event.key === 'Alt' ||
          event.key === 'Meta' ||
          event.key === 'Tab' ||
          event.key === 'Escape' ||
          event.key === 'F5' ||
          event.key === 'F12' ||
          // Ctrl/Cmd shortcuts that don't mutate: copy, select-all, find
          ((event.ctrlKey || event.metaKey) &&
            (event.key === 'c' ||
              event.key === 'a' ||
              event.key === 'f' ||
              event.key === 'g'))
        ) {
          return false // let it through
        }
        // Block everything else (typing, Enter, Backspace, Delete, paste, cut…)
        event.preventDefault()
        return true
      },
      COMMAND_PRIORITY_CRITICAL,
    )
  }, [editor])

  // Also block paste and cut at the DOM level
  useEffect(() => {
    const root = editor.getRootElement()
    if (!root) return
    const block = (e: Event) => e.preventDefault()
    root.addEventListener('paste', block)
    root.addEventListener('cut', block)
    root.addEventListener('drop', block)
    return () => {
      root.removeEventListener('paste', block)
      root.removeEventListener('cut', block)
      root.removeEventListener('drop', block)
    }
  }, [editor])

  return null
}

/** Fires the consumer's `onKeyDown` before Lexical processes the event.
 *  If the callback returns `true`, the event is consumed (preventDefault +
 *  stop Lexical propagation). */
function KeyDownPlugin({
  onKeyDown,
}: {
  onKeyDown: (event: KeyboardEvent) => boolean
}) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        return onKeyDown(event)
      },
      COMMAND_PRIORITY_CRITICAL,
    )
  }, [editor, onKeyDown])

  return null
}
