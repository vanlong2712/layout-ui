import { forwardRef, useCallback, useEffect, useMemo, useRef } from 'react'
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'

import { HighlightNode } from '../cat-editor/highlight-node'
import { MentionNode, setMentionNodeConfig } from '../cat-editor/mention-node'
import { MentionPlugin } from '../cat-editor/mention-plugin'
import { HighlightPopover } from '../cat-editor/popover'
import {
  $getPlainText,
  $pointToGlobalOffset,
} from '../cat-editor/selection-helpers'

import {
  DirectionPlugin,
  KeyDownPlugin,
  PasteCleanupPlugin,
  ReadOnlySelectablePlugin,
} from './plugins/utility-plugins'
import { EditorRefPlugin } from './plugins/editor-ref-plugin'
import { HighlightsPlugin } from './plugins/highlights-plugin'
import { NLMarkerNavigationPlugin } from './plugins/navigation-plugin'

import { useEditorHandle } from './hooks/use-editor-handle'
import { useFlash } from './hooks/use-flash'
import { usePopoverHover } from './hooks/use-popover-hover'

import type { LexicalEditor } from 'lexical'
import type {
  CATEditorRef,
  IMentionRule,
  MooRule,
  PopoverContentRenderer,
  RuleAnnotation,
} from '../cat-editor/types'
import type { MentionDOMRenderer } from '../cat-editor/mention-node'
import { cn } from '@/lib/utils'

// ─── Props ───────────────────────────────────────────────────────────────────

export interface CATEditorProps {
  /** Initial text content for the editor */
  initialText?: string
  /** Rules to apply for highlighting */
  rules?: Array<MooRule>
  /** Called when editor content changes */
  onChange?: (text: string) => void
  /** Called when a suggestion is applied. */
  onSuggestionApply?: (
    ruleId: string,
    suggestion: string,
    range: { start: number; end: number; content: string },
    ruleType: RuleAnnotation['type'],
  ) => void
  /** Custom code-point → display symbol map. */
  codepointDisplayMap?: Record<number, string>
  /** Custom renderer for popover content per annotation. */
  renderPopoverContent?: PopoverContentRenderer
  /** Called when a link highlight is clicked. */
  onLinkClick?: (url: string) => void
  /** Whether clicking a link highlight should open the URL. Default: `true`. */
  openLinksOnClick?: boolean
  /** Called when a mention node is clicked. */
  onMentionClick?: (userId: string, userName: string) => void
  /** Called when a mention is inserted via the typeahead. */
  onMentionInsert?: (user: { id: string; name: string }) => void
  /** Converts a mention ID to model text. Default: `` id => `@{${id}}` `` */
  mentionSerialize?: (id: string) => string
  /** RegExp to detect mention patterns in pasted / imported text. */
  mentionPattern?: RegExp
  /** Custom DOM renderer for mention nodes. */
  renderMentionDOM?: MentionDOMRenderer
  /** Placeholder text */
  placeholder?: string
  /** Additional class name for the editor container */
  className?: string
  /** Text direction. `'ltr'` (default), `'rtl'`, or `'auto'`. */
  dir?: 'ltr' | 'rtl' | 'auto'
  /** Text direction for the highlight popover. */
  popoverDir?: 'ltr' | 'rtl' | 'auto' | 'inherit'
  /** Japanese-optimised font stack. */
  jpFont?: boolean
  /** Whether the editor content is editable. Default: `true`. */
  editable?: boolean
  /** Allow selection in read-only mode. Default: `false`. */
  readOnlySelectable?: boolean
  /** Disable built-in Lexical HistoryPlugin. Default: `false`. */
  disableHistory?: boolean
  /** Custom keydown handler. Return `true` to consume the event. */
  onKeyDown?: (event: KeyboardEvent) => boolean
}

