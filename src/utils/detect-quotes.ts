// ─── Types ────────────────────────────────────────────────────────────────────

export type QuoteType = 'single' | 'double'

export interface QuoteRange {
  /** Character index where the opening quote sits */
  start: number
  /** Character index where the closing quote sits – `null` when unclosed */
  end: number | null
  /** Which kind of quote */
  quoteType: QuoteType
  /** The text between the quotes (empty string when unclosed) */
  content: string
  /** Whether the quote pair is properly closed */
  closed: boolean
}

/**
 * Language-specific patterns whose trailing single-quote should NOT be treated
 * as a quote delimiter.
 *
 * Each value is an array of suffixes that, when found immediately before a `'`,
 * cause that apostrophe to be skipped.
 *
 * Example – `"english"` ships with common English contractions:
 * `don't`, `can't`, `won't`, `isn't`, `it's`, …
 */
export interface EscapePatterns {
  [language: string]: Array<string>
}

export const BUILTIN_ESCAPE_PATTERNS: EscapePatterns = {
  english: [
    "n't", // don't, can't, won't, shouldn't, …
    "'s", // it's, he's, she's, …
    "'re", // they're, we're, you're, …
    "'ve", // I've, they've, we've, …
    "'ll", // I'll, you'll, they'll, …
    "'m", // I'm
    "'d", // I'd, they'd, …
  ],
  default: [],
}

export interface DetectQuotesOptions {
  /**
   * When `true` (the default), enable contraction-aware escaping so that
   * apostrophes inside words like `don't` are not treated as quote delimiters.
   */
  escapeContractions?: boolean

  /**
   * Which set of escape patterns to apply.
   * Pass a key of `BUILTIN_ESCAPE_PATTERNS` (e.g. `"english"`) or supply
   * your own object conforming to `EscapePatterns`.
   *
   * @default "english"
   */
  escapePatterns?: string | EscapePatterns

  /**
   * When `true`, allow independent tracking of both quote types so they can
   * overlap (e.g. `"text 'a b" c'` produces two overlapping ranges).
   *
   * When `false` (the default), properly nested quotes are still detected,
   * but if an inner quote of the other type has not closed by the time the
   * outer quote closes, the inner pending quote is discarded to prevent
   * overlapping ranges.
   *
   * @default false
   */
  allowNesting?: boolean

