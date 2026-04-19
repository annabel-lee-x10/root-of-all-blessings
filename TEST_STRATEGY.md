# Test Strategy

## Stack

- **Test runner**: Vitest (`vitest.config.ts`)
- **API tests**: `@vitest-environment node` — test route handlers directly, no HTTP server
- **Component tests**: `@vitest-environment jsdom` — `@testing-library/react`
- **In-memory DB**: `better-sqlite3` via `tests/helpers.ts`, wired to mock `@/lib/db`

## Conventions

### API tests

1. Import the route handler directly: `const { GET } = await import('@/app/api/...')`
2. Use `req(url, method, body)` from `tests/helpers.ts` to build `NextRequest`
3. Use `initTestDb()` / `clearTestDb()` / `resetTestDb()` in `beforeAll/afterAll/beforeEach`
4. Mock external services (Anthropic, fetch) with `vi.fn()` / `vi.spyOn(global, 'fetch')`
5. All happy-path tests seed required data first (account, category, etc.)
6. One `describe` block per HTTP method per route

### Component tests

1. Mock API calls with `vi.spyOn(global, 'fetch')` returning canned responses
2. Test user-visible behaviour, not implementation details
3. Prefer `getByRole` / `getByText` over `getByTestId`

### TDD order

Write test cases first (all failing), then implement until green. Never mark a test as skipped unless the feature is explicitly deferred.

## Coverage priorities

1. All API route handlers — every status code path
2. Parsing logic (already covered: `parse-bless-this.test.ts`)
3. Component tests for stateful UI (dropzone upload flow, draft approve)

## Running tests

```bash
npx vitest run          # all tests
npx vitest run tests/api/receipts.test.ts   # single file
npx vitest --coverage   # coverage report
```
