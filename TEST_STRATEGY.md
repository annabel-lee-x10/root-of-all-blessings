# Test Strategy

## Stack
- **Runner:** Vitest
- **Component tests:** `@vitest-environment jsdom` + `@testing-library/react` + `@testing-library/jest-dom`
- **API/unit tests:** `@vitest-environment node` with a real in-memory SQLite DB via `better-sqlite3` (see `tests/helpers.ts`)

## File Layout
```
tests/
  setup.ts                   # Global mocks: db, env vars, session secret
  helpers.ts                 # initTestDb / clearTestDb / seedAccount / seedTransaction / req()
  api/                       # Route handler unit tests (node env)
  components/                # React component tests (jsdom env)
  regression/                # Bug-regression tests — one file per bug
  *.test.ts                  # Cross-cutting: auth, middleware, parse-bless-this, etc.
```

## Rules

### Always
- Add a regression test for every bug fix in `tests/regression/` named after the feature (`voice-input.test.tsx`, `wmm-page.test.ts`).
- API tests import route handlers directly and call them with `req()` helper — no HTTP.
- Component tests mock `fetch` with `vi.stubGlobal` and restore with `vi.unstubAllGlobals()` in `afterEach`.
- Use `// @vitest-environment jsdom` at the top of every component test file.
- Mark exactly one task `in_progress` in TodoWrite at a time.

### Never
- Don't test implementation details (internal state shape, private functions).
- Don't use `setTimeout` / real timers in tests — use `vi.useFakeTimers()` if timing matters.
- Don't hit the real Turso DB; `tests/setup.ts` mocks `@/lib/db` globally for node-env tests.
- Don't write tests that only pass because an error was swallowed.

## Running Tests
```bash
npx vitest run            # all tests
npx vitest run tests/regression/voice-input.test.tsx   # single file
npx vitest --ui           # interactive
```

## Coverage Targets (aspirational)
- API routes: 80%+ line coverage
- Core parse/utility logic: 100%
- UI components: critical paths (render, user interactions, error states)
