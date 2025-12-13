import { test, expect } from '@playwright/test';
import { loginTestUser } from './utils/e2e-helpers';

test.describe('推薦機能', () => {
  test('推薦ページでSuspenseスケルトンが表示される', async ({ page }) => {
    test.slow();
    // ログイン
    const loginSuccess = await loginTestUser(page);

    if (!loginSuccess) {
      test.skip('ログイン失敗のためスキップ');
      return;
    }

    // 推薦APIを遅延させてスケルトンを確実に観測
    await page.route('**/api/recommendations*', async (route) => {
      await new Promise(r => setTimeout(r, 800));
      await route.continue();
    });

    try {
      // 推薦ページへ直接アクセス
      await page.goto('/recommendations', { waitUntil: 'domcontentloaded' });

      // スケルトンローディングが一時的に表示されることを確認
      // （Suspenseフォールバック）
      const skeletonCards = page.locator('[data-testid="recommendation-skeleton-card"]');

      // まずは表示されることを厳密に確認
      await expect(skeletonCards.first()).toBeVisible({ timeout: 5000 });

      // その後、消えることを確認
      await expect(skeletonCards).toHaveCount(0, { timeout: 60000 });

      // 最終的に推薦記事またはメッセージが表示されることを確認
      const hasRecommendations = await page.locator('[data-testid="recommendation-card"]').count() > 0;
      const hasEmptyMessage =
        (await page.getByTestId('recommendations-empty').count()) > 0 ||
        (await page.getByText(/推薦記事がありません|おすすめの記事が見つかりませんでした/).count()) > 0;

      expect(hasRecommendations || hasEmptyMessage).toBeTruthy();
    } finally {
      // 失敗時でも必ず解除
      await page.unroute('**/api/recommendations*');
    }
  });

  test('推薦ページのローディング状態とデータ表示', async ({ page }) => {
    test.slow();
    // ログイン
    const loginSuccess = await loginTestUser(page);

    if (!loginSuccess) {
      test.skip('ログイン失敗のためスキップ');
      return;
    }

    // ネットワーク遅延をシミュレート
    await page.route('**/api/recommendations*', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.continue();
    });

    try {
      // 推薦ページへアクセス
      await page.goto('/recommendations', { waitUntil: 'domcontentloaded' });

      // ヘッダー部分が表示されることを確認（最初の要素を使用）
      await expect(page.locator('[data-testid="recommendation-header"]').first()).toBeVisible({ timeout: 30000 });

      // 更新ボタンが存在することを確認（first()を追加して strict mode エラーを回避）
      const refreshButton = page.locator('[data-testid="recommendation-refresh-button"]').first();
      await expect(refreshButton).toBeVisible();

      // 推薦記事またはメッセージが表示されるまで待つ
      await expect(
        page.locator('[data-testid="recommendation-card"], [data-testid="recommendations-empty"]')
      ).toBeVisible({ timeout: 60000 });
    } finally {
      await page.unroute('**/api/recommendations*');
    }
  });
});
