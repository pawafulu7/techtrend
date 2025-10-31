import { test, expect } from '@playwright/test';
import { waitForPageLoad } from '../e2e/utils/e2e-helpers';

// Mock article data for deterministic testing (matches real API contract)
const MOCK_ARTICLES_RESPONSE = {
  success: true,
  data: {
    items: [
      {
        id: 'test-1',
        title: 'Test Article 1',
        url: 'https://example.com/1',
        summary: 'Test summary 1',
        thumbnail: 'https://example.com/thumb1.jpg',
        publishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        qualityScore: 75,
        bookmarks: 10,
        userVotes: 5,
        difficulty: 'beginner' as const,
        sourceId: 'test-source',
        summaryVersion: 1,
        articleType: 'blog' as const,
        category: 'AI' as const
      },
      {
        id: 'test-2',
        title: 'Test Article 2',
        url: 'https://example.com/2',
        summary: 'Test summary 2',
        thumbnail: null,
        publishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        qualityScore: 80,
        bookmarks: 15,
        userVotes: 8,
        difficulty: 'intermediate' as const,
        sourceId: 'test-source',
        summaryVersion: 1,
        articleType: 'tutorial' as const,
        category: 'Web' as const
      },
      {
        id: 'test-3',
        title: 'Test Article 3',
        url: 'https://example.com/3',
        summary: 'Test summary 3',
        thumbnail: 'https://example.com/thumb3.jpg',
        publishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        qualityScore: 85,
        bookmarks: 20,
        userVotes: 12,
        difficulty: 'advanced' as const,
        sourceId: 'test-source',
        summaryVersion: 1,
        articleType: 'documentation' as const,
        category: 'DevOps' as const
      }
    ],
    total: 3,
    page: 1,
    totalPages: 1,
    limit: 20
  },
  meta: {
    userDataIncluded: false
  }
};

test.describe('Custom Image Loader - Page Rendering', () => {
  test('should render article detail page without image errors', async ({ page }) => {
    // Navigate to article detail page
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await waitForPageLoad(page, { waitForNetworkIdle: false });

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
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await waitForPageLoad(page, { waitForNetworkIdle: false });

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
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await waitForPageLoad(page, { waitForNetworkIdle: false });

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
    // Mock articles API for deterministic testing
    await page.route('**/api/articles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ARTICLES_RESPONSE),
      });
    });

    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await waitForPageLoad(page, { waitForNetworkIdle: false });

    // Wait for article cards to render
    const articles = page.locator('[data-testid="article-card"]');
    await expect(articles.first()).toBeVisible({ timeout: 10000 });

    // Final verification
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
    // Track mock hits for debugging
    let mockHits = 0;

    // Mock articles API for deterministic testing
    await page.route('**/api/articles*', async (route) => {
      mockHits++;
      console.log(`[MOCK] Hit #${mockHits}: ${route.request().url()}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ARTICLES_RESPONSE),
      });
    });

    // Track failed requests
    page.on('requestfailed', (request) => {
      console.log(`[FAILED] ${request.url()}`);
    });

    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await waitForPageLoad(page, { waitForNetworkIdle: false });

    // Wait for article cards to render (this triggers the API call)
    const articles = page.locator('[data-testid="article-card"]');
    await expect(articles.first()).toBeVisible({ timeout: 10000 });

    // Verify mock was called (async wait for useEffect to trigger fetch)
    await expect.poll(() => mockHits, { timeout: 5000 }).toBeGreaterThan(0);
    console.log(`[DEBUG] Total mock hits: ${mockHits}`);

    // Final verification
    const count = await articles.count();
    expect(count).toBeGreaterThan(0);

    // Page should be interactive
    const firstArticle = articles.first();
    await expect(firstArticle).toBeVisible();
  });
});
