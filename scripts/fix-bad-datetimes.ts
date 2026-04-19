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

  // ── Fix rows with hour >= 24 (3-digit HMM import bug) ─────────────────────
  //
  // Bug in old parseDateTime: time="915" → hh=clean[0..2]="91", mm=clean[2].padStart(2)="05"
  // Stored as "T91:05:00". Reconstruction:
  //   storedHH = "91" → correctH  = storedHH[0] = "9" → 9
  //   storedMM = "05" → correctMin = storedHH[1] + storedMM[1] = "1"+"5" = "15"

  const badHourRows = await db.execute(`
    SELECT id, datetime FROM transactions
    WHERE datetime LIKE '____-__-__T__:__:__'
    AND CAST(SUBSTR(datetime, 12, 2) AS INTEGER) >= 24
  `)
  console.log(`Found ${badHourRows.rows.length} rows with bad hours (>= 24)`)

  let fixed = 0
  let skipped = 0

  for (const row of badHourRows.rows) {
    const dt = row.datetime as string
    const datePrefix = dt.slice(0, 10)   // "YYYY-MM-DD"
    const storedHH = dt.slice(11, 13)    // e.g. "91"
    const storedMM = dt.slice(14, 16)    // e.g. "05"

    const correctH = parseInt(storedHH[0], 10)
    const correctMin = parseInt(storedHH[1] + storedMM[1], 10)

    if (correctH > 23 || correctMin > 59) {
      console.log(`  SKIP ${row.id}: cannot reconstruct "${dt}" (H=${correctH}, M=${correctMin})`)
      skipped++
      continue
    }

    const newDt = `${datePrefix}T${String(correctH).padStart(2, '0')}:${String(correctMin).padStart(2, '0')}:00`
    console.log(`  FIX ${row.id}: "${dt}" → "${newDt}"`)

    await db.execute({
      sql: `UPDATE transactions SET datetime = ?, updated_at = ? WHERE id = ?`,
      args: [newDt, new Date().toISOString(), row.id as string],
    })
    fixed++
  }

  // ── Fix rows with non-standard format (e.g. "+08:00" timezone suffix) ──────

  const badFormatRows = await db.execute(`
    SELECT id, datetime FROM transactions
    WHERE datetime NOT LIKE '____-__-__T__:__:__'
    AND datetime IS NOT NULL AND datetime != ''
  `)
  console.log(`\nFound ${badFormatRows.rows.length} rows with non-standard format`)

  for (const row of badFormatRows.rows) {
    const dt = row.datetime as string
    if (dt.length >= 19 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dt)) {
      const newDt = dt.slice(0, 19)
      console.log(`  FIX ${row.id}: "${dt}" → "${newDt}"`)
      await db.execute({
        sql: `UPDATE transactions SET datetime = ?, updated_at = ? WHERE id = ?`,
        args: [newDt, new Date().toISOString(), row.id as string],
      })
      fixed++
    } else {
      console.log(`  SKIP ${row.id}: unrecognized format "${dt}"`)
      skipped++
    }
  }

  console.log(`\n──────────────────────────────────`)
  console.log(`Fixed  : ${fixed}`)
  console.log(`Skipped: ${skipped}`)

  // ── Verify ────────────────────────────────────────────────────────────────

  const remaining = await db.execute(`
    SELECT COUNT(*) as cnt FROM transactions
    WHERE (
      datetime LIKE '____-__-__T__:__:__'
      AND CAST(SUBSTR(datetime, 12, 2) AS INTEGER) >= 24
    ) OR (
      datetime NOT LIKE '____-__-__T__:__:__'
      AND datetime IS NOT NULL AND datetime != ''
    )
  `)
  console.log(`Remaining bad datetimes: ${remaining.rows[0].cnt}`)
}

main().catch(console.error)
