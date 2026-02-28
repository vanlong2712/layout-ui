import { useImperativeHandle } from 'react'
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
} from 'lexical'

import { $isHighlightNode } from '../../cat-editor/highlight-node'
import {
  $getPlainText,
  $globalOffsetToPoint,
  $pointToGlobalOffset,
} from '../../cat-editor/selection-helpers'

import type { EditorUpdateOptions, LexicalEditor } from 'lexical'
import type { CATEditorRef } from '../../cat-editor/types'
import type { FlashControls } from './use-flash'

// ─── useEditorHandle ─────────────────────────────────────────────────────────
// Builds the imperative CATEditorRef via useImperativeHandle.
// All methods are delegated to the editor instance, flash controls,
// or the saved selection ref.

export function useEditorHandle(
  ref: React.ForwardedRef<CATEditorRef>,
  deps: {
    editorRef: React.MutableRefObject<LexicalEditor | null>
    savedSelectionRef: React.MutableRefObject<{
      anchor: number
      focus: number
    } | null>
    flash: FlashControls
  },
) {
  const { editorRef, savedSelectionRef, flash } = deps

  useImperativeHandle(
    ref,
    () => ({
      insertText: (text: string) => {
        const editor = editorRef.current
        if (!editor) return

        editor.update(() => {
          const saved = savedSelectionRef.current
          if (saved) {
            const anchorPt = $globalOffsetToPoint(saved.anchor)
            const focusPt = $globalOffsetToPoint(saved.focus)
            if (anchorPt && focusPt) {
              // Token-mode nodes are atomic — insert before/after, not into
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

          // Fallback: append at end
          const root = $getRoot()
          const lastChild = root.getLastChild()
          if (lastChild) lastChild.selectEnd()
          const sel = $createRangeSelection()
          $setSelection(sel)
          sel.insertText(text)
        })

        editor.focus()
      },

      focus: () => {
        editorRef.current?.focus()
      },

      getText: () => {
        let text = ''
        editorRef.current?.getEditorState().read(() => {
          text = $getPlainText()
        })
        return text
      },

      setText: (text: string, options?: EditorUpdateOptions) => {
        const editor = editorRef.current
        if (!editor) return
        editor.update(() => {
          const root = $getRoot()
          root.clear()
          if (!text) {
            root.append($createParagraphNode())
            return
          }
          const lines = text.split('\n')
          if (lines.length > 1 && lines[lines.length - 1] === '') {
            lines.pop()
          }
          for (const line of lines) {
            const p = $createParagraphNode()
            p.append($createTextNode(line))
            root.append(p)
          }
        }, options)
      },

      getSelection: () => {
        const editor = editorRef.current
        if (!editor) return null
        let result: { anchor: number; focus: number } | null = null
        editor.getEditorState().read(() => {
          const sel = $getSelection()
          if ($isRangeSelection(sel)) {
            result = {
              anchor: $pointToGlobalOffset(sel.anchor.key, sel.anchor.offset),
              focus: $pointToGlobalOffset(sel.focus.key, sel.focus.offset),
            }
          }
        })
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        return result ?? savedSelectionRef.current
      },

      setSelection: (anchor: number, focus: number) => {
        const editor = editorRef.current
        if (!editor) return
        editor.update(() => {
          const anchorPt = $globalOffsetToPoint(anchor)
          const focusPt = $globalOffsetToPoint(focus)
          if (anchorPt && focusPt) {
            const sel = $createRangeSelection()
            sel.anchor.set(anchorPt.key, anchorPt.offset, anchorPt.type)
            sel.focus.set(focusPt.key, focusPt.offset, focusPt.type)
            $setSelection(sel)
          }
        })
        editor.focus()
      },

      focusStart: () => {
        const editor = editorRef.current
        if (!editor) return
        editor.update(() => {
          const root = $getRoot()
          const first = root.getFirstChild()
          if (first) first.selectStart()
        })
        editor.focus()
      },

      focusEnd: () => {
        const editor = editorRef.current
        if (!editor) return
        editor.update(() => {
          const root = $getRoot()
          const last = root.getLastChild()
          if (last) last.selectEnd()
        })
        editor.focus()
      },

      replaceAll: (search: string, replacement: string): number => {
        const editor = editorRef.current
        if (!editor || !search) return 0

        let count = 0
        editor.update(() => {
          const fullText = $getPlainText()

          let idx = 0
          while ((idx = fullText.indexOf(search, idx)) !== -1) {
            count++
            idx += search.length
          }
          if (count === 0) return

          const newText = fullText.split(search).join(replacement)
          const root = $getRoot()
          root.clear()
          const lines = newText.split('\n')
          if (lines.length > 1 && lines[lines.length - 1] === '') {
            lines.pop()
          }
          for (const line of lines) {
            const p = $createParagraphNode()
            p.append($createTextNode(line))
            root.append(p)
          }
        })

        return count
      },

      flashHighlight: flash.flashHighlight,
      flashRange: flash.flashRange,
      clearFlash: flash.clearFlash,

      getEditor: () => editorRef.current,
    }),
    [editorRef, savedSelectionRef, flash],
  )
}
