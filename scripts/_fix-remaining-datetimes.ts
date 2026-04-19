import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const env = Object.fromEntries(
    readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
      .split('\n')
      .filter(l => l.includes('=') && !l.startsWith('#'))
      .map(l => [l.split('=')[0].trim(), l.slice(l.indexOf('=') + 1).trim()])
  )
  const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })

  const rows = await db.execute(`
    SELECT id, datetime FROM transactions
    WHERE datetime LIKE '____-__-__T__:__:__'
    AND CAST(SUBSTR(datetime, 12, 2) AS INTEGER) >= 24
  `)
  console.log(`Found ${rows.rows.length} remaining bad-hour rows`)

  let fixed = 0
  for (const row of rows.rows) {
    const dt = row.datetime as string
    const datePrefix = dt.slice(0, 10)
    const storedHH = dt.slice(11, 13)
    // Use first digit of storedHH as hour; minute is unrecoverable → 00
    const correctH = parseInt(storedHH[0], 10)
    const newDt = `${datePrefix}T${String(correctH).padStart(2, '0')}:00:00`
    console.log(`  FIX ${row.id}: "${dt}" → "${newDt}"`)
    await db.execute({
      sql: `UPDATE transactions SET datetime = ?, updated_at = ? WHERE id = ?`,
      args: [newDt, new Date().toISOString(), row.id as string],
    })
    fixed++
  }

  console.log(`Fixed: ${fixed}`)
  const check = await db.execute(
    `SELECT COUNT(*) as cnt FROM transactions WHERE CAST(SUBSTR(datetime,12,2) AS INTEGER) >= 24`
  )
  console.log(`Remaining bad hours: ${check.rows[0].cnt}`)
}

main().catch(console.error)
