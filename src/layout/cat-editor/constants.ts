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

/** Runtime override map set by the component layer.
 *  Merged on top of `CODEPOINT_DISPLAY_MAP` when resolving display symbols. */
let _codepointOverrides: Record<number, string> | undefined

/** Set the runtime code-point display overrides.  Called from the
 *  HighlightsPlugin whenever the rules change. */
export function setCodepointOverrides(
  overrides: Record<number, string> | undefined,
): void {
  _codepointOverrides = overrides
}

/** Resolve the effective display map (built-in + overrides). */
export function getEffectiveCodepointMap(): Record<number, string> {
  return _codepointOverrides
    ? { ...CODEPOINT_DISPLAY_MAP, ..._codepointOverrides }
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
  const map = overrides
    ? { ...CODEPOINT_DISPLAY_MAP, ...overrides }
    : getEffectiveCodepointMap()
  let result = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    result += map[cp] ?? ch
  }
  return result
}
