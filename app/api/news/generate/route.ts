import { NextRequest } from 'next/server'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

/**
 * Proxy for the Anthropic API. The client manages the agentic loop and
 * sends each turn here; we add the API key server-side and forward.
 *
 * This keeps the key out of the browser and avoids CSP connect-src changes.
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'Anthropic API not configured on this server' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  })

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}
