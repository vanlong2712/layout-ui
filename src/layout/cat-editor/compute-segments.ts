import type {
  HighlightSegment,
  ISpecialCharEntry,
  MooRule,
  RawRange,
} from './types'

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
    } else if (rule.type === 'glossary') {
      const { label, entries } = rule
      for (const entry of entries) {
        if (!entry.term) continue
        const lowerText = text.toLowerCase()
        const lowerTerm = entry.term.toLowerCase()
        let idx = 0
        while ((idx = lowerText.indexOf(lowerTerm, idx)) !== -1) {
          rawRanges.push({
            start: idx,
            end: idx + entry.term.length,
            annotation: {
              type: 'glossary',
              id: `gl-${label}-${idx}-${idx + entry.term.length}`,
              data: {
                label,
                term: entry.term,
                description: entry.description,
              },
            },
          })
          idx += entry.term.length
        }
      }
    } else if (rule.type === 'tag') {
      const pairs = detectAndPairTags(text, rule.detectInner ?? true)
      for (const p of pairs) {
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
            },
          },
        })
      }
    } else {
      // special-char
      const allEntries: Array<ISpecialCharEntry> = [...rule.entries]
      for (const entry of allEntries) {
        // Make a global copy of the pattern so we can iterate all matches
        const flags = entry.pattern.flags.includes('g')
          ? entry.pattern.flags
          : entry.pattern.flags + 'g'
        const re = new RegExp(entry.pattern.source, flags)
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const matchStr = m[0]
          const cp = matchStr
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
          rawRanges.push({
            start: m.index,
            end: m.index + matchStr.length,
            annotation: {
              type: 'special-char',
              id: `sp-${m.index}-${m.index + matchStr.length}`,
              data: { name: entry.name, char: matchStr, codePoint: cp },
            },
          })
        }
      }
    }
  }

  if (rawRanges.length === 0) return []

  // 2. When tags are collapsed they must be atomic — suppress ALL non-tag
  //    ranges that overlap with a tag so the sweep-line never splits a tag
  //    into sub-segments.  When tags are expanded (or absent), keep every
  //    range so search/glossary can highlight inside tags normally.
  const tagRules = rules.filter((r) => r.type === 'tag')
  const tagsCollapsed = tagRules.some((r) => r.collapsed)
  const tagRanges = rawRanges.filter((r) => r.annotation.type === 'tag')

  let filteredRanges = rawRanges
  if (tagRanges.length > 0 && tagsCollapsed) {
    filteredRanges = rawRanges.filter((r) => {
      if (r.annotation.type === 'tag') return true
      return !tagRanges.some((t) => r.start < t.end && r.end > t.start)
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
