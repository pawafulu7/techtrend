import { test, expect } from '@playwright/test';

test.describe('Source Filter Cookie', () => {
  test('should persist source selection in cookie', async ({ page, context }) => {
    // Navigate to home page
    await page.goto('/');
    
    // Wait for filters to load
    await page.waitForSelector('[data-testid="source-filter"]');
    
    // Click on a specific source checkbox to deselect it
    const awsCheckbox = page.locator('[data-testid="source-checkbox-aws"]');
    await awsCheckbox.click();
    
    // Wait for navigation to complete
    await page.waitForURL(/sources=/);
    
    // Get cookies
    const cookies = await context.cookies();
    const sourceFilterCookie = cookies.find(c => c.name === 'source-filter');
    
    // Cookie should be set
    expect(sourceFilterCookie).toBeDefined();
    expect(sourceFilterCookie?.value).not.toContain('aws');
  });

  test('should restore source selection from cookie on page reload', async ({ page }) => {
    // Navigate to home page with specific sources selected
    await page.goto('/?sources=devto,qiita');
    
    // Wait for filters to load
    await page.waitForSelector('[data-testid="source-filter"]');
    
    // Reload the page (without URL params)
    await page.goto('/');
    
    // Check that the selection is restored from cookie
    const awsCheckbox = page.locator('[data-testid="source-checkbox-aws"] input[type="checkbox"]');
    const devtoCheckbox = page.locator('[data-testid="source-checkbox-devto"] input[type="checkbox"]');
    const qiitaCheckbox = page.locator('[data-testid="source-checkbox-qiita"] input[type="checkbox"]');
    
    // AWS should be unchecked, devto and qiita should be checked
    await expect(awsCheckbox).not.toBeChecked();
    await expect(devtoCheckbox).toBeChecked();
    await expect(qiitaCheckbox).toBeChecked();
  });

  test('should prioritize URL params over cookie', async ({ page }) => {
    // First set a cookie by visiting with certain sources
    await page.goto('/?sources=devto');
    await page.waitForSelector('[data-testid="source-filter"]');
    
    // Now visit with different URL params
    await page.goto('/?sources=aws,qiita');
    await page.waitForSelector('[data-testid="source-filter"]');
    
    // Check that URL params take priority
    const awsCheckbox = page.locator('[data-testid="source-checkbox-aws"] input[type="checkbox"]');
    const devtoCheckbox = page.locator('[data-testid="source-checkbox-devto"] input[type="checkbox"]');
    const qiitaCheckbox = page.locator('[data-testid="source-checkbox-qiita"] input[type="checkbox"]');
    
    await expect(awsCheckbox).toBeChecked();
    await expect(devtoCheckbox).not.toBeChecked();
    await expect(qiitaCheckbox).toBeChecked();
  });

  test('should work with select all and deselect all buttons', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="source-filter"]');
    
    // Click deselect all
    await page.click('[data-testid="deselect-all-button"]');
    
    // Wait for navigation
    await page.waitForURL(/sources=/);
    
    // Check cookie is set to empty
    const cookies1 = await context.cookies();
    const cookie1 = cookies1.find(c => c.name === 'source-filter');
    expect(cookie1).toBeUndefined(); // Cookie should be deleted when empty
    
    // Click select all
    await page.click('[data-testid="select-all-button"]');
    
    // Wait for navigation (should go back to base URL)
    await page.waitForURL('/');
    
    // Cookie should be cleared (all selected is default)
    const cookies2 = await context.cookies();
    const cookie2 = cookies2.find(c => c.name === 'source-filter');
    expect(cookie2).toBeUndefined(); // No cookie when all selected
  });

  test('should persist selection across page navigation', async ({ page }) => {
    // Set initial selection
    await page.goto('/?sources=aws,devto');
    await page.waitForSelector('[data-testid="source-filter"]');
    
    // Navigate to a different page (if available)
    // For now, just reload
    await page.reload();
    
    // Remove URL params by navigating to base
    await page.goto('/');
    
    // Check selection is maintained
    const awsCheckbox = page.locator('[data-testid="source-checkbox-aws"] input[type="checkbox"]');
    const devtoCheckbox = page.locator('[data-testid="source-checkbox-devto"] input[type="checkbox"]');
    
    await expect(awsCheckbox).toBeChecked();
    await expect(devtoCheckbox).toBeChecked();
  });

  test('should work on mobile view', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/');
    
    // Open mobile filters
    await page.click('button:has-text("フィルター")');
    
    // Wait for sheet to open
    await page.waitForSelector('[data-testid="source-filter"]');
    
    // Toggle a source
    const awsCheckbox = page.locator('[data-testid="source-checkbox-aws"]');
    await awsCheckbox.click();
    
    // Check URL updated
    await expect(page).toHaveURL(/sources=/);
  });
});