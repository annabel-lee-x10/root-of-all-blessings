import { NextRequest } from 'next/server'
import { verifySession } from '@/lib/session'
import { db } from '@/lib/db'
import { parseBlessThis } from '@/lib/parse-bless-this'
import {
  resolveAccount, resolveTagIds, insertDraftTransaction,
  buildCategoryBlock, resolveCategoryId,
  type CategoryRow,
} from '../_lib'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

function buildVoicePrompt(text: string, categoryBlock: string): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
  return `You are an expense parser for a personal finance app. The user described an expense in natural language (possibly transcribed from voice). Extract all available information.

Output EXACTLY in this format (omit lines you cannot determine):
Amount: [amount, numbers only]
Currency: [3-letter code, default SGD]
Merchant/Payee: [merchant or payee name]
Date: [YYYY-MM-DD, default today: ${today}]
Category: [pick one as "Parent > Subcategory", or just "Parent" if no subcategory fits]
Tags: [3-5 lowercase comma-separated contextual tags]
Description: [1-2 sentence description]

Available categories:
${categoryBlock}

Disambiguation:
- If line items are food or drink, category is Food regardless of vendor or delivery method (GrabFood, Foodpanda → Food).
- Delivery (under Lifestyle) is for non-food shipping (Amazon, Shopee, Lazada).
- Transport (under Travel) is for moving people, not goods.

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

  // Pull expense categories *with hierarchy* so we can show the LLM how parents
  // and children relate — that disambiguates cases like "food delivery" (Food >
  // Meals) from "package delivery" (Lifestyle > Delivery).
  const catResult = await db.execute({
    sql: 'SELECT id, name, parent_id FROM categories WHERE type = ?',
    args: ['expense'],
  })
  const categoryRows: CategoryRow[] = catResult.rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    parent_id: (r.parent_id as string | null) ?? null,
  }))
  const categoryBlock = buildCategoryBlock(categoryRows)

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
      messages: [{ role: 'user', content: buildVoicePrompt(text, categoryBlock) }],
    }),
  })

  if (!anthropicRes.ok) return Response.json({ error: 'Processing failed' }, { status: 500 })

  const anthropicData = await anthropicRes.json()
  const rawText: string = anthropicData.content?.[0]?.text ?? ''
  const parsed = parseBlessThis(rawText)

  const categoryId = resolveCategoryId(categoryRows, parsed.category, parsed.subcategory)

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
