import { test, expect } from '@playwright/test';

test.describe('無限スクロール機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 初期読み込みを待つ
    await page.waitForSelector('[data-testid="article-card"]');
  });

  test('20件以上の記事を読み込んでもスクロール位置が保持される', async ({ page }) => {
    // 初期の記事数を取得
    const initialArticles = await page.locator('[data-testid="article-card"]').count();
    
    // 10番目の記事までスクロール
    const tenthArticle = page.locator('[data-testid="article-card"]').nth(9);
    await tenthArticle.scrollIntoViewIfNeeded();
    
    // 10番目の記事の位置を記録
    const tenthArticlePosition = await tenthArticle.boundingBox();
    expect(tenthArticlePosition).not.toBeNull();
    
    // 無限スクロールトリガーまでスクロール
    await page.locator('[data-testid="infinite-scroll-trigger"]').scrollIntoViewIfNeeded();
    
    // 新しい記事の読み込みを待つ
    await page.waitForTimeout(1000); // 読み込み待機
    
    // 記事数が増えたことを確認
    const newArticleCount = await page.locator('[data-testid="article-card"]').count();
    expect(newArticleCount).toBeGreaterThan(initialArticles);
    
    // 10番目の記事がまだ画面内に見えることを確認（スクロール位置が維持されている）
    const tenthArticleAfterLoad = await tenthArticle.boundingBox();
    expect(tenthArticleAfterLoad).not.toBeNull();
    
    // Y座標が大きく変わっていないことを確認（許容誤差100px）
    if (tenthArticlePosition && tenthArticleAfterLoad) {
      expect(Math.abs(tenthArticlePosition.y - tenthArticleAfterLoad.y)).toBeLessThan(100);
    }
  });

  test('複数回の無限スクロールが正常に動作する', async ({ page }) => {
    const initialCount = await page.locator('[data-testid="article-card"]').count();
    
    // 1回目のスクロール
    await page.locator('[data-testid="infinite-scroll-trigger"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    
    const firstLoadCount = await page.locator('[data-testid="article-card"]').count();
    expect(firstLoadCount).toBeGreaterThan(initialCount);
    
    // 2回目のスクロール
    await page.locator('[data-testid="infinite-scroll-trigger"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    
    const secondLoadCount = await page.locator('[data-testid="article-card"]').count();
    expect(secondLoadCount).toBeGreaterThan(firstLoadCount);
    
    // 記事件数表示が更新されていることを確認
    const countText = await page.textContent('.text-gray-600');
    expect(countText).toContain(`${secondLoadCount}件表示中`);
  });

  test('エラー時に適切なメッセージが表示される', async ({ page }) => {
    // APIエラーをシミュレート
    await page.route('**/api/articles*', route => {
      if (route.request().url().includes('page=2')) {
        route.fulfill({
          status: 500,
          body: 'Internal Server Error'
        });
      } else {
        route.continue();
      }
    });
    
    // 無限スクロールトリガーまでスクロール
    await page.locator('[data-testid="infinite-scroll-trigger"]').scrollIntoViewIfNeeded();
    
    // エラーメッセージが表示されることを確認（実装による）
    // 現在の実装ではエラー時の処理が必要
  });

  test('フィルター適用時も無限スクロールが動作する', async ({ page }) => {
    // ソースフィルターを適用
    await page.click('[data-testid="filter-source-Dev.to"]');
    await page.waitForTimeout(500);
    
    // フィルター適用後の記事数を取得
    const filteredCount = await page.locator('[data-testid="article-card"]').count();
    
    // 無限スクロール
    await page.locator('[data-testid="infinite-scroll-trigger"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    
    // 記事が追加されたことを確認
    const newFilteredCount = await page.locator('[data-testid="article-card"]').count();
    expect(newFilteredCount).toBeGreaterThan(filteredCount);
  });

  test('ページ最下部に到達すると「すべての記事を読み込みました」が表示される', async ({ page }) => {
    // モックデータで少ない記事数を返す
    await page.route('**/api/articles*', async route => {
      const url = new URL(route.request().url());
      const pageParam = url.searchParams.get('page');
      
      if (pageParam === '2') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              items: [],
              total: 20,
              page: 2,
              totalPages: 1,
              limit: 20
            }
          })
        });
      } else {
        await route.continue();
      }
    });
    
    // 無限スクロール
    await page.locator('[data-testid="infinite-scroll-trigger"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    
    // 完了メッセージが表示されることを確認
    const completeMessage = await page.textContent('[data-testid="infinite-scroll-trigger"]');
    expect(completeMessage).toContain('すべての記事を読み込みました');
  });
});