  /**
   * When `true` (the default), quotes of the other type that open *and close*
   * inside an already-open quote are detected as separate ranges
   * (e.g. `'run away'` inside `"she told me 'run away' before dawn"`).
   *
   * When `false`, any quote character of the other type is treated as plain
   * text while an outer quote is open — no inner ranges are produced.
   *
   * Has no effect when `allowNesting` is `true` (everything is tracked
   * independently in that mode).
   *
   * @default true
   */
  detectInnerQuotes?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the effective escape-suffix list from the options bag.
 */
function resolveEscapeSuffixes(opts: DetectQuotesOptions): Array<string> {
  const patternsOpt = opts.escapePatterns ?? 'english'

  let patterns: EscapePatterns
  if (typeof patternsOpt === 'string') {
    patterns = BUILTIN_ESCAPE_PATTERNS
    return patterns[patternsOpt] ?? []
  }

  // Merge all provided language arrays into one flat list
  return Object.values(patternsOpt).flat()
}

/**
 * Returns `true` when the single-quote at `index` is part of a known
 * contraction / possessive pattern and should be skipped.
 */
function isContractionApostrophe(
  text: string,
  index: number,
  suffixes: Array<string>,
): boolean {
  for (const suffix of suffixes) {
    // The suffix already contains the apostrophe (e.g. "n't", "'s").
    // We need to figure out where the apostrophe sits inside `suffix`.
    const apostrophePositions: Array<number> = []
    for (let i = 0; i < suffix.length; i++) {
      if (suffix[i] === "'") apostrophePositions.push(i)
    }

    for (const ap of apostrophePositions) {
      // Start position of the full suffix in `text`
      const suffixStart = index - ap
      if (suffixStart < 0) continue
      const suffixEnd = suffixStart + suffix.length
      if (suffixEnd > text.length) continue

      const slice = text.slice(suffixStart, suffixEnd)
      if (slice !== suffix) continue

      // The character before the suffix must be a word character
      // (otherwise `'t` at the start of a string would match).
      if (suffixStart > 0 && /\w/.test(text[suffixStart - 1])) {
        return true
      }
    }
  }
  return false
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Scan `text` and return every quote range found.
 *
 * The returned `Map` is keyed by **both** the start and end position indices
 * of each quote, so you can look up a `QuoteRange` by either boundary.
 * For unclosed quotes only the start key is stored (end is `null`).
 *
 * ```ts
 * const result = detectQuotes(`She said "hello" and 'goodbye'`);
 * // Map {
 * //   10 => { start: 10, end: 16, quoteType: "double", content: "hello", closed: true },
 * //   16 => { start: 10, end: 16, quoteType: "double", content: "hello", closed: true },
 * //   22 => { start: 22, end: 30, quoteType: "single", content: "goodbye", closed: true },
 * //   30 => { start: 22, end: 30, quoteType: "single", content: "goodbye", closed: true },
 * // }
 * ```
 */
export function detectQuotes(
  text: string,
  options: DetectQuotesOptions = {},
): Map<number, QuoteRange> {
  const {
    escapeContractions = true,
    allowNesting = false,
    detectInnerQuotes = true,
  } = options

  const escapeSuffixes = escapeContractions
    ? resolveEscapeSuffixes(options)
    : []

  const result = new Map<number, QuoteRange>()

  // We maintain a small stack so that nested quotes work correctly.
  // Only one level per quote type can be "open" at a time.
  let openSingle: { start: number } | null = null
  let openDouble: { start: number } | null = null

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    // ── Handle backslash escapes (e.g. \" or \') ──────────────────────────
    if (ch === '\\') {
      i++ // skip the escaped character
      continue
    }

    // ── Double quote ──────────────────────────────────────────────────────
    if (ch === '"') {
      // When inner detection is off (and not in free-nesting mode),
      // skip entirely if we’re inside an open single quote.
      if (!allowNesting && !detectInnerQuotes && openSingle) continue

      if (openDouble) {
        // When nesting is off, discard any inner single quote that started
        // after this double quote opened — it would create an overlap.
        if (
          !allowNesting &&
          openSingle &&
          openSingle.start > openDouble.start
        ) {
          openSingle = null
        }

        // Close the current double-quoted range
        const range: QuoteRange = {
          start: openDouble.start,
          end: i,
          quoteType: 'double',
          content: text.slice(openDouble.start + 1, i),
          closed: true,
        }
        result.set(openDouble.start, range)
        result.set(i, range)
        openDouble = null
      } else {
        // Open a new double-quoted range
        openDouble = { start: i }
      }
      continue
    }

    // ── Single quote / apostrophe ─────────────────────────────────────────
    if (ch === "'") {
      // When inner detection is off (and not in free-nesting mode),
      // skip entirely if we’re inside an open double quote.
      if (!allowNesting && !detectInnerQuotes && openDouble) continue

      // Check contraction / possessive escaping BEFORE treating as quote
      if (
        escapeContractions &&
        escapeSuffixes.length > 0 &&
        isContractionApostrophe(text, i, escapeSuffixes)
      ) {
        continue // skip – this apostrophe belongs to a contraction
      }

      if (openSingle) {
        // When nesting is off, discard any inner double quote that started
        // after this single quote opened — it would create an overlap.
        if (
          !allowNesting &&
          openDouble &&
          openDouble.start > openSingle.start
        ) {
          openDouble = null
        }

        // Close the current single-quoted range
        const range: QuoteRange = {
          start: openSingle.start,
          end: i,
          quoteType: 'single',
          content: text.slice(openSingle.start + 1, i),
          closed: true,
        }
        result.set(openSingle.start, range)
        result.set(i, range)
        openSingle = null
      } else {
        // Open a new single-quoted range
        openSingle = { start: i }
      }
      continue
    }
  }

  // ── Record any unclosed quotes ────────────────────────────────────────────
  if (openSingle) {
    result.set(openSingle.start, {
      start: openSingle.start,
      end: null,
      quoteType: 'single',
      content: text.slice(openSingle.start + 1),
      closed: false,
    })
  }

  if (openDouble) {
    result.set(openDouble.start, {
      start: openDouble.start,
      end: null,
      quoteType: 'double',
      content: text.slice(openDouble.start + 1),
      closed: false,
    })
  }

  return result
}
