import { NextRequest } from 'next/server'
import { verifySession } from '@/lib/session'
import { db } from '@/lib/db'
import { parseBlessThis } from '@/lib/parse-bless-this'
import { resolveAccount, resolveTagIds, insertDraftTransaction } from '../_lib'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

function buildVoicePrompt(text: string): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
  return `You are an expense parser for a personal finance app. The user described an expense in natural language (possibly transcribed from voice). Extract all available information.

Output EXACTLY in this format (omit lines you cannot determine):
Amount: [amount, numbers only]
Currency: [3-letter code, default SGD]
Merchant/Payee: [merchant or payee name]
Date: [YYYY-MM-DD, default today: ${today}]
Category: [one of: Food, Transport, Housing, Bills, Health, Entertainment, Subscriptions, Education, Pet, Other]
Tags: [3-5 lowercase comma-separated contextual tags]
Description: [1-2 sentence description]

User input: "${text}"`
}

export async function POST(request: NextRequest) {
  const valid = await verifySession()
  if (!valid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'Receipt processing not configured' }, { status: 503 })

  let body: { text?: string; accountId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { text, accountId } = body
  if (!text || !text.trim()) return Response.json({ error: 'text is required' }, { status: 400 })

  const resolvedAccountId = await resolveAccount(accountId)
  if (!resolvedAccountId) return Response.json({ error: 'No active account found' }, { status: 400 })

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
      max_tokens: 512,
      messages: [{ role: 'user', content: buildVoicePrompt(text) }],
    }),
  })

  if (!anthropicRes.ok) return Response.json({ error: 'Processing failed' }, { status: 500 })

  const anthropicData = await anthropicRes.json()
  const rawText: string = anthropicData.content?.[0]?.text ?? ''
  const parsed = parseBlessThis(rawText)

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

  if (parsed.amount == null) {
    return Response.json({ error: 'Could not extract amount from transcript', parsed }, { status: 422 })
  }

  const tagIds = parsed.tags ? await resolveTagIds(parsed.tags) : []

  let datetime = new Date().toISOString()
  if (parsed.date) {
    const timePart = parsed.time ?? '00:00'
    datetime = new Date(`${parsed.date}T${timePart}:00+08:00`).toISOString()
  }

  const draft = await insertDraftTransaction({
    accountId: resolvedAccountId,
    categoryId,
    payee: parsed.payee ?? null,
    note: parsed.notes ?? null,
    paymentMethod: derivedPaymentMethod,
    amount: parsed.amount,
    currency: parsed.currency ?? 'SGD',
    datetime,
    tagIds,
  })

  return Response.json({ draft }, { status: 201 })
}
