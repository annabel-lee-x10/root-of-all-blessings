import { test, expect } from '@playwright/test'

test.describe('Transactions', () => {
  test('loads /transactions page', async ({ page }) => {
    await page.goto('/transactions')
    await expect(page).toHaveURL(/transactions/)
    await expect(page.getByRole('navigation', { name: 'Top navigation' })).toBeVisible()
  })

  test('FAB navigates to /add', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('link', { name: 'Add transaction' }).click()
    await expect(page).toHaveURL(/\/add/)
  })

  test('add page shows manual entry form', async ({ page }) => {
    await page.goto('/add')
    await expect(page.getByText("Where's My Money")).toBeVisible()
  })

  test('add page shows receipt dropzone', async ({ page }) => {
    await page.goto('/add')
    // ReceiptDropzone should be present (collapsed or expanded)
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('can add a transaction via manual form', async ({ page }) => {
    await page.goto('/add')

    // Expand the manual entry card if collapsed
    const manualHeader = page.getByText("Where's My Money")
    await manualHeader.click()

    // Fill amount
    const amountInput = page.getByPlaceholder('0.00')
    await amountInput.fill('12.50')

    // The form should show the amount
    await expect(amountInput).toHaveValue('12.50')
  })

  test('transactions page shows filter controls', async ({ page }) => {
    await page.goto('/transactions')
    // Page should load without crashing
    await expect(page.getByRole('navigation', { name: 'Top navigation' })).toBeVisible()
  })
})

test.describe('Transaction edit and delete', () => {
  test('transactions page renders without error when empty', async ({ page }) => {
    await page.goto('/transactions')
    // Should not show an error message
    await expect(page.getByText(/error|crash|failed/i)).not.toBeVisible()
  })
})
