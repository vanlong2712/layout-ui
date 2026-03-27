import { useEffect, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
} from 'lexical'

import { $getPlainText, $pointToGlobalOffset } from '../selection-helpers'

import type { IQuoteReplaceRule } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Unicode letter test — covers ALL scripts (Latin, Cyrillic, CJK, Arabic…). */
const UNICODE_LETTER_RE = /\p{L}/u

/** Opening context: whitespace, start-of-text, opening brackets, dashes. */
const OPENING_CONTEXT_RE = /[\s([{\u2014\u2013-]$/

function isOpeningContext(textBefore: string): boolean {
  if (textBefore.length === 0) return true
  return OPENING_CONTEXT_RE.test(textBefore)
}

// ─── Pending revert state ────────────────────────────────────────────────────

/**
 * Tracks a single-quote replacement that may need to be reverted if the
 * very next keystroke turns out to be a Unicode letter (meaning the `'`
 * was a mid-word apostrophe — contraction, elision, glottal stop, etc.).
 */
interface PendingRevert {
  /** Global char offset where the replacement was inserted. */
  offset: number
  /** Length of the replacement string (may be >1 for multi-codepoint chars). */
  length: number
  /** The original quote character that was replaced (`'`). */
  originalChar: string
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

interface QuoteAutoReplacePluginProps {
  quoteRule: IQuoteReplaceRule
}

/**
 * Intercepts `'` and `"` keystrokes and replaces them with the configured
 * opening/closing quote characters from the `IQuoteRule`.
 *
 * Three modes:
 *
 * - **`'always'`** — Replace immediately.  Correct for curly/smart quotes
 *   where the closing char IS the typographic apostrophe.
 *
 * - **`'post-hoc'`** — Replace immediately, then revert if the very next
 *   keystroke is a Unicode letter (meaning `'` was a mid-word apostrophe).
 *   Works for ALL 40+ languages without per-language configuration.
 *
 * - **`'opening-only'`** — Only replace in unambiguous opening context
 *   (after whitespace, line start, or opening bracket).  Safest mode.
 *
 * Only affects user keystrokes — paste, programmatic updates (cross-history
 * `setText`), and existing text are never touched.
 */
export function QuoteAutoReplacePlugin({
  quoteRule,
}: QuoteAutoReplacePluginProps) {
  const [editor] = useLexicalComposerContext()
  const composingRef = useRef(false)
  const pendingRevertRef = useRef<PendingRevert | null>(null)

  // Track IME composition — clear pendingRevert on compositionstart
  useEffect(() => {
    const root = editor.getRootElement()
    if (!root) return
    const onStart = () => {
      composingRef.current = true
      pendingRevertRef.current = null
    }
    const onEnd = () => {
      composingRef.current = false
    }
    root.addEventListener('compositionstart', onStart)
    root.addEventListener('compositionend', onEnd)
    return () => {
      root.removeEventListener('compositionstart', onStart)
      root.removeEventListener('compositionend', onEnd)
    }
  }, [editor])

  // Clear pendingRevert on blur
  useEffect(() => {
    const root = editor.getRootElement()
    if (!root) return
    const onBlur = () => {
      pendingRevertRef.current = null
    }
    root.addEventListener('blur', onBlur)
    return () => {
      root.removeEventListener('blur', onBlur)
    }
  }, [editor])

  useEffect(() => {
    const mode = quoteRule.autoReplace

    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        // Skip during IME composition
        if (event.isComposing || composingRef.current) return false

        // Skip if modifiers (except Shift which is needed for ")
        if (event.ctrlKey || event.metaKey || event.altKey) return false

        const key = event.key

        // ── Post-hoc revert check ──────────────────────────────────
        // If there's a pending revert from a previous single-quote
        // replacement, check whether this keystroke is a Unicode letter.
        //
        // Letter  → mid-word apostrophe → revert replacement + insert letter
        // Else    → was a closing quote → keep replacement, clear pending
        const pending = pendingRevertRef.current
        if (pending) {
          if (key === 'Backspace' || key === 'Delete' || key === 'Escape') {
            // User is editing / cancelling — clear pending, let Lexical handle
            pendingRevertRef.current = null
            return false
          }

          // Printable single character that is a Unicode letter
          if (key.length === 1 && UNICODE_LETTER_RE.test(key)) {
            // letter + ' + letter → mid-word apostrophe → revert!
            event.preventDefault()
            const revert = pendingRevertRef.current!
            pendingRevertRef.current = null

            editor.update(
              () => {
                const selection = $getSelection()
                if (!$isRangeSelection(selection)) return

                // Cursor sits right after the replacement char.
                // Select backwards over the replacement, then insert
                // the original apostrophe + the new letter in one shot.
                // This produces a single Lexical update — no flicker.
                selection.anchor.set(
                  selection.anchor.key,
                  Math.max(0, selection.anchor.offset - revert.length),
                  'text',
                )
                selection.insertRawText(revert.originalChar + key)
              },
              { tag: 'quote-auto-replace' },
            )

            return true
          }

          // Non-letter → the replacement was correct (closing quote), keep it
          pendingRevertRef.current = null
          // Fall through — might be another quote char to handle below
        }

        // ── Main quote replacement logic ───────────────────────────
        if (key !== '"' && key !== "'") return false

        event.preventDefault()

        editor.update(
          () => {
            const selection = $getSelection()
            if (!$isRangeSelection(selection)) return

            const fullText = $getPlainText()
            const anchorOffset = $pointToGlobalOffset(
              selection.anchor.key,
              selection.anchor.offset,
            )
            const textBefore = fullText.slice(0, anchorOffset)

            const mapping =
              key === '"' ? quoteRule.doubleQuote : quoteRule.singleQuote

            const opening = isOpeningContext(textBefore)

            // 'opening-only' mode skips replacement when not opening context
            if (mode === 'opening-only' && !opening) {
              selection.insertText(key)
              return
            }

            const replacement = opening ? mapping.opening : mapping.closing

            selection.insertText(replacement)

            // ── Post-hoc setup (single quote only, 'post-hoc' mode) ──
            // Double quotes never appear mid-word in any natural language,
            // so only single quotes need post-hoc correction.
            //
            // We arm the revert only when:
            // 1. We inserted a closing single quote
            // 2. The char before cursor was a Unicode letter (potential mid-word)
            if (
              key === "'" &&
              mode === 'post-hoc' &&
              !opening &&
              textBefore.length > 0 &&
              UNICODE_LETTER_RE.test(textBefore[textBefore.length - 1])
            ) {
              pendingRevertRef.current = {
                offset: anchorOffset,
                length: replacement.length,
                originalChar: key,
              }
            }
          },
          { tag: 'quote-auto-replace' },
        )

        return true
      },
      COMMAND_PRIORITY_HIGH,
    )
  }, [editor, quoteRule])

  return null
}
