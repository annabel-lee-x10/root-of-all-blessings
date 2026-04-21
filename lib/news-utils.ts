/**
 * Strips <cite index="...">text</cite> tags from a string, keeping the inner text.
 *
 * The Claude web_search tool injects these annotations into responses. They
 * appear inside JSON string values, where the attribute's double-quotes break
 * JSON.parse, and they render as raw visible text in JSX since React does not
 * interpret strings as HTML.
 */
export function stripCiteTags(s: string): string {
  return s.replace(/<cite[^>]*>([\s\S]*?)<\/cite>/g, '$1').replace(/<\/?cite[^>]*>/g, '')
}

export function parseArr(raw: string): Record<string, unknown>[] {
  if (!raw) return []
  const c = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()

  // Fast path: clean JSON (most responses)
  try {
    const d = JSON.parse(c)
    if (Array.isArray(d)) return d
  } catch { /* fall through to extraction */ }

  // Find the last '[' that begins a JSON array (handles preamble like "Here are [5] stories: [{...}]")
  // Scan for '[' followed immediately by '{' or '[' — i.e. an array of objects/arrays
  let lastArrayStart = -1
  const arrayOpenRe = /\[\s*[\[{]/g
  let m: RegExpExecArray | null
  while ((m = arrayOpenRe.exec(c)) !== null) lastArrayStart = m.index
  // Also handle empty array case — only use if no object/array opener was found
  if (lastArrayStart === -1) {
    const emptyRe = /\[\s*\]/g
    let em: RegExpExecArray | null
    while ((em = emptyRe.exec(c)) !== null) lastArrayStart = em.index
  }

  if (lastArrayStart === -1) return []
  try {
    const d = JSON.parse(c.slice(lastArrayStart))
    return Array.isArray(d) ? d : []
  } catch { return [] }
}
