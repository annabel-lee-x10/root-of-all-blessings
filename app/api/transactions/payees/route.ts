import { db } from '@/lib/db'

export async function GET() {
  const result = await db.execute(
    `SELECT DISTINCT payee FROM transactions WHERE payee IS NOT NULL AND payee != '' ORDER BY payee`
  )
  return Response.json(result.rows.map((r) => r.payee as string))
}
