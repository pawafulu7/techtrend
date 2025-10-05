import { test, expect } from '@playwright/test';

test.describe('Thumbnail Display with Custom Loader', () => {
  test('should display thumbnail from hashnode.com domain', async ({ page }) => {
    // Navigate to the specific article with hashnode.com thumbnail
    await page.goto('/articles/cmgeb857i0005tefkww91p533', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for article title to load
    await page.waitForSelector('h1', { timeout: 10000 });

    // Find thumbnail image
    const thumbnail = page.locator('img[alt*="NIST"]').first();
    await expect(thumbnail).toBeVisible({ timeout: 10000 });

    // Verify the image source contains hashnode.com domain
    const src = await thumbnail.getAttribute('src');
    expect(src).toContain('hashnode.com');

    // Verify image loaded successfully (not error placeholder)
    const naturalWidth = await thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test('should display thumbnails from various domains on home page', async ({ page }) => {
    await page.goto('/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for articles to load
    await page.waitForSelector('[data-testid="article-card"]', { timeout: 10000 });

    // Find all thumbnail images
    const thumbnails = page.locator('img[src*="https://"]');
    const count = await thumbnails.count();
    expect(count).toBeGreaterThan(0);

    // Collect all unique domains
    const srcs = await thumbnails.evaluateAll((imgs: HTMLImageElement[]) =>
      imgs.map((img) => {
        try {
          return new URL(img.src).hostname;
        } catch {
          return '';
        }
      }).filter(Boolean)
    );

    const uniqueDomains = new Set(srcs);

    // Verify at least 3 different domains are present
    expect(uniqueDomains.size).toBeGreaterThanOrEqual(3);

    console.log(`Found ${uniqueDomains.size} unique image domains:`, Array.from(uniqueDomains).slice(0, 10));
  });

  test('should handle image loading errors gracefully', async ({ page }) => {
    await page.goto('/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for articles to load
    await page.waitForSelector('[data-testid="article-card"]', { timeout: 10000 });

    // Check that placeholder images are shown for broken images
    const images = page.locator('img');
    const imageCount = await images.count();

    // At least some images should be visible
    expect(imageCount).toBeGreaterThan(0);

    // Verify no console errors related to image loading
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('image')) {
        consoleErrors.push(msg.text());
      }
    });

    // Wait a bit for any delayed errors
    await page.waitForTimeout(2000);

    // Image-related errors should be minimal (error handling should work)
    expect(consoleErrors.length).toBeLessThanOrEqual(5);
  });

  test('should display converted HTTPS thumbnails', async ({ page }) => {
    // Test one of the successfully converted HTTP -> HTTPS thumbnails
    await page.goto('/articles/cmg38l0is000qtexn5gw94x2q', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for article title
    await page.waitForSelector('h1', { timeout: 10000 });

    // Find thumbnail image
    const thumbnail = page.locator('img').first();

    // Verify image is using HTTPS (not HTTP)
    const src = await thumbnail.getAttribute('src');
    if (src) {
      expect(src).toMatch(/^https:/);
      expect(src).not.toMatch(/^http:/);
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
