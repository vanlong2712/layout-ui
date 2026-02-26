/**
 * Code-point → visible display symbol.
 * Users can customise this map by importing and mutating it before rendering.
 * Used by HighlightNode to replace invisible characters with
 * visible placeholders in the editor DOM.
 */
export const CODEPOINT_DISPLAY_MAP: Record<number, string> = {
  0x0000: '␀',
  0x0009: '⇥',
  0x000a: '↩',
  0x000c: '␌',
  0x000d: '↵',
  0x00a0: '⍽',
  0x2002: '␣',
  0x2003: '␣',
  0x2009: '·',
  0x200a: '·',
  0x200b: '∅',
  0x200c: '⊘',
  0x200d: '⊕',
  0x2060: '⁀',
  0x3000: '□',
  0xfeff: '◊',
}

/** Prefix for line-break indicator node ruleIds — used to skip them when
 *  collecting text so they don't duplicate on re-highlight passes. */
export const NL_MARKER_PREFIX = '__nl-'

/** Replace invisible / special characters with visible display symbols. */
export function replaceInvisibleChars(text: string): string {
  let result = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    result += CODEPOINT_DISPLAY_MAP[cp] ?? ch
  }
  return result
}
