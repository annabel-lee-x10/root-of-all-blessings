# Test Strategy

## Stack

- **Test runner**: Vitest (`vitest.config.ts`)
- **API tests**: `@vitest-environment node` — test route handlers directly, no HTTP server
- **Component tests**: `@vitest-environment jsdom` — `@testing-library/react` + `@testing-library/jest-dom`
- **In-memory DB**: `better-sqlite3` via `tests/helpers.ts`, wired to mock `@/lib/db`

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

## Conventions

### API tests

1. Import the route handler directly: `const { GET } = await import('@/app/api/...')`
2. Use `req(url, method, body)` from `tests/helpers.ts` to build `NextRequest`
3. Use `initTestDb()` / `clearTestDb()` / `resetTestDb()` in `beforeAll/afterAll/beforeEach`
4. Mock external services (Anthropic, fetch) with `vi.fn()` / `vi.spyOn(global, 'fetch')`
5. All happy-path tests seed required data first (account, category, etc.)
6. One `describe` block per HTTP method per route

### Component tests

1. Mock API calls with `vi.stubGlobal('fetch', ...)` and restore with `vi.unstubAllGlobals()` in `afterEach`
2. Use `// @vitest-environment jsdom` at the top of the file
3. Test user-visible behaviour, not implementation details
4. Prefer `getByRole` / `getByText` over `getByTestId`

### Regression tests

- Add a regression test for every bug fix in `tests/regression/` named after the feature (`voice-input.test.tsx`, `wmm-page.test.ts`)
- The test must fail on the original code and pass after the fix

### Always / Never

- **Always** use `function` or `class` syntax (not arrow functions) when `vi.fn()` is used as a `new`-able constructor
- **Never** test implementation details (internal state shape, private functions)
- **Never** use real timers in tests — use `vi.useFakeTimers()` if timing matters
- **Never** hit the real Turso DB; `tests/setup.ts` mocks `@/lib/db` globally for node-env tests
- **Never** write tests that only pass because an error was swallowed

### TDD order

Write test cases first (all failing), then implement until green. Never mark a test as skipped unless the feature is explicitly deferred.

## Coverage priorities

1. All API route handlers — every status code path
2. Parsing logic (already covered: `parse-bless-this.test.ts`)
3. Component tests for stateful UI (dropzone upload flow, draft approve)

## Running tests

```bash
npx vitest run                                          # all tests
npx vitest run tests/regression/voice-input.test.tsx   # single file
npx vitest --coverage                                   # coverage report
npx vitest --ui                                         # interactive
```
