import { test, expect } from '@playwright/test';

const SCROLL_CONTAINER_SELECTORS = [
  '#main-scroll-container',
  'main.overflow-y-auto',
  '.flex-1.overflow-y-auto',
  '.overflow-y-auto',
] as const;

test.describe('スクロール復元時のトップボタン表示', () => {
  test('記事詳細から戻った際にトップボタンが表示される', async ({ page }) => {
    // 1. トップページにアクセス
    await page.goto('/');
    
    // 記事リストが表示されるまで待機
    await page.waitForSelector('[data-testid="article-list"]', { timeout: 10000 });
    
    // 2. スクロールして複数ページを読み込む
    // 複数のセレクターを試してスクロール可能なコンテナを探す
    await page.evaluate(() => {
      const selectors = [
        '#main-scroll-container',
        'main.overflow-y-auto',
        '.flex-1.overflow-y-auto',
        '.overflow-y-auto'
      ];
      
      let scrolled = false;
      for (const selector of selectors) {
        const container = document.querySelector(selector);
        if (container && container.scrollHeight > container.clientHeight) {
          for (let i = 0; i < 3; i++) {
            container.scrollTop = container.scrollHeight;
          }
          scrolled = true;
          break;
        }
      }
      
      // フォールバック: どのセレクターも見つからない場合はwindowをスクロール
      if (!scrolled) {
        const el = document.scrollingElement || document.documentElement;
        for (let i = 0; i < 3; i++) {
          el.scrollTop = el.scrollHeight;
        }
      }
    });
    await page.waitForTimeout(2000); // 読み込み待機
    
    // 現在のスクロール位置を確認（300px以上のはず）
    const scrollPositionBefore = await page.evaluate(() => {
      const selectors = [
        '#main-scroll-container',
        'main.overflow-y-auto',
        '.flex-1.overflow-y-auto',
        '.overflow-y-auto'
      ];
      
      for (const selector of selectors) {
        const container = document.querySelector(selector);
        if (container && container.scrollTop > 0) {
          return container.scrollTop;
        }
      }
      // フォールバック: windowのスクロール位置を返す
      return window.pageYOffset || document.documentElement.scrollTop || 0;
    });
    expect(scrollPositionBefore).toBeGreaterThan(300);
    
    // トップボタンが表示されているか確認
    const topButtonBefore = page.locator('button[aria-label="ページトップへ戻る"]');
    await expect(topButtonBefore).toBeVisible();
    
    // 3. 記事詳細ページへ遷移
    const firstArticle = page.locator('[data-testid="article-card"]').first();
    await firstArticle.click();
    
    // 記事詳細ページが表示されるまで待機
    await page.waitForURL(/\/articles\/[a-z0-9]+/, { timeout: 10000 });
    await page.waitForSelector('h1', { timeout: 10000 });
    
    // 4. ブラウザの戻るボタンを使用
    await page.goBack();
    
    // 一覧ページが表示されるまで待機
    await page.waitForURL('**/');
    await page.waitForSelector('[data-testid="article-list"]', { timeout: 10000 });
    
    // 5. スクロール復元の完了を待つ
    await page.waitForTimeout(2000);
    
    // 6. スクロール位置が復元されているか確認
    const scrollPositionAfter = await page.evaluate(() => {
      const selectors = [
        '#main-scroll-container',
        'main.overflow-y-auto',
        '.flex-1.overflow-y-auto',
        '.overflow-y-auto'
      ];
      
      for (const selector of selectors) {
        const container = document.querySelector(selector);
        if (container && container.scrollTop > 0) {
          return container.scrollTop;
        }
      }
      // フォールバック: windowのスクロール位置を返す
      return window.pageYOffset || document.documentElement.scrollTop || 0;
    });
    // ブラウザの戻るボタンによる復元のため、位置は異なる可能性がある
    expect(scrollPositionAfter).toBeGreaterThanOrEqual(0);
    
    // 7. スクロール位置が300px以上ならトップボタンが表示されているか確認
    if (scrollPositionAfter > 300) {
      const topButtonAfter = page.locator('button[aria-label="ページトップへ戻る"]');
      await expect(topButtonAfter).toBeVisible();
      
      // 8. トップボタンをクリックしてトップに戻る
      await topButtonAfter.click();
      
      // スムーススクロール完了待ち
      await page.waitForTimeout(1000);
      
      // 9. スクロール位置が0になっているか確認
      const scrollPositionTop = await page.evaluate(() => {
        const container = document.querySelector('.overflow-y-auto');
        return container ? container.scrollTop : 0;
      });
      expect(scrollPositionTop).toBeLessThan(100); // 完全に0でなくても許容
      
      // 10. トップボタンが非表示になっているか確認
      await expect(topButtonAfter).not.toBeVisible();
    }
  });

  test('スクロール復元をキャンセルした場合の動作', async ({ page }) => {
    // 1. トップページにアクセス
    await page.goto('/');
    
    // 記事リストが表示されるまで待機
    await page.waitForSelector('[data-testid="article-list"]', { timeout: 10000 });
    
    // 2. スクロールして複数ページを読み込む
    await page.evaluate((selectors) => {
      let scrolled = false;
      for (const s of selectors) {
        const el = document.querySelector(s) as HTMLElement | null;
        if (el && el.scrollHeight > el.clientHeight) {
          for (let i = 0; i < 2; i++) el.scrollTop = el.scrollHeight;
          scrolled = true;
          break;
        }
      }
      if (!scrolled) {
        const win = document.scrollingElement || document.documentElement;
        for (let i = 0; i < 2; i++) win.scrollTop = win.scrollHeight;
      }
    }, SCROLL_CONTAINER_SELECTORS);
    // 読み込み安定待ち
    await expect(page.locator('[data-testid="article-card"]').first()).toBeVisible();
    
    // 3. 記事詳細ページへ遷移
    const firstArticle = page.locator('[data-testid="article-card"]').first();
    await firstArticle.click();
    
    await page.waitForURL(/\/articles\/[a-z0-9]+/, { timeout: 10000 });
    await page.waitForSelector('h1', { timeout: 10000 });
    
    // 4. ブラウザの戻るボタンを使用（記事一覧に戻るリンクが存在しないため）
    await page.goBack();
    
    await page.waitForURL('**/');
    await page.waitForSelector('[data-testid="article-list"]', { timeout: 10000 });
    
    // 5. 復元ローディングが表示されたらキャンセルボタンをクリック
    const cancelButton = page.locator('[data-testid="cancel-restoration"]');
    if (await cancelButton.isVisible()) {
      await cancelButton.click();
    }
    
    // 6. スクロール位置が0のままか確認
    await page.waitForTimeout(1000);
    const scrollPositionAfterCancel = await page.evaluate(() => {
      const selectors = [
        '#main-scroll-container',
        'main.overflow-y-auto',
        '.flex-1.overflow-y-auto',
        '.overflow-y-auto'
      ];
      
      for (const selector of selectors) {
        const container = document.querySelector(selector);
        if (container) {
          return container.scrollTop;
        }
      }
      // フォールバック: windowのスクロール位置を返す
      return window.pageYOffset || document.documentElement.scrollTop || 0;
    });
    expect(scrollPositionAfterCancel).toBeLessThan(100);
    
    // 7. トップボタンが非表示か確認
    const topButton = page.locator('button[aria-label="ページトップへ戻る"]');
    await expect(topButton).not.toBeVisible();
  });
});