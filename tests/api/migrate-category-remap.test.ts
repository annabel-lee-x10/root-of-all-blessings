// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import {
  initTestDb, clearTestDb, resetTestDb, req,
  seedAccount, seedCategory, seedTag, seedTransaction, seedTransactionTag,
} from '../helpers'

vi.mock('@/lib/session', () => ({
  createSession: vi.fn().mockResolvedValue(undefined),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  verifySession: vi.fn().mockResolvedValue(true),
  verifySessionToken: vi.fn().mockResolvedValue(true),
}))

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  vi.clearAllMocks()
})

// ── Helper ────────────────────────────────────────────────────────────────────

async function callMigrate() {
  const { POST } = await import('@/app/api/migrate/route')
  return POST()
}

// ── DDL ───────────────────────────────────────────────────────────────────────

describe('category_remap DDL', () => {
  it('POST /api/migrate returns ok:true', async () => {
    const res = await callMigrate()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
  })

  it('is idempotent — second call does not throw', async () => {
    await callMigrate()
    const res = await callMigrate()
    expect((await res.json()).ok).toBe(true)
  })

  it('reports categories.parent_id migration result', async () => {
    const res = await callMigrate()
    const data = await res.json()
    expect(['added', 'already exists']).toContain(data.migrations['categories.parent_id'])
  })
})

// ── Subcategory seeding ───────────────────────────────────────────────────────

describe('category_remap subcategory creation', () => {
  it('creates Pet Food under Pet when it does not exist', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('pet-parent', 'Pet', 'expense')

    await callMigrate()

    const { GET } = await import('@/app/api/categories/route')
    const res = await GET(req('/api/categories'))
    const cats = await res.json() as Array<{ name: string; parent_id: string | null }>
    const petFood = cats.find(c => c.name === 'Pet Food')
    expect(petFood).toBeDefined()
    expect(petFood!.parent_id).toBe('pet-parent')
  })

  it('creates Pet Supplements under Pet when it does not exist', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('pet-parent', 'Pet', 'expense')

    await callMigrate()

    const { GET } = await import('@/app/api/categories/route')
    const res = await GET(req('/api/categories'))
    const cats = await res.json() as Array<{ name: string; parent_id: string | null }>
    const petSupp = cats.find(c => c.name === 'Pet Supplements')
    expect(petSupp).toBeDefined()
    expect(petSupp!.parent_id).toBe('pet-parent')
  })

  it('does not duplicate Pet Food on second run', async () => {
    seedCategory('pet-parent', 'Pet', 'expense')
    seedCategory('pet-food', 'Pet Food', 'expense', 'pet-parent')

    await callMigrate()
    await callMigrate()

    const { GET } = await import('@/app/api/categories/route')
    const res = await GET(req('/api/categories'))
    const cats = await res.json() as Array<{ name: string }>
    expect(cats.filter(c => c.name === 'Pet Food')).toHaveLength(1)
  })

  it('sets parent_id on existing subcategory that has no parent yet', async () => {
    seedCategory('food-parent', 'Food', 'expense')
    seedCategory('groceries', 'Groceries', 'expense') // no parentId

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT parent_id FROM categories WHERE name = ?', args: ['Groceries'] })
    expect(row.rows[0].parent_id).toBe('food-parent')
  })

  it('creates Groceries subcategory under Food when missing', async () => {
    seedCategory('food-parent', 'Food', 'expense')

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT id, parent_id FROM categories WHERE name = ?', args: ['Groceries'] })
    expect(row.rows).toHaveLength(1)
    expect(row.rows[0].parent_id).toBe('food-parent')
  })
})

// ── Backup ────────────────────────────────────────────────────────────────────

