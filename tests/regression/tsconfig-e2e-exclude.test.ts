// BUG-047: Vercel build fails because e2e/ and playwright.config.ts are included
// in TypeScript compilation but @playwright/test is a devDependency (not installed
// on Vercel). The tsconfig exclude list must cover them, matching the pattern used
// for tests/ (47258b8) and scripts/ (be9e4d7).

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect } from 'vitest'

const tsconfig = JSON.parse(
  readFileSync(join(process.cwd(), 'tsconfig.json'), 'utf-8')
) as { exclude?: string[] }

describe('BUG-047 · tsconfig exclude list covers Playwright dirs', () => {
  it('excludes e2e directory so @playwright/test is never type-checked on Vercel', () => {
    expect(tsconfig.exclude).toContain('e2e')
  })

  it('excludes playwright.config.ts so @playwright/test import does not fail the build', () => {
    expect(tsconfig.exclude).toContain('playwright.config.ts')
  })
})
