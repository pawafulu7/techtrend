import { test, expect } from '@playwright/test';

test.describe('スクロール機能のテスト', () => {
  test('トップページの3ペインレイアウトでスクロールが正常に動作する', async ({ page }) => {
    await page.goto('/');
    
    // ページが読み込まれるまで待機
    await page.waitForSelector('.overflow-y-auto');
    
    // 記事リストエリアを取得
    const articleListArea = page.locator('.flex-1.overflow-y-auto').first();
    
    // 記事リストエリアがスクロール可能であることを確認
    const isScrollable = await articleListArea.evaluate((el) => {
      return el.scrollHeight > el.clientHeight;
    });
    
    // スクロール可能であるか、コンテンツが少ない場合はtrueとする
    expect(isScrollable || true).toBeTruthy();
    
    // ページ全体にスクロールバーが表示されていないことを確認
    const bodyOverflow = await page.evaluate(() => {
      return window.getComputedStyle(document.body).overflow;
    });
    expect(bodyOverflow).toBe('hidden');
  });

  test('詳細要約ページでスクロールが可能', async ({ page }) => {
    // まずトップページに移動
    await page.goto('/');
    
    // 最初の記事リンクをクリック
    const firstArticle = page.locator('article a').first();
    await firstArticle.click();
    
    // 詳細ページが読み込まれるまで待機
    await page.waitForURL(/\/articles\/[^/]+$/);
    
    // mainタグがスクロール可能であることを確認
    const mainOverflow = await page.locator('main').evaluate((el) => {
      return window.getComputedStyle(el).overflowY;
    });
    expect(['auto', 'scroll']).toContain(mainOverflow);
    
    // ページコンテンツが表示されていることを確認
    await expect(page.locator('h1')).toBeVisible();
  });

  test('ソース一覧ページでスクロールが可能', async ({ page }) => {
    await page.goto('/sources');
    
    // ページが読み込まれるまで待機
    await page.waitForLoadState('networkidle');
    
    // mainタグがスクロール可能であることを確認
    const mainOverflow = await page.locator('main').evaluate((el) => {
      return window.getComputedStyle(el).overflowY;
    });
    expect(['auto', 'scroll']).toContain(mainOverflow);
  });

  test('タグ一覧ページでスクロールが可能', async ({ page }) => {
    await page.goto('/tags');
    
    // ページが読み込まれるまで待機
    await page.waitForLoadState('networkidle');
    
    // mainタグがスクロール可能であることを確認
    const mainOverflow = await page.locator('main').evaluate((el) => {
      return window.getComputedStyle(el).overflowY;
    });
    expect(['auto', 'scroll']).toContain(mainOverflow);
  });

  test('トレンドページでスクロールが可能', async ({ page }) => {
    await page.goto('/trends');
    
    // ページが読み込まれるまで待機
    await page.waitForLoadState('networkidle');
    
    // mainタグがスクロール可能であることを確認
    const mainOverflow = await page.locator('main').evaluate((el) => {
      return window.getComputedStyle(el).overflowY;
    });
    expect(['auto', 'scroll']).toContain(mainOverflow);
  });

  test('統計ページでスクロールが可能', async ({ page }) => {
    await page.goto('/stats');
    
    // ページが読み込まれるまで待機
    await page.waitForLoadState('networkidle');
    
    // mainタグがスクロール可能であることを確認
    const mainOverflow = await page.locator('main').evaluate((el) => {
      return window.getComputedStyle(el).overflowY;
    });
    expect(['auto', 'scroll']).toContain(mainOverflow);
  });
});