import type { HighlightSegment, IQuoteRule, MooRule, RawRange } from './types'

import { detectQuotes } from '@/utils/detect-quotes'

// ─── Tag detection helpers ────────────────────────────────────────────────────

/** Matches opening, closing, and self-closing HTML tags. */
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g

interface DetectedTag {
  start: number
  end: number
  tagName: string
  isClosing: boolean
  isSelfClosing: boolean
  originalText: string
}

/** Find all HTML tags, pair them using a stack, and assign sequential numbers.
 *  `detectInner` (default true) means innermost closing tags are matched first
 *  via the stack (LIFO). Unpaired tags are silently skipped. */
function detectAndPairTags(
  text: string,
  _detectInner = true,
): Array<{
  start: number
  end: number
  tagName: string
  tagNumber: number
  isClosing: boolean
  isSelfClosing: boolean
  originalText: string
  displayText: string
}> {
  // 1. Collect all tags
  const allTags: Array<DetectedTag> = []
  TAG_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TAG_RE.exec(text)) !== null) {
    const isClosing = m[1] === '/'
    const isSelfClosing = m[3] === '/' || (!isClosing && m[0].endsWith('/>'))
    allTags.push({
      start: m.index,
      end: m.index + m[0].length,
      tagName: m[2].toLowerCase(),
      isClosing,
      isSelfClosing,
      originalText: m[0],
    })
  }

  // 2. Pair using a stack; assign sequential numbers
  let nextNum = 1
  const stack: Array<{ name: string; num: number; idx: number }> = []
  const result: Array<{
    start: number
    end: number
    tagName: string
    tagNumber: number
    isClosing: boolean
    isSelfClosing: boolean
    originalText: string
    displayText: string
  }> = []

  for (let i = 0; i < allTags.length; i++) {
    const tag = allTags[i]

    if (tag.isSelfClosing) {
      const num = nextNum++
      result.push({
        ...tag,
        tagNumber: num,
        displayText: `<${num}/>`,
      })
    } else if (!tag.isClosing) {
      // Opening tag — push with assigned number
      const num = nextNum++
      stack.push({ name: tag.tagName, num, idx: i })
    } else {
      // Closing tag — find matching opening on the stack (innermost first)
      let matchIdx = -1
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j].name === tag.tagName) {
          matchIdx = j
          break
        }
      }
      if (matchIdx >= 0) {
        const openEntry = stack[matchIdx]
        stack.splice(matchIdx, 1)
        const openTag = allTags[openEntry.idx]

        // Add both opening and closing tags to the result
        result.push({
          ...openTag,
          tagNumber: openEntry.num,
          displayText: `<${openEntry.num}>`,
        })
        result.push({
          ...tag,
          tagNumber: openEntry.num,
          displayText: `</${openEntry.num}>`,
        })
      }
      // Unpaired closing tags are silently skipped
    }
  }

  // Sort by start position
  result.sort((a, b) => a.start - b.start)
  return result
}

/** Regex to classify a match as an HTML tag (opening, closing, self-closing). */
const HTML_TAG_CLASSIFY = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>$/

/** Detect tags using a custom pattern.  Matches that look like HTML tags
 *  are paired using a stack (same logic as `detectAndPairTags`).  All other
 *  matches are treated as standalone placeholders.  Everything is numbered
 *  with a shared counter so collapsed display texts are unique. */
