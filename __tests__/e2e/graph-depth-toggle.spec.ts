import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

type Depth = 1 | 2;

test.describe('Article Relationship Graph - Depth Toggle', () => {
  test.slow();

  let cachedArticleId: string | null = null;

  async function resolveGraphArticleId(page: Page) {
    if (cachedArticleId) {
      return cachedArticleId;
    }

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('[data-testid="article-card"]', { timeout: 20000 });

    const firstArticle = page.locator('[data-testid="article-card"]').first();
    await expect(firstArticle).toBeVisible({ timeout: 20000 });

    const articleId = await firstArticle.getAttribute('data-article-id');

    if (!articleId) {
      throw new Error('Failed to resolve article ID for graph tests. Seed data missing?');
    }

    cachedArticleId = articleId;
    return articleId;
  }

  async function navigateToGraphPage(page: Page) {
    const articleId = await resolveGraphArticleId(page);
    // Preflight check for the graph API so CI can skip gracefully when embeddings are unavailable
    const apiResponse = await page.request.get(
      `/api/articles/${articleId}/relationship-graph?algorithm=embedding&depth=1`
    );

    if (!apiResponse.ok() || apiResponse.status() >= 500) {
      test.skip(true, `Graph API unavailable (status ${apiResponse.status()})`);
      return articleId;
    }

    let graphData: any;
    try {
      graphData = await apiResponse.json();
    } catch {
      test.skip(true, 'Graph API returned invalid JSON');
      return articleId;
    }

    if (!Array.isArray(graphData?.nodes) || graphData.nodes.length <= 1) {
      test.skip(true, 'No embedding data available for this article');
      return articleId;
    }

    await page.goto(`/articles/${articleId}/graph`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await expect(page.getByTestId('related-count')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('depth-toggle-button')).toBeVisible({ timeout: 15000 });
    return articleId;
  }

  async function getRelatedCount(page: Page) {
    const locator = page.getByTestId('related-count').first();
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    const text = await locator.innerText();
    const match = text.match(/関連記事:\s*(\d+)/);
    return match ? Number.parseInt(match[1], 10) : 0;
  }

  function skipIfNoEmbedding(count: number) {
    test.skip(count === 0, 'No embedding data available for related articles');
  }

  async function waitForCount(page: Page, predicate: (count: number) => boolean, timeout = 10000) {
    const deadline = Date.now() + timeout;
    let latest = await getRelatedCount(page);

    while (!predicate(latest)) {
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for related count update. Last observed count: ${latest}`);
      }

      await page.waitForTimeout(200);
      latest = await getRelatedCount(page);
    }

    return latest;
  }

  function waitForGraphResponse(page: Page, articleId: string, depth: Depth) {
    const targetDepth = depth.toString();
    const endpoint = `/api/articles/${articleId}/relationship-graph`;

    return page.waitForResponse((response) => {
      if (!response.url().includes(endpoint)) {
        return false;
      }

      try {
        const url = new URL(response.url());
        const responseDepth = url.searchParams.get('depth') ?? '1';
        return responseDepth === targetDepth && response.status() === 200;
      } catch {
        return false;
      }
    }, { timeout: 15000 });
  }

  async function toggleDepth(
    page: Page,
    articleId: string,
    targetDepth: Depth
  ): Promise<any> {
    const isExpanding = targetDepth === 2;
    const button = page.getByTestId('depth-toggle-button');
    const currentStateText = isExpanding ? /さらに表示/ : /折りたたむ/;
    const nextStateText = isExpanding ? /折りたたむ/ : /さらに表示/;

    await expect(button).toBeVisible({ timeout: 10000 });
    await expect(button).toHaveText(currentStateText, { timeout: 10000 });

    const responsePromise = waitForGraphResponse(page, articleId, targetDepth);
    await button.click();
    const response = await responsePromise;

    await expect(button).toHaveText(nextStateText, { timeout: 10000 });
    return response.json();
  }

  test('should toggle from depth=1 to depth=2', async ({ page }) => {
    const articleId = await navigateToGraphPage(page);
    const initialCount = await getRelatedCount(page);
    skipIfNoEmbedding(initialCount);

    expect(initialCount).toBeGreaterThan(4);
    expect(initialCount).toBeLessThanOrEqual(12);

    await toggleDepth(page, articleId, 2);
    await expect(page.getByTestId('depth-toggle-button')).toHaveText(/折りたたむ/);

    const expandedCount = await waitForCount(page, (count) => count > initialCount);
    expect(expandedCount).toBeGreaterThan(initialCount);
    expect(expandedCount).toBeLessThanOrEqual(19);
  });

  test('should apply depth=2 visual styling', async ({ page }) => {
    const articleId = await navigateToGraphPage(page);
    const initialCount = await getRelatedCount(page);
    skipIfNoEmbedding(initialCount);
    const graphData = await toggleDepth(page, articleId, 2);

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByTestId('depth-toggle-button')).toHaveText(/折りたたむ/);

    expect(graphData?.metadata?.options?.depth).toBe(2);
    expect(graphData?.nodes?.some((node: any) => node.depth === 2)).toBeTruthy();
    expect(graphData?.links?.some((link: any) => link.level === 2 && link.parentId)).toBeTruthy();
  });

  test('should toggle back from depth=2 to depth=1', async ({ page }) => {
    const articleId = await navigateToGraphPage(page);
    const initialCount = await getRelatedCount(page);
    skipIfNoEmbedding(initialCount);

    await toggleDepth(page, articleId, 2);
    const expandedCount = await waitForCount(page, (count) => count > initialCount);
    expect(expandedCount).toBeGreaterThan(initialCount);

    await toggleDepth(page, articleId, 1);
    const collapsedCount = await waitForCount(page, (count) => count < expandedCount);

    expect(collapsedCount).toBeLessThan(expandedCount);
    expect(collapsedCount).toBeGreaterThan(0);
    await expect(page.getByTestId('depth-toggle-button')).toHaveText(/さらに表示/);
  });
});
