import { useEffect, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getRoot,
  $isParagraphNode,
  COMMAND_PRIORITY_CRITICAL,
  KEY_DOWN_COMMAND,
  PASTE_COMMAND,
} from 'lexical'

// ─── ReadOnlySelectablePlugin ────────────────────────────────────────────────
// Blocks all content-mutating key presses while keeping caret & selection
// functional.  Registered at CRITICAL priority so it fires before Lexical's
// own handlers.

export function ReadOnlySelectablePlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        // Allow navigation, selection, copy, find, etc.
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
          ((event.ctrlKey || event.metaKey) &&
            (event.key === 'c' ||
              event.key === 'a' ||
              event.key === 'f' ||
              event.key === 'g'))
        ) {
          return false
        }
        // Block everything else (typing, Enter, Backspace, Delete, paste, cut…)
        event.preventDefault()
        return true
      },
      COMMAND_PRIORITY_CRITICAL,
    )
  }, [editor])

  // Block paste, cut, and drop at the DOM level
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

// ─── KeyDownPlugin ───────────────────────────────────────────────────────────
// Fires the consumer's `onKeyDown` before Lexical processes the event.
// If the callback returns `true`, the event is consumed (preventDefault).

export function KeyDownPlugin({
  onKeyDown,
}: {
  onKeyDown: (event: KeyboardEvent) => boolean
}) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => onKeyDown(event),
      COMMAND_PRIORITY_CRITICAL,
    )
  }, [editor, onKeyDown])

  return null
}

// ─── DirectionPlugin ─────────────────────────────────────────────────────────
// Sets the Lexical root node's direction so that the reconciler stops
// adding `dir="auto"` to paragraph elements.

export function DirectionPlugin({ dir }: { dir: 'ltr' | 'rtl' }) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    editor.update(() => {
      $getRoot().setDirection(dir)
    })
    return () => {
      editor.update(() => {
        $getRoot().setDirection(null)
      })
    }
  }, [editor, dir])

  return null
}

// ─── PasteCleanupPlugin ─────────────────────────────────────────────────────
// Removes the trailing empty paragraph that Lexical sometimes creates
// when pasting into a cleared editor (Ctrl+A → Backspace → Ctrl+V).

export function PasteCleanupPlugin() {
  const [editor] = useLexicalComposerContext()
  const isPastingRef = useRef(false)

  useEffect(() => {
    const unregCommand = editor.registerCommand(
      PASTE_COMMAND,
      () => {
        isPastingRef.current = true
        return false // let Lexical handle the paste normally
      },
      COMMAND_PRIORITY_CRITICAL,
    )

    const unregUpdate = editor.registerUpdateListener(() => {
      if (!isPastingRef.current) return
      isPastingRef.current = false

      editor.update(
        () => {
          const root = $getRoot()
          const children = root.getChildren()
          if (children.length > 1) {
            const last = children[children.length - 1]
            if ($isParagraphNode(last) && last.getTextContentSize() === 0) {
              last.remove()
            }
          }
        },
        { tag: 'history-merge' },
      )
    })

    return () => {
      unregCommand()
      unregUpdate()
    }
  }, [editor])

  return null
}