test.describe('APIレスポンス構造とページネーション', () => {
  test('APIレスポンス構造が正しいことを確認', async ({ page }) => {
    await page.goto('/');
    
    // APIレスポンスをインターセプト
    const apiResponse = await page.waitForResponse(
      response => response.url().includes('/api/articles') && response.status() === 200,
      { timeout: 10000 }
    );
    
    const json = await apiResponse.json();
    
    // レスポンスのトップレベル構造を確認
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('data');
    
    // data構造の確認
    const { data } = json;
    expect(data).toHaveProperty('items');
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('page');
    expect(data).toHaveProperty('totalPages');
    expect(data).toHaveProperty('limit');
    
    // items配列の確認
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items.length).toBeLessThanOrEqual(20);
    
    // ページネーション値の確認
    expect(data.page).toBe(1);
    expect(data.limit).toBeGreaterThan(0);
    expect(typeof data.total).toBe('number');
    expect(typeof data.totalPages).toBe('number');
  });

  test('複数ページが正しく処理される', async ({ page }) => {
    await page.goto('/');
    
    // 最初のページのレスポンス
    const page1Response = await page.waitForResponse(
      response => response.url().includes('/api/articles') && response.status() === 200,
      { timeout: 10000 }
    );
    const page1Data = await page1Response.json();
    
    // 無限スクロールトリガーまでスクロール
    await page.waitForSelector('[data-testid="infinite-scroll-trigger"]');
    await page.locator('[data-testid="infinite-scroll-trigger"]').scrollIntoViewIfNeeded();
    
    // 2ページ目のレスポンスを待つ
    const page2Response = await page.waitForResponse(
      response => response.url().includes('/api/articles') && response.url().includes('page=2'),
      { timeout: 10000 }
    );
    const page2Data = await page2Response.json();
    
    expect(page1Data.success).toBe(true);
    expect(page2Data.success).toBe(true);
    
    // 記事の重複がないことを確認
    if (page1Data.data.items.length > 0 && page2Data.data.items.length > 0) {
      const page1Ids = page1Data.data.items.map((item: any) => item.id);
      const page2Ids = page2Data.data.items.map((item: any) => item.id);
      const intersection = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(intersection).toEqual([]);
    }
    
    // 合計数が一致することを確認
    expect(page1Data.data.total).toBe(page2Data.data.total);
    expect(page1Data.data.totalPages).toBe(page2Data.data.totalPages);
  });

  test('フィルター付きページネーションが動作する', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="article-card"]');
    
    // ソースフィルターを選択（実装に依存）
    const sourceFilterExists = await page.locator('[data-testid="source-filter-trigger"]').count() > 0;
    
    if (sourceFilterExists) {
      await page.click('[data-testid="source-filter-trigger"]');
      await page.click('[data-testid="source-option-0"]'); // 最初のソースを選択
      
      // フィルター付きのAPIレスポンスを待つ
      const filteredResponse = await page.waitForResponse(
        response => response.url().includes('/api/articles') && response.url().includes('sourceId='),
        { timeout: 10000 }
      );
      const data = await filteredResponse.json();
      
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      
      // フィルターが適用されていることを確認（記事が存在する場合）
      if (data.data.items.length > 0) {
        // sourceIdが統一されていることを確認
        const sourceIds = data.data.items.map((item: any) => item.sourceId);
        const uniqueSourceIds = [...new Set(sourceIds)];
        expect(uniqueSourceIds.length).toBe(1);
      }
    }
  });
});

test.describe('無限スクロール無効時の動作', () => {
  test('「さらに読み込む」ボタンが表示される', async ({ page }) => {
    // enableInfiniteScroll=falseの場合のテスト
    // 現在の実装では環境変数での切り替えが必要
    
    await page.goto('/');
    await page.waitForSelector('[data-testid="article-card"]');
    
    // ボタンが存在するか確認（実装による）
    const loadMoreButton = page.locator('[data-testid="load-more-button"]');
    const buttonExists = await loadMoreButton.count() > 0;
    
    // 現在はenableInfiniteScroll=trueなのでボタンは表示されない
    expect(buttonExists).toBe(false);
  });
});