function detectCustomTags(
  text: string,
  patternSource: string,
): Array<{
  start: number
  end: number
  tagName: string
  tagNumber: number
  isClosing: boolean
  isSelfClosing: boolean
  originalText: string
  displayText: string
}> {
  let re: RegExp
  try {
    re = new RegExp(patternSource, 'g')
  } catch {
    return []
  }

  // 1. Collect all matches and classify HTML-like ones
  interface RawMatch {
    start: number
    end: number
    text: string
    htmlName: string | null // non-null when the match is an HTML tag
    isClosing: boolean
    isSelfClosing: boolean
  }
  const matches: Array<RawMatch> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++
      continue
    }
    const htmlMatch = HTML_TAG_CLASSIFY.exec(m[0])
    if (htmlMatch) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        htmlName: htmlMatch[2].toLowerCase(),
        isClosing: htmlMatch[1] === '/',
        isSelfClosing:
          htmlMatch[3] === '/' || (!htmlMatch[1] && m[0].endsWith('/>')),
      })
    } else {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        htmlName: null,
        isClosing: false,
        isSelfClosing: false,
      })
    }
  }

  // 2. Pair HTML tags using a stack, assign numbers to everything
  type ResultItem = {
    start: number
    end: number
    tagName: string
    tagNumber: number
    isClosing: boolean
    isSelfClosing: boolean
    originalText: string
    displayText: string
  }
  let nextNum = 1
  const stack: Array<{ name: string; num: number; idx: number }> = []
  const result: Array<ResultItem> = []

  for (let i = 0; i < matches.length; i++) {
    const raw = matches[i]

    if (!raw.htmlName) {
      // Non-HTML placeholder — standalone
      const num = nextNum++
      result.push({
        start: raw.start,
        end: raw.end,
        tagName: raw.text,
        tagNumber: num,
        isClosing: false,
        isSelfClosing: false,
        originalText: raw.text,
        displayText: `<${num}>`,
      })
      continue
    }

    // HTML tag
    if (raw.isSelfClosing) {
      const num = nextNum++
      result.push({
        start: raw.start,
        end: raw.end,
        tagName: raw.htmlName,
        tagNumber: num,
        isClosing: false,
        isSelfClosing: true,
        originalText: raw.text,
        displayText: `<${num}/>`,
      })
    } else if (!raw.isClosing) {
      // Opening — push onto stack
      const num = nextNum++
      stack.push({ name: raw.htmlName, num, idx: i })
    } else {
      // Closing — find matching opening (innermost first)
      let matchIdx = -1
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j].name === raw.htmlName) {
          matchIdx = j
          break
        }
      }
      if (matchIdx >= 0) {
        const openEntry = stack[matchIdx]
        stack.splice(matchIdx, 1)
        const openRaw = matches[openEntry.idx]
        result.push({
          start: openRaw.start,
          end: openRaw.end,
          tagName: openRaw.htmlName!,
          tagNumber: openEntry.num,
          isClosing: false,
          isSelfClosing: false,
          originalText: openRaw.text,
          displayText: `<${openEntry.num}>`,
        })
        result.push({
          start: raw.start,
          end: raw.end,
          tagName: raw.htmlName,
          tagNumber: openEntry.num,
          isClosing: true,
          isSelfClosing: false,
          originalText: raw.text,
          displayText: `</${openEntry.num}>`,
        })
      }
      // Unpaired closing tags are silently skipped
    }
  }

  result.sort((a, b) => a.start - b.start)
  return result
}

// ─── Highlight computation (sweep-line with nesting) ──────────────────────────

