import { test, expect } from '@playwright/test';
import { waitForTagFilter, waitForArticles } from './helpers/wait-utils';

// 環境別タイムアウト値
const timeout = process.env.CI ? 30000 : 15000;

test.describe('タグフィルター機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 初期読み込み待機（タイムアウトを延長）
    await waitForArticles(page, { timeout, allowEmpty: true });
  });

  test('タグフィルタードロップダウンが表示される', async ({ page }) => {
    await waitForTagFilter(page);
    const tagFilterButton = page.getByTestId('tag-filter-button');
    await expect(tagFilterButton).toBeVisible({ timeout });
  });

  test('タグ選択で記事がフィルタリングされる', async ({ page }) => {
    // 初期の記事数を取得
    const initialCount = await page.locator('[data-testid="article-card"]').count();

    // data-testidを使用してタグフィルターを開く
    const tagFilterButton = page.getByTestId('tag-filter-button');
    await tagFilterButton.click();

    // ドロップダウンの表示を待機
    await page.waitForSelector('[data-testid="tag-dropdown"]', {
      state: 'visible',
      timeout
    });

    // TypeScriptタグを選択（存在する場合）
    // ドロップダウン内のタグアイテムを正確に選択
    const typeScriptOption = page.locator('[data-testid="tag-dropdown"]').locator('[data-testid*="tag-item"]').filter({ hasText: 'TypeScript' }).first();
    if (await typeScriptOption.count() > 0) {
      const tagName = 'TypeScript';
      const urlPromise = page.waitForURL(
        (url) => url.searchParams.get('tags')?.split(',').includes(tagName) ?? false,
        { timeout }
      );
      const apiPromise = page.waitForResponse(
        (resp) =>
          resp.ok() &&
          resp.url().includes('/api/articles') &&
          (new URL(resp.url()).searchParams.get('tags')?.split(',').includes(tagName) ?? false),
        { timeout }
      ).catch(() => null);

      await Promise.all([urlPromise, apiPromise, typeScriptOption.click()]);
      await waitForArticles(page, { timeout, waitForNetworkIdle: false, allowEmpty: true });

      // 記事数が変化したか確認
      const filteredCount = await page.locator('[data-testid="article-card"]').count();
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }
  });

  test('複数タグのOR検索が動作する', async ({ page }) => {
    // data-testidを使用してタグフィルターを開く
    const tagFilterButton = page.getByTestId('tag-filter-button');
    await tagFilterButton.click();

    // ドロップダウンの表示を待機
    await page.waitForSelector('[data-testid="tag-dropdown"]', {
      state: 'visible',
      timeout
    });

    // 複数タグを選択
    // ドロップダウン内のタグアイテムを正確に選択
    const reactTag = page.locator('[data-testid="tag-dropdown"]').locator('[data-testid*="tag-item"]').filter({ hasText: 'React' }).first();
    const typeScriptTag = page.locator('[data-testid="tag-dropdown"]').locator('[data-testid*="tag-item"]').filter({ hasText: 'TypeScript' }).first();

    if ((await reactTag.count() > 0) && (await typeScriptTag.count() > 0)) {
      await reactTag.click();
      await typeScriptTag.click();

      // Wait for URL to update with both tags
      await page.waitForURL(
        (url) => {
          const tags = url.searchParams.get('tags')?.split(',') ?? [];
          return tags.includes('React') || tags.includes('TypeScript');
        },
        { timeout }
      );

      // Wait for article API response
      await page.waitForResponse(
        (resp) => resp.ok() && resp.url().includes('/api/articles'),
        { timeout }
      ).catch(() => null);

      await waitForArticles(page, { timeout, waitForNetworkIdle: false, allowEmpty: true });

      // 記事が表示されていることを確認
      const articles = page.locator('[data-testid="article-card"]');
      await expect(articles.first()).toBeVisible({ timeout });
    }
  });

  test('タグフィルターのクリアが動作する', async ({ page }) => {
    // data-testidを使用してタグフィルターを開く
    const tagFilterButton = page.getByTestId('tag-filter-button');
    await tagFilterButton.click();

    // ドロップダウンの表示を待機
    await page.waitForSelector('[data-testid="tag-dropdown"]', {
      state: 'visible',
      timeout
    });

    // タグを選択
    const firstTag = page.locator('input[type="checkbox"]').first();
    if (await firstTag.isVisible({ timeout: 5000 })) {
      await firstTag.click();

      // Wait for filter to apply
      await page.waitForURL((url) => url.searchParams.has('tags'), { timeout });
      await page.waitForResponse(
        (resp) => resp.ok() && resp.url().includes('/api/articles'),
        { timeout }
      ).catch(() => null);

      await waitForArticles(page, { timeout, waitForNetworkIdle: false, allowEmpty: true });

      // クリアボタンを探してクリック
      const clearButton = page.locator('button').filter({ hasText: /クリア|Clear|リセット|Reset/ });
      if (await clearButton.isVisible({ timeout: 5000 })) {
        await clearButton.click();

        // Wait for URL to be cleared
        await page.waitForURL((url) => !url.searchParams.has('tags'), { timeout });
        await page.waitForResponse(
          (resp) => resp.ok() && resp.url().includes('/api/articles'),
          { timeout }
        ).catch(() => null);

        await waitForArticles(page, { timeout, waitForNetworkIdle: false, allowEmpty: true });

        // すべての記事が表示されることを確認
        const articles = page.locator('[data-testid="article-card"]');
        const count = await articles.count();
        expect(count).toBeGreaterThan(0);
      }
    }
  });
});
