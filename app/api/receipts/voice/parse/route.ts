import { NextRequest } from 'next/server'
import { verifySession } from '@/lib/session'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

export async function POST(request: NextRequest) {
  const valid = await verifySession()
  if (!valid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'Receipt processing not configured' }, { status: 503 })

  let body: { text?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { text } = body
  if (!text?.trim()) return Response.json({ error: 'text is required' }, { status: 400 })

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
  const prompt = `You are an expense parser for a personal finance app. The user described an expense in natural language (possibly transcribed from voice). Extract all available information.

Output EXACTLY in this format (omit lines you cannot determine):
Amount: [amount, numbers only]
Currency: [3-letter code, default SGD]
Merchant/Payee: [merchant or payee name]
Date: [YYYY-MM-DD, default today: ${today}]
Category: [one of: Food, Transport, Housing, Bills, Health, Entertainment, Subscriptions, Education, Pet, Other]
Tags: [3-5 lowercase comma-separated contextual tags]
Description: [1-2 sentence description]

User input: "${text}"`

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
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!anthropicRes.ok) return Response.json({ error: 'Processing failed' }, { status: 500 })

  const data = await anthropicRes.json()
  const raw: string = data.content?.[0]?.text ?? ''

  return Response.json({ raw }, { status: 200 })
}