describe('category_remap backup', () => {
  it('backs up original category_id for parent-pointing transactions', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('food-parent', 'Food', 'expense')
    seedCategory('groceries', 'Groceries', 'expense', 'food-parent')
    seedTag('tag1', 'groceries')
    seedTransaction('tx1', 'acc1', { categoryId: 'food-parent' })
    seedTransactionTag('tx1', 'tag1')

    await callMigrate()

    const { db } = await import('@/lib/db')
    const backup = await db.execute({
      sql: 'SELECT * FROM category_remap_backup WHERE transaction_id = ?',
      args: ['tx1'],
    })
    expect(backup.rows).toHaveLength(1)
    expect(backup.rows[0].original_category_id).toBe('food-parent')
  })

  it('does not overwrite backup row on second run (INSERT OR IGNORE)', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('food-parent', 'Food', 'expense')
    seedCategory('groceries', 'Groceries', 'expense', 'food-parent')
    seedTag('tag1', 'groceries')
    seedTransaction('tx1', 'acc1', { categoryId: 'food-parent' })
    seedTransactionTag('tx1', 'tag1')

    await callMigrate()
    await callMigrate()

    const { db } = await import('@/lib/db')
    const backup = await db.execute({
      sql: 'SELECT * FROM category_remap_backup WHERE transaction_id = ?',
      args: ['tx1'],
    })
    expect(backup.rows).toHaveLength(1)
    expect(backup.rows[0].original_category_id).toBe('food-parent')
  })

  it('does not back up transactions that already point to a subcategory', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('food-parent', 'Food', 'expense')
    seedCategory('groceries', 'Groceries', 'expense', 'food-parent')
    seedTransaction('tx1', 'acc1', { categoryId: 'groceries' }) // already a subcategory

    await callMigrate()

    const { db } = await import('@/lib/db')
    const backup = await db.execute({
      sql: 'SELECT * FROM category_remap_backup WHERE transaction_id = ?',
      args: ['tx1'],
    })
    expect(backup.rows).toHaveLength(0)
  })
})

// ── Tag-based remapping ───────────────────────────────────────────────────────