// ─── CATEditor ───────────────────────────────────────────────────────────────
// Thin composition shell. All logic is delegated to hooks and plugins.

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
      popoverDir: popoverDirProp = 'ltr',
      jpFont = false,
      editable: editableProp = true,
      readOnlySelectable = false,
      disableHistory = false,
      onKeyDown: onKeyDownProp,
    },
    ref,
  ) {
    const isEditable = editableProp
    const containerRef = useRef<HTMLDivElement>(null)
    const editorRef = useRef<LexicalEditor | null>(null)
    const savedSelectionRef = useRef<{
      anchor: number
      focus: number
    } | null>(null)
    const annotationMapRef = useRef(new Map<string, RuleAnnotation>())

    // ── Mention config sync ────────────────────────────────────────
    useEffect(() => {
      setMentionNodeConfig({
        renderDOM: renderMentionDOM,
        serialize: mentionSerialize,
        pattern: mentionPattern,
      })
    }, [renderMentionDOM, mentionSerialize, mentionPattern])

    // ── Hooks ──────────────────────────────────────────────────────
    const flash = useFlash(editorRef, containerRef)

    const { popoverState, scheduleHide, cancelHide, isOverPopoverRef } =
      usePopoverHover(containerRef, {
        annotationMapRef,
        openLinksOnClick,
        onLinkClick,
        onMentionClick,
      })

    useEditorHandle(ref, { editorRef, savedSelectionRef, flash })

    // ── Suggestion click (replace highlighted text) ────────────────
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
              (node as any).__ruleIds &&
              (node as any).__ruleIds.split(',').includes(ruleId)
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

    // ── Effective codepoint display map ────────────────────────────
    const effectiveCodepointMap = useMemo(() => {
      let merged: Record<number, string> | undefined
      for (const rule of rules) {
        if (rule.type !== 'keyword') continue
        for (const entry of rule.entries) {
          if (!entry.atomic || !entry.displaySymbol) continue
          const src = entry.pattern
          let cp: number | undefined
          const uEsc = /^\\u([0-9A-Fa-f]{4})$/.exec(src)
          if (uEsc) {
            cp = parseInt(uEsc[1], 16)
          } else if ([...src].length === 1) {
            cp = src.codePointAt(0)
          }
          if (cp != null) {
            merged ??= {}
            merged[cp] = entry.displaySymbol
          }
        }
      }
      if (codepointDisplayMap) {
        merged = { ...merged, ...codepointDisplayMap }
      }
      return merged
    }, [rules, codepointDisplayMap])

    // ── Lexical config ─────────────────────────────────────────────
    const initialConfig = useMemo(
      () => ({
        namespace: 'CATEditor',
        theme: {
          root: 'cat-editor-root',
          paragraph: 'cat-editor-paragraph',
          text: { base: 'cat-editor-text' },
        },
        nodes: [HighlightNode, MentionNode],
        editable: isEditable || readOnlySelectable,
        onError: (error: Error) => {
          console.error('CATEditor Lexical error:', error)
        },
        editorState: () => {
          const root = $getRoot()
          for (const line of initialText.split('\n')) {
            const p = $createParagraphNode()
            p.append($createTextNode(line))
            root.append(p)
          }
        },
      }),
      [], // intentional: initialConfig should not change
    )

    // ── onChange handler ────────────────────────────────────────────
    const handleChange = useCallback(
      (editorState: { read: (fn: () => void) => void }) => {
        if (!onChange) return
        editorState.read(() => {
          onChange($getPlainText())
        })
      },
      [onChange],
    )

    // ── Render ─────────────────────────────────────────────────────
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

            {/* ── Plugins ── */}
            {!disableHistory && <HistoryPlugin />}
            <OnChangePlugin onChange={handleChange} />
            <HighlightsPlugin
              rules={rules}
              annotationMapRef={annotationMapRef}
              codepointDisplayMap={effectiveCodepointMap}
            />
            <EditorRefPlugin
              editorRef={editorRef}
              savedSelectionRef={savedSelectionRef}
            />
            <NLMarkerNavigationPlugin />
            {!isEditable && readOnlySelectable && <ReadOnlySelectablePlugin />}
            {onKeyDownProp && <KeyDownPlugin onKeyDown={onKeyDownProp} />}
            {dir && dir !== 'auto' && <DirectionPlugin dir={dir} />}
            <PasteCleanupPlugin />
            {rules
              .filter((r): r is IMentionRule => r.type === 'mention')
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
          dir={popoverDirProp === 'inherit' ? dir : popoverDirProp}
          codepointDisplayMap={effectiveCodepointMap}
        />
      </div>
    )
  },
)

export default CATEditor
