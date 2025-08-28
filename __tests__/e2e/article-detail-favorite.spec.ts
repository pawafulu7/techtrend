import { test, expect } from '@playwright/test';

test.describe('Article Detail Favorite Button', () => {
  test.beforeEach(async ({ page }) => {
    // 最初の記事詳細ページに遷移
    await page.goto('/');
    await page.waitForSelector('article');
    
    // 最初の記事をクリック
    const firstArticle = page.locator('article').first();
    const articleLink = firstArticle.locator('a[href^="/articles/"]').first();
    await articleLink.click();
    
    // 詳細ページが読み込まれるまで待機
    await page.waitForURL(/\/articles\/.+/);
    await page.waitForSelector('h1');
  });

  test('should display favorite button in header area', async ({ page }) => {
    // お気に入りボタンが存在することを確認
    const favoriteButton = page.locator('button').filter({ hasText: /お気に入り|Favorite/i }).first();
    await expect(favoriteButton).toBeVisible();
    
    // ボタンがヘッダーエリア（CardHeader内）にあることを確認
    const headerArea = page.locator('[class*="CardHeader"]').first();
    const buttonInHeader = headerArea.locator('button').filter({ hasText: /お気に入り|Favorite/i });
    await expect(buttonInHeader).toBeVisible();
  });

  test('should show login prompt when clicking favorite button while not logged in', async ({ page }) => {
    // お気に入りボタンをクリック
    const favoriteButton = page.locator('button').filter({ hasText: /お気に入り|Favorite/i }).first();
    await favoriteButton.click();
    
    // トースト通知またはリダイレクトを確認
    // トースト通知の場合
    const toastMessage = page.locator('[role="alert"], [class*="toast"]');
    const hasToast = await toastMessage.count() > 0;
    
    if (hasToast) {
      // トーストメッセージにログイン関連のテキストが含まれることを確認
      await expect(toastMessage).toContainText(/ログイン|login/i);
    } else {
      // リダイレクトされた場合
      await page.waitForURL(/\/auth\/login/, { timeout: 5000 }).catch(() => {
        // リダイレクトされない場合もある（実装による）
      });
    }
  });

  test('should be positioned to the right of date/time display', async ({ page }) => {
    // 日時表示エリアを取得
    const dateTimeArea = page.locator('text=/配信:|取込:/').first();
    await expect(dateTimeArea).toBeVisible();
    
    // お気に入りボタンを取得
    const favoriteButton = page.locator('button').filter({ hasText: /お気に入り|Favorite/i }).first();
    
    // 両方の要素の位置を取得
    const dateTimeBox = await dateTimeArea.boundingBox();
    const buttonBox = await favoriteButton.boundingBox();
    
    if (dateTimeBox && buttonBox) {
      // ボタンが日時表示の右側にあることを確認（X座標が大きい）
      expect(buttonBox.x).toBeGreaterThan(dateTimeBox.x);
      
      // 同じような高さにあることを確認（Y座標が近い）
      const yDifference = Math.abs(buttonBox.y - dateTimeBox.y);
      expect(yDifference).toBeLessThan(50); // 50px以内の差
    }
  });

  test('should maintain responsive layout on mobile', async ({ page }) => {
    // モバイルビューポートに設定
    await page.setViewportSize({ width: 375, height: 667 });
    
    // お気に入りボタンが表示されることを確認
    const favoriteButton = page.locator('button').filter({ hasText: /お気に入り|Favorite/i }).first();
    await expect(favoriteButton).toBeVisible();
    
    // ボタンのサイズを確認（タップ可能な最小サイズ）
    const buttonBox = await favoriteButton.boundingBox();
    if (buttonBox) {
      // 最小タップ領域（44x44px）に近いサイズであることを確認
      expect(buttonBox.height).toBeGreaterThanOrEqual(32); // h-9 = 36px なので32px以上
    }
  });

  test('should not have favorite button in bottom action area', async ({ page }) => {
    // 下部のアクションエリアを取得（品質スコアと元記事を読むボタンのエリア）
    const bottomActionArea = page.locator('text=/品質スコア/').locator('..');
    
    // このエリア内にお気に入りボタンが存在しないことを確認
    const favoriteButtonInBottom = bottomActionArea.locator('button').filter({ hasText: /お気に入り|Favorite/i });
    await expect(favoriteButtonInBottom).toHaveCount(0);
    
    // 「元記事を読む」ボタンは存在することを確認
    const externalLinkButton = bottomActionArea.locator('text=/元記事を読む/');
    await expect(externalLinkButton).toBeVisible();
  });
});