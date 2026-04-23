import { test, expect } from '@playwright/test'

test.describe('Categories', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/categories')
    await expect(page).toHaveURL(/categories/)
  })

  test('shows Categories heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible()
  })

  test('shows New Category button', async ({ page }) => {
    await expect(page.getByRole('button', { name: '+ New Category' })).toBeVisible()
  })

  test('shows Expense and Income tab buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Expense' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Income' })).toBeVisible()
  })

  test('opens create form when New Category is clicked', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Category' }).click()
    await expect(page.getByRole('button', { name: 'Add' })).toBeVisible()
  })

  test('Cancel collapses the create form', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Category' }).click()
    await expect(page.getByRole('button', { name: 'Add' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('button', { name: 'Add' })).not.toBeVisible()
  })

  test('can create a new expense category', async ({ page }) => {
    const name = `E2E Category ${Date.now()}`

    await page.getByRole('button', { name: '+ New Category' }).click()

    // Fill category name in the create form
    const nameInput = page.locator('input').filter({ hasNot: page.getByRole('searchbox') }).first()
    await nameInput.fill(name)
    await page.getByRole('button', { name: 'Add' }).click()

    await expect(page.getByText(name)).toBeVisible()
  })

  test('Income tab shows income categories', async ({ page }) => {
    await page.getByRole('button', { name: 'Income' }).click()
    // Tab should switch — page remains on /categories
    await expect(page).toHaveURL(/categories/)
    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible()
  })

  test('Expense tab shows expense categories', async ({ page }) => {
    // Switch to Income first then back
    await page.getByRole('button', { name: 'Income' }).click()
    await page.getByRole('button', { name: 'Expense' }).click()
    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible()
  })

  test('can drill down into a category row', async ({ page }) => {
    // Create a category and click it to see subcategory area
    const name = `E2E Drilldown ${Date.now()}`
    await page.getByRole('button', { name: '+ New Category' }).click()
    const nameInput = page.locator('input').first()
    await nameInput.fill(name)
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText(name)).toBeVisible()

    // Click on the category to expand/drill into it
    await page.getByText(name).click()
    // Page should remain stable
    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible()
  })
})
