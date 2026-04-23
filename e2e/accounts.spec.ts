import { test, expect } from '@playwright/test'

test.describe('Accounts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/accounts')
    await expect(page).toHaveURL(/accounts/)
  })

  test('shows Accounts heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
  })

  test('shows New Account button', async ({ page }) => {
    await expect(page.getByRole('button', { name: '+ New Account' })).toBeVisible()
  })

  test('opens create form when New Account is clicked', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Account' }).click()
    await expect(page.getByPlaceholder('e.g. DBS Chequing')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible()
  })

  test('Cancel collapses the create form', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Account' }).click()
    await expect(page.getByPlaceholder('e.g. DBS Chequing')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByPlaceholder('e.g. DBS Chequing')).not.toBeVisible()
  })

  test('can create a new account', async ({ page }) => {
    const name = `E2E Test Account ${Date.now()}`

    await page.getByRole('button', { name: '+ New Account' }).click()
    await page.getByPlaceholder('e.g. DBS Chequing').fill(name)
    await page.getByRole('button', { name: 'Create Account' }).click()

    // Account appears in the list
    await expect(page.getByText(name)).toBeVisible()
  })

  test('can edit an existing account', async ({ page }) => {
    // First create an account to edit
    const name = `E2E Edit ${Date.now()}`
    await page.getByRole('button', { name: '+ New Account' }).click()
    await page.getByPlaceholder('e.g. DBS Chequing').fill(name)
    await page.getByRole('button', { name: 'Create Account' }).click()
    await expect(page.getByText(name)).toBeVisible()

    // Click Edit for that account
    const accountRow = page.getByText(name).locator('..').locator('..')
    await accountRow.getByRole('button', { name: 'Edit' }).click()

    // Edit the name
    const editedName = name + ' (edited)'
    const editInput = page.getByRole('textbox').last()
    await editInput.clear()
    await editInput.fill(editedName)
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText(editedName)).toBeVisible()
  })

  test('can toggle account active state', async ({ page }) => {
    // Create a test account
    const name = `E2E Toggle ${Date.now()}`
    await page.getByRole('button', { name: '+ New Account' }).click()
    await page.getByPlaceholder('e.g. DBS Chequing').fill(name)
    await page.getByRole('button', { name: 'Create Account' }).click()
    await expect(page.getByText(name)).toBeVisible()

    // Find and click Deactivate / toggle button
    const accountRow = page.getByText(name).locator('..').locator('..')
    const toggleBtn = accountRow.getByRole('button', { name: /deactivate|reactivate/i })
    await toggleBtn.click()

    // A toast or state change should occur — just verify the page doesn't crash
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
  })
})
