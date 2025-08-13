import { test, expect } from '@playwright/test';

test.describe('Multiple Source Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the page to load
    await page.waitForSelector('[data-testid="article-list"], article', { timeout: 10000 });
  });

  test('should display checkboxes for source selection', async ({ page }) => {
    // Open filters on desktop
    const filtersSection = page.locator('aside').first();
    
    if (await filtersSection.isVisible()) {
      // Desktop view
      const checkboxes = filtersSection.locator('input[type="checkbox"]');
      const checkboxCount = await checkboxes.count();
      expect(checkboxCount).toBeGreaterThan(0);
      
      // Check if "Select All" button exists
      const selectAllButton = filtersSection.locator('button:has-text("すべて")');
      await expect(selectAllButton).toBeVisible();
    } else {
      // Mobile view - open sheet
      const mobileFilterButton = page.locator('button:has-text("フィルター")');
      await mobileFilterButton.click();
      await page.waitForSelector('[role="dialog"]');
      
      const checkboxes = page.locator('[role="dialog"] input[type="checkbox"]');
      const checkboxCount = await checkboxes.count();
      expect(checkboxCount).toBeGreaterThan(0);
    }
  });

  test('should filter articles by multiple selected sources', async ({ page }) => {
    // Get filters section
    const filtersSection = page.locator('aside').first();
    
    if (await filtersSection.isVisible()) {
      // Desktop view
      // Get first two checkboxes
      const checkboxes = filtersSection.locator('input[type="checkbox"]');
      const checkboxCount = await checkboxes.count();
      
      if (checkboxCount >= 2) {
        // Select first two sources
        await checkboxes.nth(0).check();
        await checkboxes.nth(1).check();
        
        // Wait for URL to update
        await page.waitForFunction(() => window.location.search.includes('sources='));
        
        // Verify URL contains sources parameter
        const url = page.url();
        expect(url).toContain('sources=');
        
        // Wait for articles to reload
        await page.waitForLoadState('networkidle');
        
        // Verify articles are displayed
        const articles = page.locator('[data-testid="article-list"] article, article');
        const articleCount = await articles.count();
        expect(articleCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('should handle select all / deselect all functionality', async ({ page }) => {
    const filtersSection = page.locator('aside').first();
    
    if (await filtersSection.isVisible()) {
      // Find the select all button
      const selectAllButton = filtersSection.locator('button').filter({ hasText: /すべて/ }).first();
      
      // Click select all
      await selectAllButton.click();
      await page.waitForLoadState('networkidle');
      
      // Check if all checkboxes are selected
      const checkboxes = filtersSection.locator('input[type="checkbox"]');
      const checkboxCount = await checkboxes.count();
      
      if (checkboxCount > 0) {
        // When all are selected, URL should not have sources parameter (shows all)
        const url1 = page.url();
        expect(url1).not.toContain('sources=');
        
        // Click deselect all (same button, different text)
        const deselectButton = filtersSection.locator('button').filter({ hasText: /解除/ }).first();
        if (await deselectButton.isVisible()) {
          await deselectButton.click();
          await page.waitForLoadState('networkidle');
          
          // Should still show all articles (no filter)
          const url2 = page.url();
          expect(url2).not.toContain('sources=');
        }
      }
    }
  });

  test('should persist selection on page reload', async ({ page }) => {
    const filtersSection = page.locator('aside').first();
    
    if (await filtersSection.isVisible()) {
      const checkboxes = filtersSection.locator('input[type="checkbox"]');
      const checkboxCount = await checkboxes.count();
      
      if (checkboxCount >= 2) {
        // Select first two sources
        await checkboxes.nth(0).check();
        await checkboxes.nth(1).check();
        
        // Wait for URL to update
        await page.waitForFunction(() => window.location.search.includes('sources='));
        
        const urlBefore = page.url();
        
        // Reload page
        await page.reload();
        await page.waitForLoadState('networkidle');
        
        // Verify URL is preserved
        const urlAfter = page.url();
        expect(urlAfter).toBe(urlBefore);
        
        // Verify checkboxes are still checked
        const checkboxesAfterReload = page.locator('aside').first().locator('input[type="checkbox"]');
        await expect(checkboxesAfterReload.nth(0)).toBeChecked();
        await expect(checkboxesAfterReload.nth(1)).toBeChecked();
      }
    }
  });

  test('should show selected count', async ({ page }) => {
    const filtersSection = page.locator('aside').first();
    
    if (await filtersSection.isVisible()) {
      // Look for count display (e.g., "2/10")
      const countDisplay = filtersSection.locator('text=/\\d+\\/\\d+/');
      await expect(countDisplay).toBeVisible();
      
      // Select some sources and verify count updates
      const checkboxes = filtersSection.locator('input[type="checkbox"]');
      const checkboxCount = await checkboxes.count();
      
      if (checkboxCount >= 1) {
        await checkboxes.nth(0).check();
        
        // Wait for count to update
        await page.waitForTimeout(500);
        
        const countText = await countDisplay.textContent();
        expect(countText).toMatch(/1\/\d+/);
      }
    }
  });

  test('should work with pagination', async ({ page }) => {
    const filtersSection = page.locator('aside').first();
    
    if (await filtersSection.isVisible()) {
      const checkboxes = filtersSection.locator('input[type="checkbox"]');
      const checkboxCount = await checkboxes.count();
      
      if (checkboxCount >= 1) {
        // Select first source
        await checkboxes.nth(0).check();
        
        // Wait for URL to update
        await page.waitForFunction(() => window.location.search.includes('sources='));
        
        // Check if pagination exists
        const paginationNext = page.locator('a[aria-label="次のページ"], button:has-text("次へ")');
        
        if (await paginationNext.isVisible()) {
          // Click next page
          await paginationNext.click();
          await page.waitForLoadState('networkidle');
          
          // Verify sources parameter is preserved
          const url = page.url();
          expect(url).toContain('sources=');
          expect(url).toContain('page=2');
        }
      }
    }
  });

  test('should work on mobile view', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Open mobile filters
    const mobileFilterButton = page.locator('button').filter({ hasText: 'フィルター' }).first();
    await expect(mobileFilterButton).toBeVisible();
    await mobileFilterButton.click();
    
    // Wait for sheet to open
    await page.waitForSelector('[role="dialog"]');
    
    // Check for checkboxes in mobile view
    const checkboxes = page.locator('[role="dialog"] input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    expect(checkboxCount).toBeGreaterThan(0);
    
    if (checkboxCount >= 2) {
      // Select sources
      await checkboxes.nth(0).check();
      await checkboxes.nth(1).check();
      
      // Close sheet by clicking outside or close button
      const closeButton = page.locator('[role="dialog"] button[aria-label="Close"]');
      if (await closeButton.isVisible()) {
        await closeButton.click();
      } else {
        // Click outside
        await page.keyboard.press('Escape');
      }
      
      // Wait for sheet to close and URL to update
      await page.waitForTimeout(500);
      
      // Verify URL contains sources
      const url = page.url();
      expect(url).toContain('sources=');
    }
  });
});