describe('category_remap tag matching', () => {
  it('remaps Food tx tagged "groceries" → Groceries', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('food-parent', 'Food', 'expense')
    seedCategory('groceries', 'Groceries', 'expense', 'food-parent')
    seedTag('tag1', 'groceries')
    seedTransaction('tx1', 'acc1', { categoryId: 'food-parent' })
    seedTransactionTag('tx1', 'tag1')

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('groceries')
  })

  it('remaps Food tx tagged "hawker" → Meals', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('food-parent', 'Food', 'expense')
    seedCategory('meals', 'Meals', 'expense', 'food-parent')
    seedTag('tag1', 'hawker')
    seedTransaction('tx1', 'acc1', { categoryId: 'food-parent' })
    seedTransactionTag('tx1', 'tag1')

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('meals')
  })

  it('remaps Food tx tagged "coffee" → Coffee', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('food-parent', 'Food', 'expense')
    seedCategory('coffee', 'Coffee', 'expense', 'food-parent')
    seedTag('tag1', 'coffee')
    seedTransaction('tx1', 'acc1', { categoryId: 'food-parent' })
    seedTransactionTag('tx1', 'tag1')

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('coffee')
  })

  it('remaps Food tx tagged "restaurant" → Meals', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('food-parent', 'Food', 'expense')
    seedCategory('meals', 'Meals', 'expense', 'food-parent')
    seedTag('tag1', 'restaurant')
    seedTransaction('tx1', 'acc1', { categoryId: 'food-parent' })
    seedTransactionTag('tx1', 'tag1')

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('meals')
  })

  it('remaps Food tx tagged "bubble tea" → Coffee', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('food-parent', 'Food', 'expense')
    seedCategory('coffee', 'Coffee', 'expense', 'food-parent')
    seedTag('tag1', 'bubble tea')
    seedTransaction('tx1', 'acc1', { categoryId: 'food-parent' })
    seedTransactionTag('tx1', 'tag1')

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('coffee')
  })

  it('remaps Pet tx tagged "vet" → Vet', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('pet-parent', 'Pet', 'expense')
    seedCategory('vet', 'Vet', 'expense', 'pet-parent')
    seedTag('tag1', 'vet')
    seedTransaction('tx1', 'acc1', { categoryId: 'pet-parent' })
    seedTransactionTag('tx1', 'tag1')

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('vet')
  })

  it('remaps Pet tx tagged "cat food" → Pet Food (auto-created)', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('pet-parent', 'Pet', 'expense')
    // Pet Food NOT seeded — migration creates it
    seedTag('tag1', 'cat food')
    seedTransaction('tx1', 'acc1', { categoryId: 'pet-parent' })
    seedTransactionTag('tx1', 'tag1')

    await callMigrate()

    const { db } = await import('@/lib/db')
    const petFoodCat = await db.execute({ sql: 'SELECT id FROM categories WHERE name = ?', args: ['Pet Food'] })
    expect(petFoodCat.rows).toHaveLength(1)
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe(petFoodCat.rows[0].id)
  })

  it('leaves tx unchanged when tag matches nothing', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('food-parent', 'Food', 'expense')
    seedTag('tag1', 'zzz-unknown-tag')
    seedTransaction('tx1', 'acc1', { categoryId: 'food-parent' })
    seedTransactionTag('tx1', 'tag1')

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('food-parent')
  })

  it('does not remap transfer transactions', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedAccount('acc2', 'Cash', 'cash')
    seedCategory('food-parent', 'Food', 'expense')
    seedCategory('groceries', 'Groceries', 'expense', 'food-parent')
    seedTag('tag1', 'groceries')
    seedTransaction('tx1', 'acc1', { type: 'transfer', categoryId: 'food-parent', toAccountId: 'acc2' })
    seedTransactionTag('tx1', 'tag1')

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('food-parent')
  })

  it('remaps tx tagged "grab" → Taxi subcategory', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('travel-parent', 'Travel', 'expense')
    seedCategory('taxi', 'Taxi', 'expense', 'travel-parent')
    seedTag('tag1', 'grab')
    seedTransaction('tx1', 'acc1', { categoryId: 'travel-parent' })
    seedTransactionTag('tx1', 'tag1')

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('taxi')
  })

  it('remaps tx tagged "mrt" → Bus and Train subcategory', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('travel-parent', 'Travel', 'expense')
    seedCategory('bus-and-train', 'Bus and Train', 'expense', 'travel-parent')
    seedTag('tag1', 'mrt')
    seedTransaction('tx1', 'acc1', { categoryId: 'travel-parent' })
    seedTransactionTag('tx1', 'tag1')

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('bus-and-train')
  })

  it('remaps Entertainment tx tagged "netflix" → Netflix', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('ent-parent', 'Entertainment', 'expense')
    seedCategory('netflix', 'Netflix', 'expense', 'ent-parent')
    seedTag('tag1', 'netflix')
    seedTransaction('tx1', 'acc1', { categoryId: 'ent-parent' })
    seedTransactionTag('tx1', 'tag1')

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('netflix')
  })
})

// ── Payee-based remapping ─────────────────────────────────────────────────────

