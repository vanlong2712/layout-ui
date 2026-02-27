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

/** Build the effective display map (built-in + optional overrides). */
export function getEffectiveCodepointMap(
  overrides?: Record<number, string>,
): Record<number, string> {
  return overrides
    ? { ...CODEPOINT_DISPLAY_MAP, ...overrides }
    : CODEPOINT_DISPLAY_MAP
}

/** Prefix for line-break indicator node ruleIds — used to skip them when
 *  collecting text so they don't duplicate on re-highlight passes. */
export const NL_MARKER_PREFIX = '__nl-'

/** Replace invisible / special characters with visible display symbols.
 *  When `overrides` is provided it is merged on top of `CODEPOINT_DISPLAY_MAP`. */
export function replaceInvisibleChars(
  text: string,
  overrides?: Record<number, string>,
): string {
  const map = getEffectiveCodepointMap(overrides)
  let result = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    result += map[cp] ?? ch
  }
  return result
}
