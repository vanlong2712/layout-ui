import { describe, expect, it } from 'vitest'

import { BUILTIN_ESCAPE_PATTERNS, detectQuotes } from '../detect-quotes'

import type { QuoteRange } from '../detect-quotes'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deduplicate the Map values (start & end both point to the same object). */
function uniqueRanges(result: Map<number, QuoteRange>): Array<QuoteRange> {
  const seen = new Set<QuoteRange>()
  for (const v of result.values()) {
    seen.add(v)
  }
  return [...seen].sort((a, b) => a.start - b.start)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('detectQuotes', () => {
  // ── Basic double quotes ───────────────────────────────────────────────

  describe('basic double quotes', () => {
    it('detects a single double-quoted string', () => {
      const result = detectQuotes('She said "hello" to him')
      const ranges = uniqueRanges(result)

      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({
        start: 9,
        end: 15,
        quoteType: 'double',
        content: 'hello',
        closed: true,
      })
    })

    it('detects multiple double-quoted strings', () => {
      const result = detectQuotes('"alpha" and "beta"')
      const ranges = uniqueRanges(result)

      expect(ranges).toHaveLength(2)
      expect(ranges[0]).toMatchObject({ content: 'alpha', closed: true })
      expect(ranges[1]).toMatchObject({ content: 'beta', closed: true })
    })

    it('handles empty double quotes', () => {
      const result = detectQuotes('empty "" here')
      const ranges = uniqueRanges(result)

      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({
        content: '',
        closed: true,
        quoteType: 'double',
      })
    })
  })

  // ── Basic single quotes ───────────────────────────────────────────────

  describe('basic single quotes', () => {
    it('detects a single-quoted string', () => {
      const result = detectQuotes("the word 'test' here")
      const ranges = uniqueRanges(result)

      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({
        start: 9,
        end: 14,
        quoteType: 'single',
        content: 'test',
        closed: true,
      })
    })

    it('handles empty single quotes', () => {
      const result = detectQuotes("empty '' here")
      const ranges = uniqueRanges(result)

      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({
        content: '',
        closed: true,
        quoteType: 'single',
      })
    })
  })

  // ── Mixed quotes ──────────────────────────────────────────────────────

  describe('mixed quotes', () => {
    it('detects both single and double quotes in the same string', () => {
      const result = detectQuotes(`She said "hello" and 'goodbye'`)
      const ranges = uniqueRanges(result)

      expect(ranges).toHaveLength(2)
      expect(ranges[0]).toMatchObject({
        quoteType: 'double',
        content: 'hello',
        closed: true,
      })
      expect(ranges[1]).toMatchObject({
        quoteType: 'single',
        content: 'goodbye',
        closed: true,
      })
    })
  })

  // ── Map keying ────────────────────────────────────────────────────────

  describe('Map keying', () => {
    it('stores each closed range under both start and end keys', () => {
      const result = detectQuotes('"abc"')
      // start = 0, end = 4
      expect(result.get(0)).toBe(result.get(4))
      expect(result.get(0)!.content).toBe('abc')
    })

    it('stores unclosed range only under start key', () => {
      const result = detectQuotes('"unclosed')
      expect(result.has(0)).toBe(true)
      expect(result.get(0)!.closed).toBe(false)
      expect(result.get(0)!.end).toBeNull()
    })
  })

  // ── Unclosed quotes ───────────────────────────────────────────────────

  describe('unclosed quotes', () => {
    it('detects an unclosed double quote', () => {
      const result = detectQuotes('start "unclosed text')
      const ranges = uniqueRanges(result)

      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({
        start: 6,
        end: null,
        quoteType: 'double',
        content: 'unclosed text',
        closed: false,
      })
    })

    it('detects an unclosed single quote', () => {
      const result = detectQuotes("start 'unclosed text")
      const ranges = uniqueRanges(result)

      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({
        end: null,
        quoteType: 'single',
        closed: false,
      })
    })

    it('detects both unclosed single and double quotes', () => {
      const result = detectQuotes(`"abc 'def`)
      const ranges = uniqueRanges(result)

      expect(ranges).toHaveLength(2)
      expect(ranges[0]).toMatchObject({
        quoteType: 'double',
        closed: false,
      })
      expect(ranges[1]).toMatchObject({
        quoteType: 'single',
        closed: false,
      })
    })
  })

  // ── Backslash escaping ────────────────────────────────────────────────

  describe('backslash escaping', () => {
    it('skips escaped double quotes', () => {
      const result = detectQuotes(String.raw`"hello \" world"`)
      const ranges = uniqueRanges(result)

      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({
        content: String.raw`hello \" world`,
        closed: true,
      })
    })

    it('skips escaped single quotes', () => {
      const result = detectQuotes(String.raw`'it\'s fine'`)
      const ranges = uniqueRanges(result)

      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({
        closed: true,
        quoteType: 'single',
      })
    })
  })

  // ── Contraction escaping (English) ────────────────────────────────────

  describe('contraction escaping', () => {
    it("treats apostrophes in contractions as non-quote (don't)", () => {
      const result = detectQuotes("I don't know")
      const ranges = uniqueRanges(result)

      // The apostrophe in "don't" should be skipped; no quotes detected
      expect(ranges).toHaveLength(0)
    })

    it("handles it's, they're, we've, I'll, I'm, he'd", () => {
      const texts = [
        "it's fine",
        "they're here",
        "we've done it",
        "I'll go",
        "I'm happy",
        "he'd say",
      ]
      for (const text of texts) {
        const ranges = uniqueRanges(detectQuotes(text))
        expect(ranges).toHaveLength(0)
      }
    })

    it('detects quotes around contractions', () => {
      const result = detectQuotes(`"don't stop"`)
      const ranges = uniqueRanges(result)

      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({
        quoteType: 'double',
        content: "don't stop",
        closed: true,
      })
    })

    it('disables contraction escaping when escapeContractions is false', () => {
      const result = detectQuotes("don't stop", {
        escapeContractions: false,
      })
      const ranges = uniqueRanges(result)

      // Now the apostrophe in "don't" is treated as a quote
      expect(ranges.some((r) => r.quoteType === 'single')).toBe(true)
    })
  })

  // ── Custom escape patterns ────────────────────────────────────────────

  describe('custom escape patterns', () => {
    it('uses a named builtin pattern set', () => {
      // "english" is the default, same behavior
      const result = detectQuotes("can't", { escapePatterns: 'english' })
      expect(uniqueRanges(result)).toHaveLength(0)
    })

    it('uses "default" pattern set (empty — no contraction awareness)', () => {
      const result = detectQuotes("can't", { escapePatterns: 'default' })
      // "default" has no patterns, so the apostrophe IS a quote
      const ranges = uniqueRanges(result)
      expect(ranges.some((r) => r.quoteType === 'single')).toBe(true)
    })

    it('accepts a custom EscapePatterns object', () => {
      const result = detectQuotes("can't", {
        escapePatterns: { custom: ["n't"] },
      })
      expect(uniqueRanges(result)).toHaveLength(0)
    })
  })

  // ── Nested quotes (detectInnerQuotes) ─────────────────────────────────

  describe('nested quotes (detectInnerQuotes)', () => {
    const text = `He whispered "she told me 'run away' before dawn"`

    it('detects inner quotes by default (detectInnerQuotes=true)', () => {
      const ranges = uniqueRanges(detectQuotes(text))

      // Should find both: outer double, inner single
      expect(ranges).toHaveLength(2)
      expect(ranges[0]).toMatchObject({
        quoteType: 'double',
        content: "she told me 'run away' before dawn",
        closed: true,
      })
      expect(ranges[1]).toMatchObject({
        quoteType: 'single',
        content: 'run away',
        closed: true,
      })
    })

    it('suppresses inner quotes when detectInnerQuotes=false', () => {
      const ranges = uniqueRanges(
        detectQuotes(text, { detectInnerQuotes: false }),
      )

      // Only the outer double should be detected
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({
        quoteType: 'double',
        content: "she told me 'run away' before dawn",
      })
    })
  })

  // ── allowNesting ──────────────────────────────────────────────────────

  describe('allowNesting', () => {
    it('discards inner pending quote of other type when nesting is off (default)', () => {
      // The inner single quote opens AFTER the double, and is still open
      // when the double closes — it should be discarded.
      // But the trailing `'` at index 13 opens a new (unclosed) single quote.
      const text = `"text 'a b" c'`
      const ranges = uniqueRanges(detectQuotes(text))

      // The double quote should be closed
      const doubleRanges = ranges.filter((r) => r.quoteType === 'double')
      expect(doubleRanges).toHaveLength(1)
      expect(doubleRanges[0]).toMatchObject({
        content: "text 'a b",
        closed: true,
      })

      // The inner single is discarded, but the trailing `'` at 13 starts
      // a new unclosed single range
      const singleRanges = ranges.filter((r) => r.quoteType === 'single')
      expect(singleRanges).toHaveLength(1)
      expect(singleRanges[0]).toMatchObject({
        start: 13,
        closed: false,
      })
    })

    it('keeps both overlapping ranges when allowNesting=true', () => {
      const text = `"text 'a b" c'`
      const ranges = uniqueRanges(detectQuotes(text, { allowNesting: true }))

      expect(ranges).toHaveLength(2)
      expect(ranges[0]).toMatchObject({
        quoteType: 'double',
        content: "text 'a b",
        closed: true,
      })
      expect(ranges[1]).toMatchObject({
        quoteType: 'single',
        content: 'a b" c',
        closed: true,
      })
    })
  })

  // ── Edge cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns empty map for empty string', () => {
      expect(detectQuotes('')).toEqual(new Map())
    })

    it('returns empty map for string with no quotes', () => {
      expect(detectQuotes('hello world 123')).toEqual(new Map())
    })

    it('handles string that is just a quote character', () => {
      const resultDouble = detectQuotes('"')
      expect(uniqueRanges(resultDouble)).toHaveLength(1)
      expect(uniqueRanges(resultDouble)[0]).toMatchObject({
        closed: false,
        quoteType: 'double',
      })

      const resultSingle = detectQuotes("'")
      expect(uniqueRanges(resultSingle)).toHaveLength(1)
      expect(uniqueRanges(resultSingle)[0]).toMatchObject({
        closed: false,
        quoteType: 'single',
      })
    })

    it('handles consecutive quotes', () => {
      const result = detectQuotes('""')
      const ranges = uniqueRanges(result)
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({
        content: '',
        closed: true,
        quoteType: 'double',
      })
    })

    it('handles quote at the very start and end of the string', () => {
      const result = detectQuotes('"entire string"')
      const ranges = uniqueRanges(result)
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({
        start: 0,
        end: 14,
        content: 'entire string',
        closed: true,
      })
    })

    it('handles multiline text', () => {
      const result = detectQuotes('"line1\nline2"')
      const ranges = uniqueRanges(result)
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({
        content: 'line1\nline2',
        closed: true,
      })
    })
  })

  // ── BUILTIN_ESCAPE_PATTERNS ───────────────────────────────────────────

  describe('BUILTIN_ESCAPE_PATTERNS', () => {
    it('has english patterns', () => {
      expect(BUILTIN_ESCAPE_PATTERNS.english).toBeDefined()
      expect(BUILTIN_ESCAPE_PATTERNS.english.length).toBeGreaterThan(0)
    })

    it('has empty default patterns', () => {
      expect(BUILTIN_ESCAPE_PATTERNS.default).toEqual([])
    })
  })

  // ── Complex scenarios ─────────────────────────────────────────────────

  describe('complex scenarios', () => {
    it('handles properly nested and closed inner quotes', () => {
      // Outer double, inner single, both closed properly
      const text = `"she said 'hello' to me"`
      const ranges = uniqueRanges(detectQuotes(text))

      expect(ranges).toHaveLength(2)
      expect(ranges[0]).toMatchObject({
        quoteType: 'double',
        closed: true,
      })
      expect(ranges[1]).toMatchObject({
        quoteType: 'single',
        content: 'hello',
        closed: true,
      })
    })

    it('handles alternating quote types', () => {
      const text = `'first' "second" 'third'`
      const ranges = uniqueRanges(detectQuotes(text))

      expect(ranges).toHaveLength(3)
      expect(ranges[0]).toMatchObject({
        quoteType: 'single',
        content: 'first',
      })
      expect(ranges[1]).toMatchObject({
        quoteType: 'double',
        content: 'second',
      })
      expect(ranges[2]).toMatchObject({
        quoteType: 'single',
        content: 'third',
      })
    })

    it('handles contraction INSIDE a double-quoted string', () => {
      const text = `"I can't believe it"`
      const ranges = uniqueRanges(detectQuotes(text))

      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({
        quoteType: 'double',
        content: "I can't believe it",
        closed: true,
      })
    })

    it('handles multiple contractions without generating false quotes', () => {
      const text = "they're saying he'd've gone if it's true"
      const ranges = uniqueRanges(detectQuotes(text))
      // All apostrophes are contractions — no quote ranges
      expect(ranges).toHaveLength(0)
    })
  })
})
