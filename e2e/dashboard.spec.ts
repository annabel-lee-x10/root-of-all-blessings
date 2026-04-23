import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/dashboard/)
  })

  test('shows top navigation', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: 'Top navigation' })).toBeVisible()
  })

  test('shows Spend stat card', async ({ page }) => {
    await expect(page.getByText('Spend')).toBeVisible()
  })

  test('shows Income stat card', async ({ page }) => {
    await expect(page.getByText('Income')).toBeVisible()
  })

  test('shows Avg/day stat card', async ({ page }) => {
    await expect(page.getByText('Avg/day')).toBeVisible()
  })

  test('shows Top Expenses section', async ({ page }) => {
    await expect(page.getByText('Top Expenses')).toBeVisible()
  })

  test('shows Recent Transactions heading', async ({ page }) => {
    await expect(page.getByText('Recent Transactions')).toBeVisible()
  })

  test('Spend stat navigates to /transactions?type=expense', async ({ page }) => {
    await page.getByText('Spend').click()
    await expect(page).toHaveURL(/transactions.*expense|expense.*transactions/)
  })

  test('Income stat navigates to /transactions?type=income', async ({ page }) => {
    await page.getByText('Income').click()
    await expect(page).toHaveURL(/transactions.*income|income.*transactions/)
  })

  test('navigates to /transactions via bottom nav', async ({ page }) => {
    const bottomNav = page.getByRole('navigation', { name: 'Bottom navigation' })
    await bottomNav.getByRole('link', { name: 'Transactions' }).click()
    await expect(page).toHaveURL(/transactions/)
  })
})
