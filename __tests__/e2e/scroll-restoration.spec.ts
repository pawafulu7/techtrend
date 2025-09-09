import { test, expect } from '@playwright/test';

test.describe('スクロール位置復元機能', () => {
  test('記事詳細から戻った時にスクロール位置が復元される', async ({ page }) => {
    // 1. ホームページにアクセス
    await page.goto('/');
    await page.waitForSelector('[data-testid="article-card"]', { timeout: 30000 });
    
    // CI環境での初期ロード待機
    if (process.env.CI) {
      await page.waitForTimeout(2000);
    }
    
    // 2. 記事を20件以上読み込むためにスクロール
    // 実際のスクロール対象要素を特定（main要素またはhome-client内のdiv）
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        // 複数のセレクターを試す
        const selectors = [
          '#main-scroll-container', // home-client-infinite.tsx
          'main.overflow-y-auto', // layout.tsx
          '.flex-1.overflow-y-auto', // home-client.tsx
          '.overflow-y-auto'
        ];
        
        let container = null;
        for (const selector of selectors) {
          container = document.querySelector(selector);
          if (container && container.scrollHeight > container.clientHeight) {
            break;
          }
        }
        
        if (container) {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        } else {
          // フォールバック: window全体をスクロール
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }
      });
      
      // CI環境では待機時間を延長
      await page.waitForTimeout(process.env.CI ? 3000 : 1500);
    }
    
    // 3. スクロール位置を記録
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
      
      // フォールバック: windowのスクロール位置
      return window.pageYOffset || document.documentElement.scrollTop;
    });
    
    // スクロール位置が0より大きいことを確認
    expect(scrollPositionBefore).toBeGreaterThan(0);
    
    // 4. 10番目の記事をクリック
    const articles = await page.locator('[data-testid="article-card"]').all();
    expect(articles.length).toBeGreaterThanOrEqual(10);
    
    const tenthArticle = articles[9];
    const articleId = await tenthArticle.getAttribute('data-article-id');
    await tenthArticle.click();
    
    // 5. 記事詳細ページに遷移したことを確認
    await page.waitForURL((url) => new URL(url).pathname === `/articles/${articleId}`, { 
      timeout: process.env.CI ? 30000 : 10000 
    });
    
    // CI環境での記事詳細ページロード待機
    if (process.env.CI) {
      await page.waitForTimeout(2000);
    }
    
    // 6. ブラウザの戻るボタンを使用（記事一覧に戻るリンクが存在しないため）
    await page.goBack();
    
    // 7. ホームページに戻ったことを確認
    await page.waitForFunction(
      () => new URL(window.location.href).pathname === '/',
      undefined,
      { timeout: process.env.CI ? 30000 : 10000 }
    );
    
    // 8. 記事が読み込まれるまで待機
    await page.waitForSelector('[data-testid="article-card"]', { timeout: 30000 });
    
    // CI環境でのスクロール復元待機時間を延長
    await page.waitForTimeout(process.env.CI ? 2000 : 500);
    
    // 9. スクロール位置が復元されたか確認
    const scrollPositionAfter = await page.evaluate(() => {
      const selectors = [
        '#main-scroll-container',
        'main.overflow-y-auto',
        '.flex-1.overflow-y-auto',
        '.overflow-y-auto'
      ];
      
      for (const selector of selectors) {
        const container = document.querySelector(selector);
        if (container && container.scrollTop >= 0) {
          return container.scrollTop;
        }
      }
      
      return window.pageYOffset || document.documentElement.scrollTop;
    });
    
    // CI環境では許容誤差を大きくする
    const tolerance = process.env.CI ? 500 : 300;
    
    // ブラウザのデフォルト動作により、位置が復元される可能性がある
    // ただし、完全に同じ位置に戻るとは限らない
    // スクロール位置が復元されていることを確認
    expect(scrollPositionAfter).toBeGreaterThan(0);
    expect(scrollPositionAfter).toBeGreaterThanOrEqual(Math.max(1, scrollPositionBefore - tolerance));
  });
  
  test('ページリロード時はスクロール位置が復元されない', async ({ page }) => {
    // 1. ホームページにアクセス
    await page.goto('/');
    await page.waitForSelector('[data-testid="article-card"]');
    
    // 2. スクロールして位置を変更
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
          container.scrollTo({ top: 500, behavior: 'instant' });
          scrolled = true;
          break;
        }
      }
      
      if (!scrolled) {
        window.scrollTo({ top: 500, behavior: 'instant' });
      }
    });
    
    await page.waitForTimeout(100);
    
    // 3. ページをリロード
    await page.reload();
    await page.waitForSelector('[data-testid="article-card"]');
    
    // 4. スクロール位置が0に戻っていることを確認
    const scrollPosition = await page.evaluate(() => {
      const selectors = [
        '#main-scroll-container',
        'main.overflow-y-auto',
        '.flex-1.overflow-y-auto',
        '.overflow-y-auto'
      ];
      
      for (const selector of selectors) {
        const container = document.querySelector(selector);
        if (container && container.scrollHeight > container.clientHeight) {
          return container.scrollTop;
        }
      }
      
      return window.pageYOffset || document.documentElement.scrollTop;
    });
    
    expect(scrollPosition).toBe(0);
  });
  
  test('ユーザーがスクロール操作した場合は自動復元がキャンセルされる', async ({ page }) => {
    // 1. ホームページにアクセスしてスクロール
    await page.goto('/');
    await page.waitForSelector('[data-testid="article-card"]');
    
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
          container.scrollTo({ top: 1000, behavior: 'instant' });
          scrolled = true;
          break;
        }
      }
      
      if (!scrolled) {
        window.scrollTo({ top: 1000, behavior: 'instant' });
      }
    });
    
    // 2. 記事詳細に遷移
    const firstArticle = page.locator('[data-testid="article-card"]').first();
    const articleId = await firstArticle.getAttribute('data-article-id');
    await firstArticle.click();
    
    await page.waitForURL(`**/articles/${articleId}**`);
    
    // 3. ブラウザの戻るボタンを使用
    await page.goBack();
    
    await page.waitForURL('**/');
    
    // 4. すぐにユーザー操作をシミュレート（マウスホイール）
    await page.mouse.wheel(0, -100);
    
    await page.waitForTimeout(1000);
    
    // 5. スクロール位置が元の位置（1000）に戻っていないことを確認
    const scrollPosition = await page.evaluate(() => {
      const container = document.querySelector('.overflow-y-auto');
      return container ? container.scrollTop : 0;
    });
    
    // ユーザー操作によってキャンセルされたため、元の位置には戻らない
    expect(scrollPosition).toBeLessThan(900);
  });
});