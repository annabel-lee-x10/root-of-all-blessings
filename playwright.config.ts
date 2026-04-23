import { defineConfig, devices } from '@playwright/test'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Populate process.env from .env.test before spawning the dev server.
// Next.js dev server inherits process.env, so these vars are available at runtime.
dotenv.config({ path: path.join(__dirname, '.env.test') })

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    // 1. Auth setup — runs once, saves cookies to e2e/.auth/user.json
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { viewport: { width: 390, height: 844 } },
    },

    // 2. Mobile (390×844) — all specs except auth.spec.ts
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: /auth\.spec\.ts/,
    },

    // 3. Desktop (1280×720) — all specs except auth.spec.ts
    {
      name: 'chromium-desktop',
      use: {
        viewport: { width: 1280, height: 720 },
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: /auth\.spec\.ts/,
    },

    // 4. Auth tests — no stored session (tests login/logout itself)
    {
      name: 'auth-tests',
      use: { viewport: { width: 390, height: 844 } },
      testMatch: /auth\.spec\.ts/,
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
})
