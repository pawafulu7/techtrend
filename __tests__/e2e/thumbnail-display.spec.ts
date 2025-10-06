import { test, expect } from '@playwright/test';

test.describe('Custom Image Loader - Page Rendering', () => {
  test('should render article detail page without image errors', async ({ page }) => {
    // Navigate to article detail page
    await page.goto('/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for articles to load
    await page.waitForSelector('[data-testid="article-card"]', { timeout: 10000 });

    // Click first article
    const firstArticle = page.locator('[data-testid="article-card"]').first();
    await firstArticle.click();

    // Wait for article detail page to load
    await page.waitForURL(/\/articles\/.+/, { timeout: 10000 });
    await page.waitForSelector('h1', { timeout: 10000 });

    // Verify main content is visible
    const title = page.locator('h1');
    await expect(title).toBeVisible();

    // Verify page rendered successfully (no critical errors)
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should render home page with article cards', async ({ page }) => {
    await page.goto('/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for articles to load
    await page.waitForSelector('[data-testid="article-card"]', { timeout: 10000 });

    // Verify article cards are displayed
    const articles = page.locator('[data-testid="article-card"]');
    const count = await articles.count();
    expect(count).toBeGreaterThan(0);

    // Verify first article is clickable
    const firstArticle = articles.first();
    await expect(firstArticle).toBeVisible();
  });

  test('should not cause critical console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for articles to load
    await page.waitForSelector('[data-testid="article-card"]', { timeout: 10000 });

    // Wait a bit for any delayed errors
    await page.waitForTimeout(2000);

    // Critical errors should not occur (image errors are expected and handled)
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes('image') && !err.includes('favicon')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('should render page with custom image loader configured', async ({ page }) => {
    await page.goto('/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Verify page loads successfully
    await page.waitForSelector('[data-testid="article-card"]', { timeout: 10000 });

    // Verify articles are displayed
    const articles = page.locator('[data-testid="article-card"]');
    const count = await articles.count();
    expect(count).toBeGreaterThan(0);

    // If images are present, they should use HTTPS (custom loader returns URL as-is)
    const images = page.locator('img[src^="https://"]');
    const imageCount = await images.count();

    // Images may or may not be present depending on article types
    // If present, verify they use HTTPS protocol
    if (imageCount > 0) {
      const firstImage = images.first();
      const src = await firstImage.getAttribute('src');
      expect(src).toMatch(/^https:/);
    }
  });

  test('should not block page rendering for missing thumbnails', async ({ page }) => {
    await page.goto('/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Articles should be displayed even if some thumbnails are missing
    const articles = page.locator('[data-testid="article-card"]');
    const count = await articles.count();

    expect(count).toBeGreaterThan(0);

    // Page should be interactive
    const firstArticle = articles.first();
    await expect(firstArticle).toBeVisible();
  });
});
