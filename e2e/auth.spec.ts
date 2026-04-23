import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('shows login page at /login', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('redirects unauthenticated user to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/login/)
  })

  test('logs in with correct password', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Password').fill('password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard')
    await expect(page.getByRole('navigation', { name: 'Top navigation' })).toBeVisible()
  })

  test('shows error for wrong password', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Incorrect password')).toBeVisible()
  })

  test('Sign in button is disabled with empty password', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled()
  })

  test('logs out and redirects to /login', async ({ page }) => {
    // Log in first
    await page.goto('/login')
    await page.getByLabel('Password').fill('password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard')

    // Click Sign out
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/login/)
  })
})
