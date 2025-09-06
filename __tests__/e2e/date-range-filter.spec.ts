import { test, expect } from '@playwright/test';

test.describe('Date Range Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="article-list"]');
  });

  test('should display date range filter', async ({ page }) => {
    // Date range filter is in the sidebar on desktop
    // Check if viewport is wide enough to show sidebar
    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width >= 1024) {
      // On desktop, filter is in sidebar
      const dateRangeFilter = page.locator('[data-testid="date-range-filter"]');
      await expect(dateRangeFilter).toBeVisible();
    
      // Check default value
      const trigger = page.locator('[data-testid="date-range-trigger"]');
      await expect(trigger).toContainText('全期間');
    } else {
      // On mobile, skip this test as filter is in mobile menu
      test.skip();
    }
  });

  test('should open date range dropdown on click', async ({ page }) => {
    const trigger = page.locator('[data-testid="date-range-trigger"]');
    await trigger.click();
    
    // Check if dropdown content is visible
    const content = page.locator('[data-testid="date-range-content"]');
    await expect(content).toBeVisible();
    
    // Check all options are present
    await expect(page.locator('[data-testid="date-range-option-all"]')).toBeVisible();
    await expect(page.locator('[data-testid="date-range-option-today"]')).toBeVisible();
    await expect(page.locator('[data-testid="date-range-option-week"]')).toBeVisible();
    await expect(page.locator('[data-testid="date-range-option-month"]')).toBeVisible();
    await expect(page.locator('[data-testid="date-range-option-3months"]')).toBeVisible();
  });

  test('should filter articles by today', async ({ page }) => {
    const trigger = page.locator('[data-testid="date-range-trigger"]');
    await trigger.click();
    
    // Wait for dropdown to be visible
    await page.waitForSelector('[data-testid="date-range-content"]', { state: 'visible', timeout: 5000 });
    
    // Select "今日" option
    await page.locator('[data-testid="date-range-option-today"]').click();
    
    // Wait for URL to update
    await page.waitForFunction(() => {
      return window.location.search.includes('dateRange=today');
    }, { timeout: 10000 });
    
    // Check URL has correct parameter
    expect(page.url()).toContain('dateRange=today');
    
    // Check trigger text updated
    await expect(trigger).toContainText('今日');
    
    // Wait for articles to reload
    await page.waitForSelector('[data-testid="article-list"]', { timeout: 10000 });
  });

  test('should filter articles by week', async ({ page }) => {
    const trigger = page.locator('[data-testid="date-range-trigger"]');
    await trigger.click();
    
    await page.waitForSelector('[data-testid="date-range-content"]', { state: 'visible', timeout: 5000 });
    await page.locator('[data-testid="date-range-option-week"]').click();
    
    await page.waitForFunction(() => {
      return window.location.search.includes('dateRange=week');
    }, { timeout: 10000 });
    expect(page.url()).toContain('dateRange=week');
    await expect(trigger).toContainText('今週');
  });

  test('should filter articles by month', async ({ page }) => {
    const trigger = page.locator('[data-testid="date-range-trigger"]');
    await trigger.click();
    
    await page.waitForSelector('[data-testid="date-range-content"]', { state: 'visible', timeout: 5000 });
    await page.locator('[data-testid="date-range-option-month"]').click();
    
    await page.waitForFunction(() => {
      return window.location.search.includes('dateRange=month');
    }, { timeout: 10000 });
    expect(page.url()).toContain('dateRange=month');
    await expect(trigger).toContainText('今月');
  });

  test('should filter articles by 3 months', async ({ page }) => {
    const trigger = page.locator('[data-testid="date-range-trigger"]');
    await trigger.click();
    
    await page.waitForSelector('[data-testid="date-range-content"]', { state: 'visible', timeout: 5000 });
    await page.locator('[data-testid="date-range-option-3months"]').click();
    
    await page.waitForFunction(() => {
      return window.location.search.includes('dateRange=3months');
    }, { timeout: 10000 });
    expect(page.url()).toContain('dateRange=3months');
    await expect(trigger).toContainText('過去3ヶ月');
  });

  test('should reset to all periods', async ({ page }) => {
    // First set a filter
    const trigger = page.locator('[data-testid="date-range-trigger"]');
    await trigger.click();
    await page.locator('[data-testid="date-range-option-week"]').click();
    await page.waitForURL('**/dateRange=week**', { timeout: 30000 });
    
    // Then reset to all
    await trigger.click();
    await page.locator('[data-testid="date-range-option-all"]').click();
    
    // Check URL doesn't have dateRange parameter
    await page.waitForFunction(() => !window.location.href.includes('dateRange'));
    expect(page.url()).not.toContain('dateRange');
    await expect(trigger).toContainText('全期間');
  });

  test('should combine with source filter', async ({ page }) => {
    // Apply date range filter
    const dateRangeTrigger = page.locator('[data-testid="date-range-trigger"]');
    await dateRangeTrigger.click();
    await page.locator('[data-testid="date-range-option-week"]').click();
    await page.waitForURL('**/dateRange=week**', { timeout: 30000 });
    
    // Apply source filter
    const sourceCheckbox = page.locator('[data-testid="source-checkbox-Qiita"]').first();
    await sourceCheckbox.click();
    
    // Check both filters are in URL
    await page.waitForFunction(() => {
      const url = window.location.href;
      return url.includes('dateRange=week') && url.includes('sources=');
    });
    
    const url = page.url();
    expect(url).toContain('dateRange=week');
    expect(url).toContain('sources=');
  });

  test('should reset page to 1 when changing date range', async ({ page }) => {
    // Navigate to page 2 first
    await page.goto('/?page=2');
    await page.waitForSelector('[data-testid="article-list"]');
    
    // Apply date range filter
    const trigger = page.locator('[data-testid="date-range-trigger"]');
    await trigger.click();
    await page.locator('[data-testid="date-range-option-week"]').click();
    
    // Check page parameter is removed or set to 1
    await page.waitForFunction(() => {
      const url = window.location.href;
      return !url.includes('page=2');
    });
    
    const url = page.url();
    expect(url).not.toContain('page=2');
  });

  test('should work on mobile view', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Open mobile filters
    await page.locator('button:has-text("フィルター")').click();
    
    // Wait for sheet to open
    await page.waitForSelector('[data-testid="date-range-filter"]');
    
    // Check date range filter is visible in mobile sheet
    const dateRangeFilter = page.locator('[data-testid="date-range-filter"]');
    await expect(dateRangeFilter).toBeVisible();
    
    // Test selecting an option
    const trigger = page.locator('[data-testid="date-range-trigger"]');
    await trigger.click();
    await page.locator('[data-testid="date-range-option-week"]').click();
    
    // Check URL updated
    await page.waitForURL('**/dateRange=week**', { timeout: 30000 });
    expect(page.url()).toContain('dateRange=week');
  });
});