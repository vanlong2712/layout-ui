/**
 * Visual display symbols for special / invisible characters.
 * Used in both the popover and inline badges so users can
 * immediately recognise the character without memorising code-points.
 */
export const SPECIAL_CHAR_DISPLAY_MAP: Record<string, string> = {
  Space: '·',
  Ampersand: '&',
  Tab: '⇥',
  'Non-Breaking Space': '⍽',
  'En Space': '␣',
  'Em Space': '␣',
  'Thin Space': '·',
  'Ideographic Space': '□',
  'Hair Space': '·',
  'Zero-Width Space': '∅',
  'Zero-Width Non-Joiner': '⊘',
  'Zero-Width Joiner': '⊕',
  'Word Joiner': '⁀',
  'BOM / Zero-Width No-Break Space': '◊',
  'Carriage Return': '↵',
  'Form Feed': '␌',
  'Null Character': '␀',
  'Line Break': '↩',
}

/**
 * Reverse lookup: code-point → visible display symbol.
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
