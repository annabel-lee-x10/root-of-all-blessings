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
