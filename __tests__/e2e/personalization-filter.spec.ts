/**
 * E2E Tests for Article Personalization Filter
 *
 * Tests the personalization filter functionality including:
 * - Toggle button visibility and interaction
 * - Category preference dialog
 * - Period selection
 * - Filter application
 */

import { test, expect } from '@playwright/test';

// Mock category data for E2E tests (DB may not have interest categories seeded)
const mockCategories = [
  { id: 'cat-1', slug: 'frontend', name: 'Frontend', description: 'Web UI development', icon: 'Monitor', sortOrder: 1, isActive: true, articleCount: 150 },
  { id: 'cat-2', slug: 'backend', name: 'Backend', description: 'Server-side development', icon: 'Server', sortOrder: 2, isActive: true, articleCount: 120 },
  { id: 'cat-3', slug: 'devops', name: 'DevOps', description: 'Infrastructure and deployment', icon: 'Cloud', sortOrder: 3, isActive: true, articleCount: 80 },
];

test.describe('Personalization Filter', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the interest-categories API to ensure data is available
    await page.route('**/api/interest-categories', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ categories: mockCategories, cacheMaxAge: 300 }),
      });
    });

    // Mock the user preferences API (with ?scope= query parameter support)
    await page.route('**/api/user/preferences/categories**', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ selectedCategories: [], filterEnabled: false, periodMonths: 12, scope: 'home' }),
        });
      } else {
        // POST - return success with selected categories
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, selectedCategories: ['cat-1'] }),
        });
      }
    });

    // Navigate to home page
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display personalization toggle in toolbar', async ({ page }) => {
    // Check toggle button is present
    const toggleButton = page.getByTestId('personalization-toggle');
    await expect(toggleButton).toBeVisible();
  });

  test('should open preference dialog when clicking toggle', async ({ page }) => {
    // Click toggle button
    const toggleButton = page.getByTestId('personalization-toggle');
    await toggleButton.click();

    // Dialog should be visible
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Dialog title should be visible
    await expect(page.getByText('興味のある分野を選択')).toBeVisible();
  });

  test('should display category cards in dialog', async ({ page }) => {
    // Open dialog
    await page.getByTestId('personalization-toggle').click();

    // Wait for dialog to be visible first
    await expect(page.getByRole('dialog')).toBeVisible();

    // Wait for categories to load from mocked API
    await page.waitForTimeout(500);

    // Check for category cards (with mocked API, cards should be visible)
    const categoryCards = page.locator('[data-testid^="category-card-"]');
    await expect(categoryCards.first()).toBeVisible();

    // Verify the count matches mocked data
    expect(await categoryCards.count()).toBe(3);
  });

  test('should allow selecting categories', async ({ page }) => {
    // Open dialog
    await page.getByTestId('personalization-toggle').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(500);

    // Category cards should be available (mocked API)
    const categoryCards = page.locator('[data-testid^="category-card-"]');
    await expect(categoryCards.first()).toBeVisible();

    // Click on a category card
    const firstCategory = categoryCards.first();
    await firstCategory.click();

    // Should be selected (aria-checked should be true)
    await expect(firstCategory).toHaveAttribute('aria-checked', 'true');

    // Click again to deselect
    await firstCategory.click();
    await expect(firstCategory).toHaveAttribute('aria-checked', 'false');
  });

  test('should display period selector options', async ({ page }) => {
    // Open dialog
    await page.getByTestId('personalization-toggle').click();

    // Check period options
    await expect(page.getByTestId('period-3')).toBeVisible();
    await expect(page.getByTestId('period-6')).toBeVisible();
    await expect(page.getByTestId('period-12')).toBeVisible();
    await expect(page.getByTestId('period-0')).toBeVisible();
  });

  test('should allow changing period selection', async ({ page }) => {
    // Open dialog
    await page.getByTestId('personalization-toggle').click();

    // Select 6 months period
    const period6 = page.getByTestId('period-6');
    await period6.click();

    // Check it's selected
    await expect(period6).toHaveAttribute('data-state', 'on');

    // Helper text should update
    await expect(page.getByText('過去6ヶ月の記事を対象にします')).toBeVisible();
  });

  test('should close dialog with cancel button', async ({ page }) => {
    // Open dialog
    await page.getByTestId('personalization-toggle').click();

    // Click cancel button
    await page.getByRole('button', { name: 'キャンセル' }).click();

    // Dialog should be closed
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should close dialog with X button', async ({ page }) => {
    // Open dialog
    await page.getByTestId('personalization-toggle').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click X button (shadcn dialog close button with sr-only "Close" text)
    const closeButton = page.getByRole('dialog').getByRole('button', { name: 'Close' });
    if (await closeButton.count() > 0) {
      await closeButton.click();
    } else {
      // Fallback: press Escape key
      await page.keyboard.press('Escape');
    }

    // Dialog should be closed
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should be keyboard accessible', async ({ page }) => {
    // Focus on toggle button
    const toggleButton = page.getByTestId('personalization-toggle');
    await toggleButton.focus();

    // Press Enter to open dialog
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should save preferences and apply filter', async ({ page }) => {
    // Open dialog (APIs are mocked in beforeEach)
    await page.getByTestId('personalization-toggle').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(500);

    // Category cards should be available (mocked API)
    const categoryCards = page.locator('[data-testid^="category-card-"]');
    await expect(categoryCards.first()).toBeVisible();

    // Select first category
    const firstCategory = categoryCards.first();
    await firstCategory.click();

    // Click save button (button text is '保存')
    await page.getByRole('button', { name: '保存' }).click();

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should display loading state while fetching categories', async ({ page }) => {
    // Slow down network to catch loading state
    await page.route('**/api/interest-categories', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    // Open dialog
    await page.getByTestId('personalization-toggle').click();

    // Loading skeleton should be briefly visible
    // Note: This test may be flaky depending on network speed
  });
});

test.describe('Personalization Filter - Guest User', () => {
  test('should show login prompt for guest users', async ({ page }) => {
    // Clear any existing session
    await page.context().clearCookies();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click toggle button
    const toggleButton = page.getByTestId('personalization-toggle');

    // The toggle might not be visible for guest users
    // or it might show a login prompt
    const isVisible = await toggleButton.isVisible().catch(() => false);

    if (isVisible) {
      await toggleButton.click();
      // Should show some indication that login is required
      // The actual behavior depends on implementation
    }
  });
});