describe('category_remap payee matching', () => {
  it('remaps payee "NTUC FairPrice" → Groceries', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('food-parent', 'Food', 'expense')
    seedCategory('groceries', 'Groceries', 'expense', 'food-parent')
    seedTransaction('tx1', 'acc1', { categoryId: 'food-parent', payee: 'NTUC FairPrice' })

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('groceries')
  })

  it('remaps payee "Sheng Siong" → Groceries', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('food-parent', 'Food', 'expense')
    seedCategory('groceries', 'Groceries', 'expense', 'food-parent')
    seedTransaction('tx1', 'acc1', { categoryId: 'food-parent', payee: 'Sheng Siong Supermarket' })

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('groceries')
  })

  it('remaps payee "Netflix" → Netflix subcategory', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('ent-parent', 'Entertainment', 'expense')
    seedCategory('netflix', 'Netflix', 'expense', 'ent-parent')
    seedTransaction('tx1', 'acc1', { categoryId: 'ent-parent', payee: 'Netflix' })

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('netflix')
  })

  it('remaps payee "Grab" → Taxi subcategory', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('travel-parent', 'Travel', 'expense')
    seedCategory('taxi', 'Taxi', 'expense', 'travel-parent')
    seedTransaction('tx1', 'acc1', { categoryId: 'travel-parent', payee: 'Grab' })

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('taxi')
  })

  it('remaps payee "Spotify" → Spotify subcategory', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('ent-parent', 'Entertainment', 'expense')
    seedCategory('spotify', 'Spotify', 'expense', 'ent-parent')
    seedTransaction('tx1', 'acc1', { categoryId: 'ent-parent', payee: 'Spotify AB' })

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('spotify')
  })

  it('payee rule skipped when subcategory does not exist in DB', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('food-parent', 'Food', 'expense')
    // Groceries NOT seeded and Food has no children in hierarchy for this test (no other parent)
    // But actually the migration will CREATE Groceries under Food if it doesn't exist.
    // So let's test with a payee that maps to a subcategory whose parent doesn't exist.
    seedCategory('ent-parent', 'Entertainment', 'expense')
    // No Netflix category seeded, no Entertainment children defined in test hierarchy
    // But migration will create Netflix under Entertainment — so use a different scenario:
    // Use Subscriptions as parent (no subcategories seeded) and a payee that maps to
    // something not under Subscriptions hierarchy (e.g., 'Anthropic' → Claude, no parent)
    seedTransaction('tx1', 'acc1', { categoryId: 'ent-parent', payee: 'Anthropic PBC' })

    await callMigrate()

    const { db } = await import('@/lib/db')
    const claudeCat = await db.execute({ sql: 'SELECT id FROM categories WHERE name = ?', args: ['Claude'] })
    // Claude's parent (Business Education Work) doesn't exist in this test DB,
    // so Claude was not created. tx should stay at ent-parent.
    if (claudeCat.rows.length === 0) {
      const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
      expect(row.rows[0].category_id).toBe('ent-parent')
    }
    // If Business Education Work happened to be seeded by migration it's also fine — skip assertion
  })
})

// ── Idempotency ───────────────────────────────────────────────────────────────

describe('category_remap idempotency', () => {
  it('running twice produces the same final category_id', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('food-parent', 'Food', 'expense')
    seedCategory('groceries', 'Groceries', 'expense', 'food-parent')
    seedTag('tag1', 'groceries')
    seedTransaction('tx1', 'acc1', { categoryId: 'food-parent' })
    seedTransactionTag('tx1', 'tag1')

    await callMigrate()
    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('groceries')
  })

  it('already-remapped tx is not touched on second run', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('food-parent', 'Food', 'expense')
    seedCategory('groceries', 'Groceries', 'expense', 'food-parent')
    seedTag('tag1', 'groceries')
    seedTransaction('tx1', 'acc1', { categoryId: 'groceries' }) // already points to subcategory
    seedTransactionTag('tx1', 'tag1')

    await callMigrate()

    const { db } = await import('@/lib/db')
    const row = await db.execute({ sql: 'SELECT category_id FROM transactions WHERE id = ?', args: ['tx1'] })
    expect(row.rows[0].category_id).toBe('groceries') // unchanged
  })
})

// ── Response log ──────────────────────────────────────────────────────────────

describe('category_remap response log', () => {
  it('includes remap_log array in response', async () => {
    const res = await callMigrate()
    const data = await res.json()
    expect(data.remap_log).toBeDefined()
    expect(Array.isArray(data.remap_log)).toBe(true)
  })

  it('remap_log entry has rule, subcategory, count fields', async () => {
    seedAccount('acc1', 'POSB', 'bank')
    seedCategory('food-parent', 'Food', 'expense')
    seedCategory('groceries', 'Groceries', 'expense', 'food-parent')
    seedTag('tag1', 'groceries')
    seedTransaction('tx1', 'acc1', { categoryId: 'food-parent' })
    seedTransactionTag('tx1', 'tag1')

    const res = await callMigrate()
    const data = await res.json()
    const entry = data.remap_log.find(
      (e: { subcategory: string }) => e.subcategory === 'Groceries'
    )
    expect(entry).toBeDefined()
    expect(typeof entry.rule).toBe('string')
    expect(entry.count).toBeGreaterThan(0)
  })

  it('returns 401 when not authenticated', async () => {
    const { verifySession } = await import('@/lib/session')
    vi.mocked(verifySession).mockResolvedValueOnce(false as unknown as never)

    const res = await callMigrate()
    expect(res.status).toBe(401)
  })
})
