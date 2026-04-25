import { test, expect } from '@playwright/test'

test.describe('News refresh smoke test', () => {
  test(
    'refresh populates at least 3 of 5 sections with cards',
    async ({ page }) => {
      // Navigate to Portfolio page
      await page.goto('/portfolio')
      await expect(page).toHaveURL(/portfolio/)

      // Switch to News view via the ViewToggle
      await page.getByRole('button', { name: 'News' }).click()

      // Wait for NewsClient to mount (Refresh button appears in sticky sub-nav)
      const refreshBtn = page.getByRole('button', { name: /↻ Refresh/ })
      await expect(refreshBtn).toBeVisible()

      // Expand the three collapsed sections so their cards will be visible after refresh
      await page.getByRole('heading', { name: 'Singapore Property' }).click()
      await page.getByRole('heading', { name: 'Global Tech Employment' }).click()
      await page.getByRole('heading', { name: 'Singapore Tech Jobs' }).click()

      // Click Refresh (use exact text to avoid matching the disabled "↻ Refreshing..." state)
      await page.getByRole('button', { name: '↻ Refresh' }).click()

      // Wait for refresh to complete: button returns to idle ("↻ Refresh"),
      // no longer showing "↻ Refreshing...". Generous 90s for sequential Anthropic calls.
      await expect(page.getByRole('button', { name: '↻ Refresh' })).toBeVisible({
        timeout: 90_000,
      })
      await expect(page.getByRole('button', { name: /Refreshing/ })).not.toBeVisible()

      // Count sections still showing the empty-state message.
      // 5 sections total: World Headlines, Singapore Headlines, Singapore Property,
      // Global Tech Employment, Singapore Tech Jobs.
      // At least 3 must be populated → at most 2 may be empty.
      const emptyCount = await page
        .getByText('No stories yet — hit Refresh to generate.')
        .count()

      expect(emptyCount).toBeLessThanOrEqual(2)
    },
    { timeout: 120_000 }
  )
})
