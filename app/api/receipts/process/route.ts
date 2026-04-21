import { NextRequest } from 'next/server'
import { verifySession } from '@/lib/session'
import { db } from '@/lib/db'
import { parseBlessThis } from '@/lib/parse-bless-this'
import { resolveAccount, resolveTagIds, insertDraftTransaction } from '../_lib'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

const RECEIPT_PROMPT = `You are a receipt parser for a personal finance app. Extract all available expense information from this receipt image.

Output EXACTLY in this format (omit lines you cannot determine):
Amount: [total amount, numbers only]
Currency: [3-letter code, default SGD]
Merchant/Payee: [store or vendor name]
Date: [YYYY-MM-DD — convert whatever date format appears on the receipt]
Time: [HH:MM 24h]
Category: [one of: Food, Transport, Housing, Bills, Health, Entertainment, Subscriptions, Education, Pet, Other]
Tags: [3-5 lowercase comma-separated contextual tags]
Description: [1-2 sentence description of the purchase context]
Payment Method: [cash/credit card/debit card/e-wallet]

Rules:
- Amount is the grand total (GST-inclusive if shown)
- Date: virtually all receipts print a transaction date — look for it even if formatted as "21 Apr 2026", "21/04/2026", "Apr 21, 2026" etc. and convert to YYYY-MM-DD. Only omit if no date whatsoever is visible.
- Category inferred from merchant type and line items
- Tags: use item types, time of day, merchant type, spend amount as signals
- If a field cannot be determined, omit that line entirely`

export async function POST(request: NextRequest) {
  const valid = await verifySession()
  if (!valid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'Receipt processing not configured' }, { status: 503 })

  let body: { imageBase64?: string; mediaType?: string; merchantLookup?: boolean; accountId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { imageBase64, mediaType, merchantLookup = false, accountId } = body

  if (!imageBase64) return Response.json({ error: 'imageBase64 is required' }, { status: 400 })
  if (!mediaType || !mediaType.startsWith('image/')) {
    return Response.json({ error: 'mediaType must be an image/* type' }, { status: 400 })
  }

  const byteLength = Buffer.from(imageBase64, 'base64').length
  if (byteLength > MAX_IMAGE_BYTES) {
    return Response.json({ error: 'Image exceeds 5 MB limit' }, { status: 400 })
  }

  const resolvedAccountId = await resolveAccount(accountId)
  if (!resolvedAccountId) return Response.json({ error: 'No active account found' }, { status: 400 })

  // Look up account type to derive payment_method (account type IS the payment method)
  const accountRow = await db.execute({
    sql: 'SELECT type FROM accounts WHERE id = ?',
    args: [resolvedAccountId],
  })
  const derivedPaymentMethod = (accountRow.rows[0]?.type as string) ?? null

  const anthropicRes = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: RECEIPT_PROMPT },
        ],
      }],
    }),
  })

  if (!anthropicRes.ok) return Response.json({ error: 'Receipt processing failed' }, { status: 500 })

  const anthropicData = await anthropicRes.json()
  const rawText: string = anthropicData.content?.[0]?.text ?? ''
  console.log('[receipt-process] rawText:', rawText.slice(0, 600))
  const parsed = parseBlessThis(rawText)
  console.log('[receipt-process] parsed.date:', parsed.date, '| parsed.time:', parsed.time)

  // Optional merchant lookup: second Claude text call
  let merchantNote = ''
  if (merchantLookup && parsed.payee) {
    try {
      const lookupRes = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 256,
          messages: [{
            role: 'user',
            content: `Describe "${parsed.payee}" in 1-2 sentences: what kind of place is it, what's the vibe, where is it typically found? Be concise and conversational. If you don't know, respond only with: UNKNOWN`,
          }],
        }),
      })
      if (lookupRes.ok) {
        const lookupData = await lookupRes.json()
        const lookupText: string = lookupData.content?.[0]?.text ?? ''
        if (!lookupText.toUpperCase().includes('UNKNOWN')) {
          merchantNote = lookupText.trim()
        }
      }
    } catch { /* non-fatal: skip merchant lookup on error */ }
  }

  // Match category by name
  const catResult = await db.execute({
    sql: 'SELECT id, name FROM categories WHERE type = ?',
    args: ['expense'],
  })
  let categoryId: string | null = null
  if (parsed.category) {
    const match = catResult.rows.find(
      (c) => (c.name as string).toLowerCase() === parsed.category!.toLowerCase()
    )
    if (match) categoryId = match.id as string
  }

  const tagIds = parsed.tags ? await resolveTagIds(parsed.tags) : []

  if (parsed.amount == null) {
    return Response.json({ error: 'Could not extract amount from receipt', parsed }, { status: 422 })
  }

  // Build note: merchant description + parsed notes
  const noteText = [merchantNote, parsed.notes].filter(Boolean).join(' ') || null

  // Build datetime from parsed date + time.
  // Fallback: epoch sentinel (1970-01-01T00:00:00Z) signals "date not found" to the UI.
  const EPOCH = '1970-01-01T00:00:00.000Z'
  let datetime = EPOCH
  let dateExtracted = false
  if (parsed.date) {
    const timePart = parsed.time ?? '00:00'
    const sgtDate = new Date(`${parsed.date}T${timePart}:00+08:00`)
    if (!isNaN(sgtDate.getTime())) {
      datetime = sgtDate.toISOString()
      dateExtracted = true
    }
    // else: normaliseDate returned an unrecognised format — keep epoch fallback
  }

  const draft = await insertDraftTransaction({
    accountId: resolvedAccountId,
    categoryId,
    payee: parsed.payee ?? null,
    note: noteText,
    paymentMethod: derivedPaymentMethod,
    amount: parsed.amount,
    currency: parsed.currency ?? 'SGD',
    datetime,
    tagIds,
  })

  return Response.json({ draft, date_extracted: dateExtracted }, { status: 201 })
}
