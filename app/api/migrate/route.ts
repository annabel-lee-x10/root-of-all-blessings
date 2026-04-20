import { verifySession } from '@/lib/session'
import { db } from '@/lib/db'

// ── Subcategory hierarchy ─────────────────────────────────────────────────────
//
// Defines which subcategory names belong under which parent name.
// Used to: (a) ensure subcategories exist with parent_id set, and
// (b) limit remapping to transactions pointing to a parent (parent_id IS NULL).

const HIERARCHY: Array<{ parent: string; type: 'expense' | 'income'; children: string[] }> = [
  { parent: 'Food', type: 'expense', children: ['Alcohol', 'Cafe', 'Coffee', 'Dining', 'Groceries', 'Hawker', 'Snacks'] },
  { parent: 'Living', type: 'expense', children: ['Household', 'Aircon Service', 'Electricity', 'Home Maintenance', 'Insurance', 'Internet', 'Mobile', 'Mortgage', 'Rent', 'Utilities'] },
  { parent: 'Travel', type: 'expense', children: ['Transport', 'Grab', 'MRT', 'Taxi'] },
  { parent: 'Wellness and Health', type: 'expense', children: ['Health', 'Dental', 'Fitness', 'Gym', 'Medical', 'Sports', 'Supplements'] },
  { parent: 'Lifestyle', type: 'expense', children: ['Apparel', 'Delivery', 'Electronics', 'Gifts', 'Shopping'] },
  { parent: 'Business Education Work', type: 'expense', children: ['Books', 'Claude', 'Courses', 'Software'] },
  { parent: 'Entertainment', type: 'expense', children: ['Netflix', 'Spotify'] },
  { parent: 'Subscriptions', type: 'expense', children: ['Netflix', 'Spotify'] },
  { parent: 'Pet', type: 'expense', children: ['Grooming', 'Litter', 'Others', 'Toys', 'Vet', 'Pet Food', 'Pet Supplements'] },
  { parent: 'Other', type: 'expense', children: ['Charity'] },
]

// ── Tag → subcategory rules ───────────────────────────────────────────────────
// Each entry maps one or more lowercase tag names (aliases) to a subcategory.
// Rules are applied in order; once a transaction is remapped it is invisible
// to subsequent rules (its category_id no longer points to a parent).

