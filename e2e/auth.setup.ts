import { test as setup, expect } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '.auth/user.json')

setup('authenticate as test user', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByLabel('Password')).toBeVisible()

  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  // After login, / redirects to /dashboard
  await page.waitForURL('**/dashboard')
  await expect(page.getByRole('navigation', { name: 'Top navigation' })).toBeVisible()

  await page.context().storageState({ path: authFile })
})
