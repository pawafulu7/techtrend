import { test, expect } from '@playwright/test';
import {
  MOCK_EMPTY_RESPONSE,
  MOCK_SUCCESS_RESPONSE,
  setupAgentSearchPage,
} from './helpers/agent-search-fixtures';

test.describe('AI Agent Search E2E: 空の状態と記事リンク', () => {
  test.beforeEach(async ({ page, context }) => {
    await setupAgentSearchPage(page, context);
  });

  test('15. Empty state guides users and links to regular search', async ({
    page,
  }) => {
    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_EMPTY_RESPONSE),
      })
    );

    await page.goto('/search/agent');

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('xyzabc123nonsense');
    // Use specific selector for search button to avoid matching category tiles
    await page
      .getByTestId('agent-search-card')
      .getByRole('button', { name: '検索' })
      .click();

    await expect(
      page.getByText('該当する記事が見つかりませんでした')
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('以下を試してみてください:')).toBeVisible();

    const searchLink = page.getByRole('link', { name: '通常検索を試す' });
    await expect(searchLink).toBeVisible();

    await searchLink.click();
    await expect(page).toHaveURL('/search');
  });
  test('16. Loading state suppresses empty state during generation', async ({
    page,
  }) => {
    // Mock a delayed API response to keep loading state visible
    await page.route('**/api/rag/agent-search', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SUCCESS_RESPONSE),
      });
    });

    await page.goto('/search/agent');

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('Next.js loading guard');
    await page
      .getByTestId('agent-search-card')
      .getByRole('button', { name: '検索' })
      .click();

    // Loading wrapper should be visible during processing
    const loadingWrapper = page.getByTestId('agent-loading-wrapper');
    await expect(loadingWrapper).toBeVisible({ timeout: 5000 });

    // Empty state should not be shown while loading
    await expect(
      page.getByText('該当する記事が見つかりませんでした')
    ).not.toBeVisible();

    // Eventually result appears
    await expect(page.getByRole('heading', { name: 'AI回答' })).toBeVisible({
      timeout: 15000,
    });
  });
  test.skip('17. Article links display and navigation', async ({ page }) => {
    // Mock API with article links
    const mockResponseWithArticles = {
      ...MOCK_SUCCESS_RESPONSE,
      response: `Reactに関する記事を3件見つけました:

1. React Server Components Guide (一致度: 92.0%)
   - サーバーコンポーネントの導入手順を解説
   - 公開日: 2025年10月20日 [#article-101]

2. React Performance Optimization (一致度: 88.0%)
   - レンダリング最適化テクニックを網羅
   - 公開日: 2025年10月18日 [#article-102]

3. React Hooks Complete Guide (一致度: 85.0%)
   - Hooks APIのベストプラクティスを整理
   - 公開日: 2025年10月15日 [#article-103]
`,
      toolCalls: [
        {
          id: '1',
          name: 'semantic-article-search',
          input: { query: 'React', topK: 3 },
          dynamic: false,
          output: {
            articles: [
              {
                articleId: '101',
                title: 'React Server Components Guide',
                similarity: 0.92,
                publishedAt: '2025-10-20T00:00:00Z',
              },
              {
                articleId: '102',
                title: 'React Performance Optimization',
                similarity: 0.88,
                publishedAt: '2025-10-18T00:00:00Z',
              },
              {
                articleId: '103',
                title: 'React Hooks Complete Guide',
                similarity: 0.85,
                publishedAt: '2025-10-15T00:00:00Z',
              },
            ],
            count: 3,
          },
        },
      ],
      articles: [
        {
          articleId: '101',
          title: 'React Server Components Guide',
          similarity: 0.92,
          publishedAt: '2025-10-20T00:00:00Z',
        },
        {
          articleId: '102',
          title: 'React Performance Optimization',
          similarity: 0.88,
          publishedAt: '2025-10-18T00:00:00Z',
        },
        {
          articleId: '103',
          title: 'React Hooks Complete Guide',
          similarity: 0.85,
          publishedAt: '2025-10-15T00:00:00Z',
        },
      ],
    };

    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponseWithArticles),
      })
    );

    await page.goto('/search/agent');
    await page.waitForLoadState('networkidle');

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('React performance optimization');
    await input.press('Enter');

    await page.waitForResponse(
      (res) =>
        res.url().includes('/api/rag/agent-search') && res.status() === 200
    );

    await page.waitForSelector('[role="article"]', { timeout: 10000 });

    const articleLinks = page.getByTestId('agent-article-link');
    await expect(articleLinks).toHaveCount(3, { timeout: 10000 });

    const firstLink = articleLinks.first();
    await expect(firstLink).toHaveAttribute('target', '_blank');
    await expect(firstLink).toHaveAttribute('rel', 'noopener noreferrer');

    const [newPage] = await Promise.all([
      page.context().waitForEvent('page'),
      firstLink.click(),
    ]);
    await newPage.waitForLoadState('domcontentloaded');

    // Verify article detail page navigation
    expect(newPage.url()).toMatch(/\/articles\/101/);

    await newPage.close();
  });
  test.skip('18. Article links not displayed when no results', async ({
    page,
  }) => {
    // Mock API without article links
    const mockResponseWithoutArticles = {
      ...MOCK_SUCCESS_RESPONSE,
      toolCalls: [
        {
          id: '1',
          name: 'other-tool',
          input: {},
          dynamic: false,
        },
      ],
    };

    await page.route('**/api/rag/agent-search', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponseWithoutArticles),
      });
    });

    await page.goto('/search/agent');
    await page.waitForLoadState('networkidle');

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('xyzabc123nonexistent');
    await input.press('Enter');

    await page.waitForResponse(
      (res) =>
        res.url().includes('/api/rag/agent-search') && res.status() === 200
    );

    // Verify article links section is not displayed
    const articlesSection = page.locator('h2:has-text("参照記事")');
    await expect(articlesSection).not.toBeVisible();
  });
});