const TAG_RULES: Array<{ tags: string[]; subcategory: string }> = [
  // Food
  { tags: ['alcohol', 'beer', 'wine', 'spirits', 'liquor'], subcategory: 'Alcohol' },
  { tags: ['cafe', 'kopitiam'], subcategory: 'Cafe' },
  { tags: ['coffee', 'kopi', 'latte', 'espresso', 'americano', 'cappuccino'], subcategory: 'Coffee' },
  { tags: ['dining', 'restaurant', 'dinner', 'lunch', 'breakfast', 'supper', 'zichar', 'cze char'], subcategory: 'Dining' },
  { tags: ['groceries', 'grocery', 'supermarket', 'market', 'provisions'], subcategory: 'Groceries' },
  { tags: ['hawker', 'hawker centre', 'food court', 'coffeeshop', 'food stall'], subcategory: 'Hawker' },
  { tags: ['snacks', 'bubble tea', 'boba', 'dessert', 'ice cream', 'pastry', 'cake', 'candy', 'chips'], subcategory: 'Snacks' },
  // Travel
  { tags: ['grab', 'grabcar', 'grab car'], subcategory: 'Grab' },
  { tags: ['mrt', 'ez-link', 'ezlink', 'transit', 'bus', 'train', 'smrt', 'sbs', 'public transport', 'lrt'], subcategory: 'MRT' },
  { tags: ['taxi', 'cab', 'gojek', 'tada', 'comfort', 'comfortdelgro', 'cdg'], subcategory: 'Taxi' },
  // Living
  { tags: ['aircon', 'air con', 'air conditioning', 'aircon service', 'aircon servicing'], subcategory: 'Aircon Service' },
  { tags: ['electricity', 'power', 'electric', 'sp services', 'singapore power'], subcategory: 'Electricity' },
  { tags: ['renovation', 'repair', 'maintenance', 'handyman', 'plumber', 'home maintenance'], subcategory: 'Home Maintenance' },
  { tags: ['insurance', 'premium', 'policy'], subcategory: 'Insurance' },
  { tags: ['internet', 'broadband', 'fibre', 'fiber', 'wifi', 'wi-fi'], subcategory: 'Internet' },
  { tags: ['mobile', 'telco', 'postpaid', 'prepaid', 'sim card', 'phone bill'], subcategory: 'Mobile' },
  { tags: ['mortgage', 'home loan', 'hdb loan', 'cpf mortgage'], subcategory: 'Mortgage' },
  { tags: ['rent', 'rental payment'], subcategory: 'Rent' },
  { tags: ['utilities', 'water', 'gas', 'conservancy', 'service charge'], subcategory: 'Utilities' },
  { tags: ['household', 'furniture', 'appliances', 'ikea', 'home goods', 'cleaning supplies'], subcategory: 'Household' },
  // Wellness and Health
  { tags: ['dental', 'dentist', 'teeth', 'braces', 'dental check', 'scaling'], subcategory: 'Dental' },
  { tags: ['fitness', 'exercise', 'workout', 'pilates', 'yoga', 'crossfit'], subcategory: 'Fitness' },
  { tags: ['gym', 'gym membership', 'fitness club'], subcategory: 'Gym' },
  { tags: ['medical', 'medicine', 'clinic', 'doctor', 'polyclinic', 'hospital', 'prescription', 'healthcare', 'gp', 'specialist'], subcategory: 'Medical' },
  { tags: ['sports', 'badminton', 'tennis', 'swimming', 'cycling', 'football', 'soccer', 'basketball', 'volleyball', 'running', 'athletics'], subcategory: 'Sports' },
  { tags: ['supplements', 'vitamins', 'protein', 'omega', 'collagen', 'probiotics', 'health supplements'], subcategory: 'Supplements' },
  // Lifestyle
  { tags: ['apparel', 'clothing', 'clothes', 'fashion', 'shoes', 'outfit', 'garment', 'dress'], subcategory: 'Apparel' },
  { tags: ['delivery', 'food delivery', 'foodpanda', 'deliveroo', 'grab food', 'grabfood'], subcategory: 'Delivery' },
  { tags: ['electronics', 'tech', 'gadgets', 'device', 'laptop', 'tablet', 'headphones', 'charger'], subcategory: 'Electronics' },
  { tags: ['gifts', 'gift', 'present', 'souvenir'], subcategory: 'Gifts' },
  { tags: ['shopping', 'zalora', 'shopee', 'lazada', 'amazon', 'taobao', 'online shopping'], subcategory: 'Shopping' },
  // Business Education Work
  { tags: ['books', 'book', 'reading', 'ebook', 'kindle'], subcategory: 'Books' },
  { tags: ['claude', 'anthropic', 'chatgpt', 'openai', 'ai tools', 'ai subscription'], subcategory: 'Claude' },
  { tags: ['course', 'courses', 'tuition', 'training', 'class', 'udemy', 'coursera', 'linkedin learning', 'skillshare', 'workshop', 'seminar'], subcategory: 'Courses' },
  { tags: ['software', 'saas', 'app', 'license', 'subscription software', 'notion', 'figma', 'adobe'], subcategory: 'Software' },
  // Entertainment / Subscriptions
  { tags: ['netflix', 'streaming video', 'disney plus', 'hbo'], subcategory: 'Netflix' },
  { tags: ['spotify', 'music streaming', 'apple music', 'youtube music', 'tidal'], subcategory: 'Spotify' },
  // Pet
  { tags: ['grooming', 'pet grooming', 'cat grooming', 'dog grooming', 'pet bath', 'fur trim'], subcategory: 'Grooming' },
  { tags: ['litter', 'cat litter', 'sandbox', 'litter box'], subcategory: 'Litter' },
  { tags: ['toys', 'pet toys', 'cat toy', 'dog toy', 'pet accessories'], subcategory: 'Toys' },
  { tags: ['vet', 'veterinary', 'veterinarian', 'vet bill', 'vet visit', 'animal clinic', 'pet hospital'], subcategory: 'Vet' },
  { tags: ['pet food', 'cat food', 'dog food', 'kibble', 'pet feed', 'whiskas', 'royal canin', 'hills pet', 'purina'], subcategory: 'Pet Food' },
  { tags: ['pet supplements', 'pet vitamins', 'cat supplements', 'dog supplements'], subcategory: 'Pet Supplements' },
  // Other
  { tags: ['charity', 'donation', 'donate', 'welfare', 'humanitarian', 'ngo', 'fundraising'], subcategory: 'Charity' },
]

