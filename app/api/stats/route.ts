import { db } from '@/lib/db'

export async function GET() {
  const [acctResult, catResult, tagResult] = await Promise.all([
    db.execute(`SELECT account_id, COUNT(*) as cnt FROM transactions GROUP BY account_id`),
    db.execute(
      `SELECT category_id, COUNT(*) as cnt FROM transactions WHERE category_id IS NOT NULL GROUP BY category_id`
    ),
    db.execute(`SELECT tag_id, COUNT(*) as cnt FROM transaction_tags GROUP BY tag_id`),
  ])

  const accounts: Record<string, number> = {}
  for (const r of acctResult.rows) accounts[r.account_id as string] = Number(r.cnt)

  const categories: Record<string, number> = {}
  for (const r of catResult.rows) categories[r.category_id as string] = Number(r.cnt)

  const tags: Record<string, number> = {}
  for (const r of tagResult.rows) tags[r.tag_id as string] = Number(r.cnt)

  return Response.json({ accounts, categories, tags })
}
