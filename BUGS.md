# Bug Log

## BUG-001 · News: `<cite>` tags render as visible text in card summaries

**Status:** Fixed  
**Reported:** 2026-04-19  
**Fixed in:** `lib/news-utils.ts`, `app/(protected)/news/news-client.tsx`

**Symptom:** Raw `<cite index="1-19,1-20">text</cite>` markup appeared as visible text in news card summaries, catalysts, headlines, and key points.

**Root cause:** The Claude `web_search_20250305` tool annotates assistant text responses with inline `<cite index="...">` markers. These land verbatim in JSON string values returned by the model. `mapCard()` extracted them with `String(it.summary)` and they were passed directly to JSX — React renders strings literally, not as HTML, so the tag syntax appeared as raw characters.

**Fix:** `stripCiteTags()` added to `lib/news-utils.ts`. Applied in `mapCard()` on `headline`, `catalyst`, `summary`, and every `keyPoints` item. Also applied in `agenticLoop` on the final text return (see BUG-002).

**Regression test:** `tests/regression/news-cite-tags.test.ts`

---

## BUG-002 · News: Singapore Property section shows "No stories yet" after Refresh

**Status:** Fixed  
**Reported:** 2026-04-19  
**Fixed in:** `app/(protected)/news/news-client.tsx`

**Symptom:** After hitting Refresh, the Singapore Property section remained empty ("No stories yet — hit Refresh to generate") while World, Singapore, and Jobs sections loaded correctly.

**Root cause:** Claude's citation tags embed the attribute's double-quotes directly inside a JSON string value:

```
{"summary": "Prices rose <cite index="1-19,1-20">5%</cite> in Q1"}
```

The `"` in `index="1-19,1-20"` terminates the JSON string early, making the entire JSON payload malformed. `parseArr()`'s `catch { return [] }` silently swallowed the `JSON.parse` error and returned an empty array. Whether a section triggered this depended on citation density in the model's response, explaining why some sections succeeded while others did not.

**Fix:** `stripCiteTags()` applied to the text returned by `agenticLoop()` before it is passed to `parseArr()`, ensuring cite tags are removed before JSON parsing and eliminating the malformed-string failure mode.

**Regression test:** `tests/regression/news-cite-tags.test.ts` — "strips cite tags that would break JSON parsing" case.