// ── Payee → subcategory rules ─────────────────────────────────────────────────
// Pattern is matched case-insensitively as a substring of the payee field.
// Applied after tag rules; same idempotency guarantee applies.

const PAYEE_RULES: Array<{ pattern: string; subcategory: string }> = [
  // Groceries
  { pattern: 'ntuc', subcategory: 'Groceries' },
  { pattern: 'fairprice', subcategory: 'Groceries' },
  { pattern: 'sheng siong', subcategory: 'Groceries' },
  { pattern: 'cold storage', subcategory: 'Groceries' },
  { pattern: 'redmart', subcategory: 'Groceries' },
  { pattern: 'prime supermarket', subcategory: 'Groceries' },
  // Coffee
  { pattern: 'starbucks', subcategory: 'Coffee' },
  { pattern: 'coffee bean', subcategory: 'Coffee' },
  { pattern: 'flash coffee', subcategory: 'Coffee' },
  { pattern: 'ya kun', subcategory: 'Coffee' },
  // Cafe
  { pattern: 'toast box', subcategory: 'Cafe' },
  // Snacks (bubble tea)
  { pattern: 'koi the', subcategory: 'Snacks' },
  { pattern: 'liho', subcategory: 'Snacks' },
  { pattern: 'gong cha', subcategory: 'Snacks' },
  { pattern: 'gongcha', subcategory: 'Snacks' },
  { pattern: 'playmade', subcategory: 'Snacks' },
  { pattern: 'tiger sugar', subcategory: 'Snacks' },
  { pattern: 'one zo', subcategory: 'Snacks' },
  { pattern: 'r&b tea', subcategory: 'Snacks' },
  // Transport / Travel
  { pattern: 'grab', subcategory: 'Grab' },
  { pattern: 'gojek', subcategory: 'Taxi' },
  { pattern: 'smrt', subcategory: 'MRT' },
  { pattern: 'sbs transit', subcategory: 'MRT' },
  { pattern: 'transitlink', subcategory: 'MRT' },
  { pattern: 'ez-link', subcategory: 'MRT' },
  { pattern: 'comfortdelgro', subcategory: 'Taxi' },
  { pattern: 'citycab', subcategory: 'Taxi' },
  { pattern: 'comfort taxi', subcategory: 'Taxi' },
  // Electricity / Utilities
  { pattern: 'sp services', subcategory: 'Electricity' },
  { pattern: 'sp group', subcategory: 'Electricity' },
  { pattern: 'singapore power', subcategory: 'Electricity' },
  { pattern: 'pub ', subcategory: 'Utilities' }, // trailing space avoids matching "public"
  // Insurance
  { pattern: 'aia', subcategory: 'Insurance' },
  { pattern: 'prudential', subcategory: 'Insurance' },
  { pattern: 'ntuc income', subcategory: 'Insurance' },
  { pattern: 'manulife', subcategory: 'Insurance' },
  { pattern: 'great eastern', subcategory: 'Insurance' },
  { pattern: 'income insurance', subcategory: 'Insurance' },
  // Internet (unambiguous providers only)
  { pattern: 'myrepublic', subcategory: 'Internet' },
  { pattern: 'viewqwest', subcategory: 'Internet' },
  // Entertainment / Subscriptions
  { pattern: 'netflix', subcategory: 'Netflix' },
  { pattern: 'spotify', subcategory: 'Spotify' },
  // Business Education Work
  { pattern: 'anthropic', subcategory: 'Claude' },
  { pattern: 'udemy', subcategory: 'Courses' },
  { pattern: 'coursera', subcategory: 'Courses' },
  { pattern: 'linkedin learning', subcategory: 'Courses' },
  { pattern: 'kinokuniya', subcategory: 'Books' },
  { pattern: 'popular bookstore', subcategory: 'Books' },
  { pattern: 'times bookstore', subcategory: 'Books' },
  // Charity
  { pattern: 'spca', subcategory: 'Charity' },
  { pattern: 'wwf', subcategory: 'Charity' },
  { pattern: 'red cross', subcategory: 'Charity' },
  { pattern: 'salvation army', subcategory: 'Charity' },
  { pattern: 'community chest', subcategory: 'Charity' },
  // Pet
  { pattern: 'pet lovers centre', subcategory: 'Pet Food' },
  { pattern: 'pet safari', subcategory: 'Pet Food' },
  { pattern: 'kohepets', subcategory: 'Pet Food' },
]

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST() {
  const valid = await verifySession()
  if (!valid) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, string> = {}
  const remapLog: Array<{ rule: string; subcategory: string; count: number }> = []
  const now = new Date().toISOString()

  // ── DDL migrations (column additions) ──────────────────────────────────────

  const ddlMigrations: Array<{ name: string; sql: string }> = [
    {
      name: 'transactions.payment_method',
      sql: 'ALTER TABLE transactions ADD COLUMN payment_method TEXT',
    },
    {
      name: 'news_briefs.tickers',
      sql: 'ALTER TABLE news_briefs ADD COLUMN tickers TEXT',
    },
    {
      name: 'transactions.status',
      sql: "ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'",
    },
    {
      name: 'categories.rename_housing_household',
      sql: "UPDATE categories SET name = 'Household', updated_at = datetime('now') WHERE name = 'Housing'",
    },
    {
      name: 'tags.category_id',
      sql: 'ALTER TABLE tags ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL',
    },
    {
      name: 'categories.parent_id',
      sql: 'ALTER TABLE categories ADD COLUMN parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL',
    },
    {
      name: 'tags.drop_category_id',
      sql: 'ALTER TABLE tags DROP COLUMN category_id',
    },
    {
      name: 'accounts.delete_vallow',
      sql: "DELETE FROM accounts WHERE LOWER(name) = 'vallow'",
    },
  ]

  for (const m of ddlMigrations) {
    try {
      await db.execute(m.sql)
      results[m.name] = 'added'
    } catch {
      results[m.name] = 'already exists'
    }
  }

  // ── Backup table ────────────────────────────────────────────────────────────

  await db.execute(`
    CREATE TABLE IF NOT EXISTS category_remap_backup (
      transaction_id TEXT NOT NULL PRIMARY KEY,
      original_category_id TEXT,
      backed_up_at TEXT NOT NULL
    )
  `)
  results['category_remap_backup'] = 'ready'

  // ── Load current categories ─────────────────────────────────────────────────

  const catRes = await db.execute('SELECT id, name, type FROM categories')
  const catByName = new Map<string, string>() // name → id
  for (const row of catRes.rows) {
    catByName.set(row.name as string, row.id as string)
  }

  // ── Ensure subcategories exist with parent_id set ───────────────────────────

  let subcatsCreated = 0
  let subcatsLinked = 0

  // Deduplicate: a child name may appear under multiple parents (e.g. Netflix
  // under both Entertainment and Subscriptions). We only INSERT once.
  const processedChildren = new Set<string>()

  for (const { parent, type, children } of HIERARCHY) {
    const parentId = catByName.get(parent)
    if (!parentId) continue

    for (const child of children) {
      if (!catByName.has(child)) {
        if (processedChildren.has(child)) continue // already created under another parent
        const id = crypto.randomUUID()
        await db.execute({
          sql: `INSERT OR IGNORE INTO categories (id, name, type, sort_order, parent_id, created_at, updated_at)
                VALUES (?, ?, ?, 0, ?, ?, ?)`,
          args: [id, child, type, parentId, now, now],
        })
        // Fetch the real id in case INSERT OR IGNORE skipped a concurrent duplicate
        const fetched = await db.execute({ sql: 'SELECT id FROM categories WHERE name = ?', args: [child] })
        const realId = (fetched.rows[0]?.id as string) ?? id
        catByName.set(child, realId)
        processedChildren.add(child)
        subcatsCreated++
      } else {
        // Category exists — ensure parent_id is set
        await db.execute({
          sql: `UPDATE categories SET parent_id = ? WHERE name = ? AND (parent_id IS NULL OR parent_id != ?)`,
          args: [parentId, child, parentId],
        })
        subcatsLinked++
      }
    }
  }

  results['subcategories'] = `${subcatsCreated} created, ${subcatsLinked} linked`

  // ── Backup transactions currently pointing to parent categories ─────────────
  // INSERT OR IGNORE ensures the backup row records the *original* category_id
  // even if this migration is run more than once.

  await db.execute({
    sql: `
      INSERT OR IGNORE INTO category_remap_backup (transaction_id, original_category_id, backed_up_at)
      SELECT t.id, t.category_id, ?
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE c.parent_id IS NULL
        AND t.type != 'transfer'
        AND t.category_id IS NOT NULL
    `,
    args: [now],
  })

  results['backup'] = 'complete'

  // ── Tag-based remapping ─────────────────────────────────────────────────────
  // For each rule: update transactions whose current category has parent_id IS NULL
  // (i.e. is still a parent) and which have a matching tag. Once updated the
  // transaction's category_id points to a subcategory and is excluded from future rules.

  for (const rule of TAG_RULES) {
    const subcatId = catByName.get(rule.subcategory)
    if (!subcatId) continue

    const placeholders = rule.tags.map(() => '?').join(', ')
    const result = await db.execute({
      sql: `
        UPDATE transactions
        SET category_id = ?, updated_at = ?
        WHERE type != 'transfer'
          AND id IN (
            SELECT tt.transaction_id
            FROM transaction_tags tt
            JOIN tags tg ON tg.id = tt.tag_id
            JOIN transactions tx ON tx.id = tt.transaction_id
            JOIN categories c ON c.id = tx.category_id
            WHERE c.parent_id IS NULL
              AND LOWER(tg.name) IN (${placeholders})
          )
      `,
      args: [subcatId, now, ...rule.tags],
    })

    const count = (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0
    if (count > 0) {
      remapLog.push({ rule: `tag:${rule.tags[0]}`, subcategory: rule.subcategory, count })
    }
  }

  // ── Payee-based remapping ───────────────────────────────────────────────────
  // Applied after tag rules. Only touches transactions still pointing to a parent.

  for (const rule of PAYEE_RULES) {
    const subcatId = catByName.get(rule.subcategory)
    if (!subcatId) continue

    const result = await db.execute({
      sql: `
        UPDATE transactions
        SET category_id = ?, updated_at = ?
        WHERE type != 'transfer'
          AND payee IS NOT NULL
          AND LOWER(payee) LIKE ?
          AND id IN (
            SELECT t.id FROM transactions t
            JOIN categories c ON c.id = t.category_id
            WHERE c.parent_id IS NULL
          )
      `,
      args: [subcatId, now, `%${rule.pattern.toLowerCase()}%`],
    })

    const count = (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0
    if (count > 0) {
      remapLog.push({ rule: `payee:${rule.pattern}`, subcategory: rule.subcategory, count })
    }
  }

  const totalRemapped = remapLog.reduce((sum, e) => sum + e.count, 0)
  results['remapped'] = `${totalRemapped} transactions`

  return Response.json({ ok: true, migrations: results, remap_log: remapLog })
}
