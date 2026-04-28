// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '..', '..')

// After the kill, every portfolio + news source file must be gone.
// File-existence is the strict assertion: dynamic-import ENOENT alone is
// brittle (Vite has caches), so we go straight to fs.existsSync.
describe('Portfolio + News sources are removed', () => {
  it.each([
    // Page modules
    'app/(protected)/portfolio/page.tsx',
    'app/(protected)/portfolio/portfolio-client.tsx',
    'app/(protected)/portfolio/upload-area.tsx',
    'app/(protected)/portfolio/upload-modal.tsx',
    'app/(protected)/portfolio/downloads-modal.tsx',
    'app/(protected)/news/page.tsx',
    'app/(protected)/news/news-client.tsx',
    // API route modules
    'app/api/portfolio/route.ts',
    'app/api/portfolio/snapshots/route.ts',
    'app/api/portfolio/history/route.ts',
    'app/api/portfolio/scan/route.ts',
    'app/api/portfolio/orders/route.ts',
    'app/api/portfolio/orders/[id]/route.ts',
    'app/api/portfolio/realised/route.ts',
    'app/api/portfolio/realised/[id]/route.ts',
    'app/api/portfolio/growth/route.ts',
    'app/api/portfolio/growth/milestones/route.ts',
    'app/api/portfolio/growth/milestones/[id]/route.ts',
    'app/api/portfolio/download/excel/[id]/route.ts',
    'app/api/portfolio/download/html/[id]/route.ts',
    'app/api/news/route.ts',
    'app/api/news/generate/route.ts',
    'app/api/news/upload/route.ts',
    // Lib modules
    'lib/portfolio/ocr.ts',
    'lib/portfolio/excel-generator.ts',
    'lib/portfolio/report-generator.ts',
    'lib/news-utils.ts',
    // Brand icons
    'public/brand/icons/portfolio.svg',
    'public/brand/icons/news.svg',
  ])('%s is deleted', (relPath) => {
    expect(fs.existsSync(path.join(REPO_ROOT, relPath))).toBe(false)
  })

  it('app/(protected)/portfolio/ directory is gone', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'app/(protected)/portfolio'))).toBe(false)
  })

  it('app/(protected)/news/ directory is gone', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'app/(protected)/news'))).toBe(false)
  })

  it('app/api/portfolio/ directory is gone', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'app/api/portfolio'))).toBe(false)
  })

  it('app/api/news/ directory is gone', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'app/api/news'))).toBe(false)
  })

  it('lib/portfolio/ directory is gone', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'lib/portfolio'))).toBe(false)
  })
})

// Belt-and-braces: ensure removed scripts are gone too.
describe('Portfolio scripts are removed', () => {
  it.each([
    'scripts/migrate-portfolio.ts',
    'scripts/seed-portfolio-snap27.ts',
    'scripts/seed-snap27.ts',
  ])('%s is deleted', (relPath) => {
    expect(fs.existsSync(path.join(REPO_ROOT, relPath))).toBe(false)
  })
})
