import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection } from 'lexical'

import { $pointToGlobalOffset } from '../../cat-editor/selection-helpers'

import type { LexicalEditor } from 'lexical'

// ─── EditorRefPlugin ─────────────────────────────────────────────────────────
// Tracks the Lexical editor instance and persists the last known selection
// as global character offsets so that `insertText` works even after blur.

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

  // Persist selection on every update (typing, arrows, click, etc.)
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