export function computeHighlightSegments(
  text: string,
  rules: Array<MooRule>,
): Array<HighlightSegment> {
  // 1. Collect all raw ranges from rules
  const rawRanges: Array<RawRange> = []

  for (const rule of rules) {
    if (rule.type === 'spellcheck') {
      for (const v of rule.validations) {
        if (v.start < 0 || v.start >= v.end || !v.content) continue

        // Primary: use the provided offsets if the text still matches.
        // Fallback: if the text has been edited (typing, paste, etc.)
        // and the offsets are stale, search for the content string
        // near the original position. This keeps highlights correct
        // even when the user types and shifts the text around.
        let matchStart = -1
        let matchEnd = -1

        if (v.end <= text.length && text.slice(v.start, v.end) === v.content) {
          matchStart = v.start
          matchEnd = v.end
        } else {
          // Search within a window around the original offset
          const searchRadius = Math.max(64, v.content.length * 4)
          const searchFrom = Math.max(0, v.start - searchRadius)
          const searchTo = Math.min(text.length, v.end + searchRadius)
          const regionLower = text.slice(searchFrom, searchTo).toLowerCase()
          const contentLower = v.content.toLowerCase()
          const idx = regionLower.indexOf(contentLower)
          if (idx !== -1) {
            matchStart = searchFrom + idx
            matchEnd = matchStart + v.content.length
          }
        }

        if (matchStart >= 0) {
          rawRanges.push({
            start: matchStart,
            end: matchEnd,
            annotation: {
              type: 'spellcheck',
              id: `sc-${matchStart}-${matchEnd}`,
              data: v,
            },
          })
        }
      }
    } else if (rule.type === 'keyword') {
      const { label, entries } = rule
      for (const entry of entries) {
        if (!entry.pattern) continue

        let re: RegExp
        try {
          re = new RegExp(entry.pattern, 'g')
        } catch {
          continue // skip invalid regex
        }
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          if (m[0].length === 0) {
            re.lastIndex++
            continue
          }
          const matchStr = m[0]

          // Build codepoint string for atomic entries
          let codePoint: string | undefined
          if (entry.atomic) {
            codePoint = matchStr
              .split('')
              .map(
                (c) =>
                  'U+' +
                  (c.codePointAt(0) ?? 0)
                    .toString(16)
                    .toUpperCase()
                    .padStart(4, '0'),
              )
              .join(' ')
          }

          rawRanges.push({
            start: m.index,
            end: m.index + matchStr.length,
            annotation: {
              type: 'keyword',
              id: `kw-${label}-${m.index}-${m.index + matchStr.length}`,
              data: {
                label,
                pattern: entry.pattern,
                description: entry.description,
                atomic: entry.atomic,
                displaySymbol: entry.displaySymbol,
                matchedText: entry.atomic ? matchStr : undefined,
                codePoint,
              },
            },
          })
        }
      }
    } else if (rule.type === 'tag') {
      const pairs = rule.pattern
        ? detectCustomTags(text, rule.pattern)
        : detectAndPairTags(text, rule.detectInner ?? true)
      for (const p of pairs) {
        // isHtml: a match is HTML when it came from detectAndPairTags (always
        // HTML), or from detectCustomTags where tagName !== originalText
        // (i.e. the classifier extracted an HTML tag name).
        const isHtml = !rule.pattern || p.tagName !== p.originalText
        rawRanges.push({
          start: p.start,
          end: p.end,
          annotation: {
            type: 'tag',
            id: `tag-${p.start}-${p.end}`,
            data: {
              tagNumber: p.tagNumber,
              tagName: p.tagName,
              isClosing: p.isClosing,
              isSelfClosing: p.isSelfClosing,
              originalText: p.originalText,
              displayText: p.displayText,
              isHtml,
            },
          },
        })
      }
    } else if (rule.type === 'quote') {
      // Quote detection: detect quotes and produce annotations for each
      // opening/closing quote character with the configured replacement.
      const quoteMap = detectQuotes(text, rule.detectOptions)
      const seen = new Set<number>()
      for (const [, qr] of quoteMap) {
        // The Map is keyed by BOTH start and end positions (both
        // pointing to the same QuoteRange).  Deduplicate by qr.start
        // so each quote pair is processed exactly once.
        if (seen.has(qr.start)) continue
        seen.add(qr.start)

        const mapping =
          qr.quoteType === 'single' ? rule.singleQuote : rule.doubleQuote
        const originalChar = qr.quoteType === 'single' ? "'" : '"'

        // Opening quote
        rawRanges.push({
          start: qr.start,
          end: qr.start + 1,
          annotation: {
            type: 'quote',
            id: `q-${qr.quoteType}-open-${qr.start}`,
            data: {
              quoteType: qr.quoteType,
              position: 'opening',
              originalChar,
              replacementChar: mapping.opening,
            },
          },
        })

        // Closing quote (only if the pair is closed)
        if (qr.closed && qr.end !== null) {
          rawRanges.push({
            start: qr.end,
            end: qr.end + 1,
            annotation: {
              type: 'quote',
              id: `q-${qr.quoteType}-close-${qr.end}`,
              data: {
                quoteType: qr.quoteType,
                position: 'closing',
                originalChar,
                replacementChar: mapping.closing,
              },
            },
          })
        }
      }
    } else if (rule.type === 'link') {
      const defaultPattern = String.raw`https?:\/\/[^\s<>"']+|www\.[^\s<>"']+`
      const patternSource = rule.pattern ?? defaultPattern
      let re: RegExp
      try {
        re = new RegExp(patternSource, 'gi')
      } catch {
        continue
      }
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) {
          re.lastIndex++
          continue
        }
        // Trim trailing punctuation that's likely not part of the URL
        let matched = m[0]
        const trailingPunct = /[.,;:!?)}\]]+$/
        const trailingMatch = trailingPunct.exec(matched)
        if (trailingMatch) {
          matched = matched.slice(0, -trailingMatch[0].length)
        }
        const end = m.index + matched.length
        // Normalize: www. → https://www.
        const url = matched.startsWith('www.') ? 'https://' + matched : matched
        rawRanges.push({
          start: m.index,
          end,
          annotation: {
            type: 'link',
            id: `link-${m.index}-${end}`,
            data: {
              url,
              displayText: matched,
            },
          },
        })
      }
    }
  }

  if (rawRanges.length === 0) return []

  // 2. When tags are collapsed they must be atomic — suppress ALL non-tag
  //    ranges that overlap with a tag so the sweep-line never splits a tag
  //    into sub-segments.  When tags are expanded (or absent), keep every
  //    range so search/keyword can highlight inside tags normally.
  //
  //    Quote annotations that overlap with tag ranges are suppressed by
  //    default because quote characters inside HTML attributes (e.g.
  //    href="…") are tag syntax, not text-level quotes. The quote rule's
  //    `detectInTags` flag lets users opt-in to showing them.
  const tagRules = rules.filter((r) => r.type === 'tag')
  const tagsCollapsed = tagRules.some((r) => r.collapsed)
  const tagRanges = rawRanges.filter((r) => r.annotation.type === 'tag')
  const quoteDetectInTags = rules
    .filter((r): r is IQuoteRule => r.type === 'quote')
    .some((r) => r.detectInTags)

  let filteredRanges = rawRanges
  if (tagRanges.length > 0) {
    filteredRanges = rawRanges.filter((r) => {
      if (r.annotation.type === 'tag') return true
      // Suppress quotes inside tags unless detectInTags is enabled
      if (r.annotation.type === 'quote' && !quoteDetectInTags) {
        return !tagRanges.some((t) => r.start >= t.start && r.end <= t.end)
      }
      // Suppress everything else only when tags are collapsed
      if (tagsCollapsed) {
        return !tagRanges.some((t) => r.start < t.end && r.end > t.start)
      }
      return true
    })
  }

  // 3. Sweep-line: collect all unique boundary points
  const points = new Set<number>()
  for (const r of filteredRanges) {
    points.add(r.start)
    points.add(r.end)
  }
  const sortedPoints = [...points].sort((a, b) => a - b)

  // 4. For each pair of consecutive points, find all covering ranges
  //    This naturally handles nesting: overlapping ranges produce segments
  //    that carry ALL applicable annotations.
  const segments: Array<HighlightSegment> = []
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const segStart = sortedPoints[i]
    const segEnd = sortedPoints[i + 1]
    const annotations = filteredRanges
      .filter((r) => r.start <= segStart && r.end >= segEnd)
      .map((r) => r.annotation)
    if (annotations.length > 0) {
      segments.push({ start: segStart, end: segEnd, annotations })
    }
  }

  return segments
}
