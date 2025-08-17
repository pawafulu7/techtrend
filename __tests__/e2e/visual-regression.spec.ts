import { test, expect } from '@playwright/test';

test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    // アニメーションを無効化
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `
    });
  });

  test('ホームページ - ライトモード', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // 記事カードが表示されるまで待機
    await page.waitForSelector('[data-testid="article-card"]', { timeout: 10000 });
    
    // スクリーンショットを撮影し、ベースラインと比較
    await expect(page).toHaveScreenshot('home-light.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });

  test('ホームページ - ダークモード', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // 記事カードが表示されるまで待機
    await page.waitForSelector('[data-testid="article-card"]', { timeout: 10000 });
    
    // ダークモードに切り替え
    // まずライトモードボタンを探し、存在する場合はダークモードに切り替える
    const themeToggle = page.locator('[data-testid*="theme-toggle"]').first();
    
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      // テーマ切り替えアニメーション待機
      await page.waitForTimeout(500);
    }
    
    // スクリーンショットを撮影
    await expect(page).toHaveScreenshot('home-dark.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });

  test('ホームページ - モバイルビュー', async ({ page }) => {
    // iPhone 12のビューポートサイズを設定
    await page.setViewportSize({ width: 390, height: 844 });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // 記事カードが表示されるまで待機
    await page.waitForSelector('[data-testid="article-card"]', { timeout: 10000 });
    
    // モバイルビューのスクリーンショット
    await expect(page).toHaveScreenshot('home-mobile.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });

  test('統計ダッシュボード - ライトモード', async ({ page }) => {
    await page.goto('/stats');
    await page.waitForLoadState('networkidle');
    
    // グラフ要素が表示されるまで待機（Rechartsのコンテナ）
    await page.waitForSelector('.recharts-wrapper', { timeout: 10000 });
    
    // グラフのレンダリング完了を待つ
    await page.waitForTimeout(1000);
    
    await expect(page).toHaveScreenshot('stats-light.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });

  test('記事詳細ページ - サンプル', async ({ page }) => {
    // まずホームページに移動
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // 最初の記事カードをクリック
    const firstArticle = page.locator('[data-testid="article-card"]').first();
    
    if (await firstArticle.isVisible()) {
      await firstArticle.click();
      await page.waitForLoadState('networkidle');
      
      // 記事詳細の要素が表示されるまで待機
      await page.waitForSelector('article', { timeout: 10000 });
      
      await expect(page).toHaveScreenshot('article-detail.png', {
        fullPage: true,
        animations: 'disabled'
      });
    } else {
      // 記事がない場合はテストをスキップ
      test.skip();
    }
  });
});

test.describe('レスポンシブデザインのVRT', () => {
  const viewports = [
    { name: 'desktop', width: 1920, height: 1080 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 }
  ];

  for (const viewport of viewports) {
    test(`ホームページ - ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('[data-testid="article-card"]', { timeout: 10000 });
      
      await expect(page).toHaveScreenshot(`home-${viewport.name}.png`, {
        fullPage: true,
        animations: 'disabled'
      });
    });
  }
});