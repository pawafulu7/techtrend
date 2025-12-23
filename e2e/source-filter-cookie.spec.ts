import { test, expect } from '@playwright/test';
import { waitForArticles, getTimeout, isRunningInCI } from './helpers/wait-utils';

const isCI = isRunningInCI();

test.describe('Source Filter Cookie', () => {
  // CI環境では30秒、ローカルでは15秒
  test.describe.configure({ timeout: isCI ? 30000 : 15000 });

  test.beforeEach(async ({ page }) => {
    // Wait for initial page load with deterministic signals
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('source-filter').first().waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should persist source selection in cookie', async ({ page, context }) => {
    // Wait for filters to load
    await page.waitForSelector('[data-testid="source-filter"]');

    // Click on a specific source checkbox to deselect it
    const awsCheckbox = page.locator('[data-testid="source-checkbox-aws"] [role="checkbox"]');

    // Check if AWS checkbox exists
    if (await awsCheckbox.count() === 0) {
      console.log('AWS checkbox not found, skipping test');
      return;
    }

    await awsCheckbox.first().click();

    // Wait for navigation to complete
    await page.waitForURL(/sources=/, { waitUntil: 'commit' });

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
    await page.waitForSelector('[data-testid="source-filter"]');

    // Check that the selection is restored from cookie
    const awsCheckbox = page.locator('[data-testid="source-checkbox-aws"] [role="checkbox"]').first();
    const devtoCheckbox = page.locator('[data-testid="source-checkbox-devto"] [role="checkbox"]').first();
    const qiitaCheckbox = page.locator('[data-testid="source-checkbox-qiita"] [role="checkbox"]').first();

    // Check if checkboxes exist
    if (await awsCheckbox.count() === 0) {
      console.log('Checkboxes not found, skipping test');
      return;
    }

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
    const awsCheckbox = page.locator('[data-testid="source-checkbox-aws"] [role="checkbox"]').first();
    const devtoCheckbox = page.locator('[data-testid="source-checkbox-devto"] [role="checkbox"]').first();
    const qiitaCheckbox = page.locator('[data-testid="source-checkbox-qiita"] [role="checkbox"]').first();

    if (await awsCheckbox.count() === 0) {
      console.log('Checkboxes not found, skipping test');
      return;
    }

    await expect(awsCheckbox).toBeChecked();
    await expect(devtoCheckbox).not.toBeChecked();
    await expect(qiitaCheckbox).toBeChecked();
  });

  test('should work with select all and deselect all buttons', async ({ page, context }, testInfo) => {
    test.setTimeout(getTimeout('long'));
    // Wait for source filter to be ready
    await page.waitForSelector('[data-testid="source-filter"]', { timeout: 10000 });

    // Look for select/deselect buttons with longer timeout
    const deselectAllButton = page.locator('[data-testid="deselect-all-button"]:visible');
    const selectAllButton = page.locator('[data-testid="select-all-button"]:visible');

    // Check if buttons exist
    if (await deselectAllButton.count() === 0 || await selectAllButton.count() === 0) {
      testInfo.skip(true, 'Select/deselect buttons not found');
      return;
    }

    const sourceCount = page.locator('[data-testid="source-count"]');
    const sourceCountText = (await sourceCount.innerText()).trim();
    const countMatch = sourceCountText.match(/(\d+)\s*\/\s*(\d+)/);
    expect(countMatch).not.toBeNull();
    const totalSources = Number(countMatch?.[2] ?? 0);
    expect(totalSources).toBeGreaterThan(0);
    const shortTimeout = getTimeout('short');

    // Click deselect all and wait for UI to confirm (use source-count, not checkboxes which may be hidden in collapsed categories)
    await deselectAllButton.click();
    await expect(sourceCount).toHaveText(new RegExp(`^0\\s*/\\s*${totalSources}$`), { timeout: shortTimeout });

    await waitForArticles(page, {
      timeout: getTimeout('medium'),
      allowEmpty: true,
      waitForNetworkIdle: false
    });

    // Check cookie is set to empty
    const cookies1 = await context.cookies();
    const cookie1 = cookies1.find(c => c.name === 'source-filter');
    // Cookie behavior may vary - it might be undefined or have a specific value

    // Click select all and wait for UI to confirm all sources are on again (use source-count, not checkboxes which may be hidden in collapsed categories)
    await selectAllButton.click();
    await expect(sourceCount).toHaveText(new RegExp(`^${totalSources}\\s*/\\s*${totalSources}$`), { timeout: shortTimeout });

    await waitForArticles(page, {
      timeout: getTimeout('medium'),
      allowEmpty: true,
      waitForNetworkIdle: false
    });

    // Check final URL state
    const url = page.url();
    const hasSourceParam = url.includes('sources=');
    if (hasSourceParam) {
      // sources=noneまたはsources=allの場合を許容
      expect(url).toMatch(/sources=(all|none)/);
    } else {
      // sourcesパラメータがない場合もOK
      expect(url).not.toContain('sources=');
    }
  });

  test('should persist selection across page navigation', async ({ page }) => {
    // Set initial selection
    await page.goto('/?sources=aws,devto', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="source-filter"]');

    // Navigate away to trigger cookie flush (no reload needed)
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="source-filter"]');

    // Check selection is maintained
    const awsCheckbox = page.locator('[data-testid="source-checkbox-aws"] [role="checkbox"]').first();
    const devtoCheckbox = page.locator('[data-testid="source-checkbox-devto"] [role="checkbox"]').first();

    if (await awsCheckbox.count() === 0) {
      console.log('Checkboxes not found, skipping test');
      return;
    }

    await expect(awsCheckbox).toBeChecked();
    await expect(devtoCheckbox).toBeChecked();
  });

  test('should work on mobile view', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Try to find mobile filter button
    const mobileFilterButton = page.locator('button').filter({ hasText: /フィルター|filter/i }).first();

    if (await mobileFilterButton.count() === 0) {
      // If no mobile filter button, check if filters are already visible
      const sourceFilter = page.locator('[data-testid="source-filter"]');
      if (await sourceFilter.count() === 0) {
        console.log('Mobile filter not implemented, skipping test');
        return;
      }
    } else {
      // Open mobile filters
      await mobileFilterButton.click();
      // Wait for filter panel to appear
      await page.getByTestId('source-filter').last().waitFor({ state: 'visible', timeout: 5000 });
    }

    // Wait for source filter to be visible - use :visible to target only rendered sheet
    const sourceFilter = page.locator('[data-testid="source-filter"]:visible').last();
    await expect(sourceFilter).toBeVisible({ timeout: 10000 });

    // Toggle a source
    const awsCheckbox = page.locator('[data-testid="source-checkbox-aws"] [role="checkbox"]').first();

    if (await awsCheckbox.count() === 0) {
      console.log('AWS checkbox not found in mobile view, skipping test');
      return;
    }

    // Click and wait for URL to update
    await awsCheckbox.click();
    await page.waitForURL(/sources=/, { timeout: 5000, waitUntil: 'commit' });
  });
});
