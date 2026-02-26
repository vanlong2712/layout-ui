import type {
  HighlightSegment,
  ISpecialCharEntry,
  MooRule,
  RawRange,
} from './types'

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
    } else if (rule.type === 'lexiqa') {
      for (const term of rule.terms) {
        if (!term) continue
        const lowerText = text.toLowerCase()
        const lowerTerm = term.toLowerCase()
        let idx = 0
        while ((idx = lowerText.indexOf(lowerTerm, idx)) !== -1) {
          rawRanges.push({
            start: idx,
            end: idx + term.length,
            annotation: {
              type: 'lexiqa',
              id: `lq-${idx}-${idx + term.length}`,
              data: { term },
            },
          })
          idx += term.length
        }
      }
    } else if (rule.type === 'tb-target') {
      for (const entry of rule.entries) {
        if (!entry.term) continue
        const lowerText = text.toLowerCase()
        const lowerTerm = entry.term.toLowerCase()
        let idx = 0
        while ((idx = lowerText.indexOf(lowerTerm, idx)) !== -1) {
          rawRanges.push({
            start: idx,
            end: idx + entry.term.length,
            annotation: {
              type: 'tb-target',
              id: `tb-${idx}-${idx + entry.term.length}`,
              data: entry,
            },
          })
          idx += entry.term.length
        }
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

  // 2. Sweep-line: collect all unique boundary points
  const points = new Set<number>()
  for (const r of rawRanges) {
    points.add(r.start)
    points.add(r.end)
  }
  const sortedPoints = [...points].sort((a, b) => a - b)

  // 3. For each pair of consecutive points, find all covering ranges
  //    This naturally handles nesting: overlapping ranges produce segments
  //    that carry ALL applicable annotations.
  const segments: Array<HighlightSegment> = []
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const segStart = sortedPoints[i]
    const segEnd = sortedPoints[i + 1]
    const annotations = rawRanges
      .filter((r) => r.start <= segStart && r.end >= segEnd)
      .map((r) => r.annotation)
    if (annotations.length > 0) {
      segments.push({ start: segStart, end: segEnd, annotations })
    }
  }

  return segments
}
