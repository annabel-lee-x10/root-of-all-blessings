import { vi } from 'vitest'

process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough-for-hs256'
process.env.HASHED_PASSWORD = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi' // "password"
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

vi.mock('@/lib/db', () => ({
  db: {
    execute: vi.fn(),
    batch: vi.fn(),
  },
}))
