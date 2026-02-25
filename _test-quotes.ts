import { detectQuotes } from './src/utils/detect-quotes'

function show(
  label: string,
  text: string,
  opts: Parameters<typeof detectQuotes>[1] = {},
) {
  console.log(`\n--- ${label} ---`)
  const seen = new Set()
  for (const [, v] of detectQuotes(text, opts)) {
    if (seen.has(v)) continue
    seen.add(v)
    console.log(
      `  ${v.quoteType} [${v.start},${v.end}] "${v.content}" closed=${v.closed}`,
    )
  }
}

const nested = `He whispered "she told me 'run away' before dawn"`

console.log('=== Text:', JSON.stringify(nested), '===')
show('detectInnerQuotes: true (default)', nested, {})
show('detectInnerQuotes: false', nested, { detectInnerQuotes: false })
show('allowNesting: true', nested, { allowNesting: true })

const overlap = `"text 'a b" c'`
console.log('\n=== Text:', JSON.stringify(overlap), '===')
show('detectInnerQuotes: true (default)', overlap, {})
show('detectInnerQuotes: false', overlap, { detectInnerQuotes: false })
show('allowNesting: true', overlap, { allowNesting: true })
