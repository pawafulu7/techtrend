import { test, expect, type Page, type Route } from '@playwright/test';
import { waitForPageLoad } from '../e2e/utils/e2e-helpers';

const ARTICLE_SELECTOR =
  '[data-testid="article-card"], [data-testid="compact-card"]';

test.describe('Thumbnail display - Page Rendering', () => {
  test('should render article detail page without image errors', async ({
    page,
  }) => {
    // Navigate to article detail page
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await waitForPageLoad(page, { waitForNetworkIdle: false });

    // Wait for articles to load
    await page.waitForSelector(ARTICLE_SELECTOR, { timeout: 10000 });

    // Click first article
    const firstArticle = page.locator(ARTICLE_SELECTOR).first();
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
    await page.waitForSelector(ARTICLE_SELECTOR, { timeout: 10000 });

    // Verify article cards are displayed
    const articles = page.locator(ARTICLE_SELECTOR);
    const count = await articles.count();
    expect(count).toBeGreaterThan(0);

    // Verify first article is clickable
    const firstArticle = articles.first();
    await expect(firstArticle).toBeVisible();
  });

  test('should not cause critical console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const unauthorizedResponses = new Set<string>();
    const allowed401Paths = [
      '/api/user/preferences/categories',
      '/api/interest-categories',
      '/api/user',
    ];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('response', (response) => {
      if (response.status() === 401) {
        unauthorizedResponses.add(response.url());
      }
    });

    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await waitForPageLoad(page, { waitForNetworkIdle: false });

    // Wait for articles to load
    await page.waitForSelector(ARTICLE_SELECTOR, { timeout: 10000 });

    // Wait a bit for any delayed errors
    await page.waitForTimeout(2000);

    // Verify that only expected personalization endpoints return 401 for guest users
    const unexpected401s = Array.from(unauthorizedResponses).filter(
      (url) => !allowed401Paths.some((allowed) => url.includes(allowed))
    );
    expect(unexpected401s).toEqual([]);

    // Critical errors should not occur
    // Expected errors to filter out:
    // - image loading errors (expected with external images)
    // - favicon errors (expected)
    // - 401 Unauthorized (browser logs generic message without URL)
    //   We already verified above that only expected personalization endpoints return 401.
    //   The UI gracefully falls back to default state without personalization.
    const criticalErrors = consoleErrors.filter(
      (err) =>
        !err.includes('image') &&
        !err.includes('favicon') &&
        !err.includes('401') &&
        !err.includes('Failed to fetch') &&
        !err.includes('NetworkError') &&
        !err.includes('/api/auth/get-session')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('should not block page rendering for missing thumbnails', async ({
    page,
  }) => {
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await waitForPageLoad(page, { waitForNetworkIdle: false });

    // Wait for article cards to render (server-side rendered, no client API mock needed)
    const articles = page.locator(ARTICLE_SELECTOR);
    await expect(articles.first()).toBeVisible({ timeout: 15000 });

    // Verify articles are displayed
    const count = await articles.count();
    expect(count).toBeGreaterThan(0);

    // Page should be interactive
    const firstArticle = articles.first();
    await expect(firstArticle).toBeVisible();
  });
});

// サムネイルの最適化と、失敗時の切り替え（Issue #718）。
// テスト DB のサムネイルは picsum.photos なので、/_next/image と picsum の応答を差し替えて
// 「最適化が通る」「最適化が失敗して元の URL に切り替わる」「両方失敗して画像を消す」を決定的に確かめる
test.describe('Thumbnail optimization', () => {
  // 幅と高さを持つ SVG なら、どの候補幅で要求されても naturalWidth が 0 にならない
  const SVG_IMAGE =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225"><rect width="400" height="225" fill="#888"/></svg>';
  const fulfillImage = (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: SVG_IMAGE,
    });
  const fulfill402 = (route: Route) =>
    route.fulfill({
      status: 402,
      contentType: 'text/plain',
      body: 'Payment Required',
    });

  async function openHome(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForPageLoad(page, { waitForNetworkIdle: false });
    const cards = page.locator(ARTICLE_SELECTOR);
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    return cards;
  }

  test('serves thumbnails through /_next/image', async ({ page }) => {
    await page.route('**/_next/image?**', fulfillImage);
    const cards = await openHome(page);
    const img = cards.locator('img').first();
    await expect(img).toBeAttached({ timeout: 15000 });

    await expect
      .poll(() => img.evaluate((el) => el.naturalWidth), { timeout: 15000 })
      .toBeGreaterThan(0);
    const currentSrc = new URL(await img.evaluate((el) => el.currentSrc));
    expect(currentSrc.pathname).toBe('/_next/image');
    expect(currentSrc.searchParams.get('url')).toMatch(/^https:\/\//);
    expect(currentSrc.searchParams.get('q')).toBe('75');
  });

  test('falls back to the original URL when the optimizer fails (e.g. 402 over the quota)', async ({
    page,
  }) => {
    await page.route('**/_next/image?**', fulfill402);
    await page.route('https://picsum.photos/**', fulfillImage);
    const cards = await openHome(page);
    const img = cards.locator('img').first();
    await expect(img).toBeAttached({ timeout: 15000 });

    await expect
      .poll(() => img.evaluate((el) => el.currentSrc), { timeout: 15000 })
      .toMatch(/^https:\/\/picsum\.photos\//);
    await expect
      .poll(() => img.evaluate((el) => el.naturalWidth), { timeout: 15000 })
      .toBeGreaterThan(0);
  });

  test('hides the thumbnail when both the optimizer and the original fail', async ({
    page,
  }) => {
    await page.route('**/_next/image?**', fulfill402);
    await page.route('https://picsum.photos/**', (route) => route.abort());
    const cards = await openHome(page);

    await expect
      .poll(() => cards.locator('img').count(), { timeout: 15000 })
      .toBe(0);
    await expect(cards.first()).toBeVisible();
  });
});
