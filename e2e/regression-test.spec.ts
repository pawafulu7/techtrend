import { test, expect } from '@playwright/test';

test.describe('回帰テスト - 既存機能の動作確認', () => {
  
  test.describe('記事一覧の基本機能', () => {
    test('記事カードが正しく表示される', async ({ page }) => {
      await page.goto('/');
      
      // 記事カードが表示されるまで待つ
      await page.waitForSelector('[data-testid="article-card"]');
      
      // 記事カードが1つ以上表示されている
      const articleCards = await page.locator('[data-testid="article-card"]').count();
      expect(articleCards).toBeGreaterThan(0);
      
      // 記事カードの必須要素が存在する
      const firstCard = page.locator('[data-testid="article-card"]').first();
      
      // タイトルが存在
      const title = await firstCard.locator('h3').textContent();
      expect(title).toBeTruthy();
      
      // ソース名が存在
      const sourceBadge = await firstCard.locator('.badge').first().textContent();
      expect(sourceBadge).toBeTruthy();
    });

    test('記事カードクリックで詳細ページに遷移する', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]');
      
      // 最初の記事のタイトルを取得
      const firstCardTitle = await page.locator('[data-testid="article-card"] h3').first().textContent();
      
      // 記事カードをクリック
      await page.locator('[data-testid="article-card"]').first().click();
      
      // 詳細ページに遷移したことを確認
      await page.waitForURL(/\/articles\/[^/]+/);
      
      // タイトルが表示されていることを確認
      const detailTitle = await page.locator('h1').textContent();
      expect(detailTitle).toBe(firstCardTitle);
    });
  });

  test.describe('フィルター機能', () => {
    test('ソースフィルターが正常に動作する', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]');
      
      // 初期の記事数を記録
      const initialCount = await page.locator('[data-testid="article-card"]').count();
      
      // Dev.toフィルターを適用
      const devtoFilter = page.locator('[data-testid="filter-source-Dev.to"]');
      if (await devtoFilter.count() > 0) {
        await devtoFilter.click();
        await page.waitForTimeout(500);
        
        // 記事数が変化したことを確認
        const filteredCount = await page.locator('[data-testid="article-card"]').count();
        expect(filteredCount).toBeLessThanOrEqual(initialCount);
        
        // すべての記事がDev.toソースであることを確認
        const sourceBadges = await page.locator('[data-testid="article-card"] .badge').allTextContents();
        sourceBadges.forEach(badge => {
          expect(badge).toContain('Dev.to');
        });
      }
    });

    test('タグフィルターが正常に動作する', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]');
      
      // タグフィルタードロップダウンを開く
      const tagDropdown = page.locator('[data-testid="tag-filter-dropdown"]');
      if (await tagDropdown.count() > 0) {
        await tagDropdown.click();
        
        // 最初のタグを選択
        const firstTag = page.locator('[data-testid^="tag-option-"]').first();
        const _tagName = await firstTag.textContent();
        await firstTag.click();
        
        // フィルターが適用されるまで待つ
        await page.waitForTimeout(500);
        
        // URLにタグパラメータが含まれることを確認
        const url = page.url();
        expect(url).toContain('tags=');
      }
    });

    test('検索機能が正常に動作する', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]');
      
      // 検索ボックスに入力
      const searchInput = page.locator('[data-testid="search-input"]');
      if (await searchInput.count() > 0) {
        await searchInput.fill('TypeScript');
        await searchInput.press('Enter');
        
        // 検索結果が表示されるまで待つ
        await page.waitForTimeout(1000);
        
        // URLに検索パラメータが含まれることを確認
        const url = page.url();
        expect(url).toContain('search=TypeScript');
      }
    });
  });

  test.describe('ソート機能', () => {
    test('公開順ソートが動作する', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]');
      
      // 公開順ボタンをクリック
      await page.getByRole('link', { name: '公開順' }).click();
      await page.waitForTimeout(500);
      
      // URLにソートパラメータが含まれることを確認
      const url = page.url();
      expect(url).toContain('sortBy=publishedAt');
    });

    test('品質順ソートが動作する', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]');
      
      // 品質ボタンをクリック
      await page.getByRole('link', { name: '品質' }).click();
      await page.waitForTimeout(500);
      
      // URLにソートパラメータが含まれることを確認
      const url = page.url();
      expect(url).toContain('sortBy=qualityScore');
    });

    test('人気順ソートが動作する', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]');
      
      // 人気ボタンをクリック
      await page.getByRole('link', { name: '人気' }).click();
      await page.waitForTimeout(500);
      
      // URLにソートパラメータが含まれることを確認
      const url = page.url();
      expect(url).toContain('sortBy=bookmarks');
    });
  });

  test.describe('表示モード切り替え', () => {
    test('グリッド/リスト表示の切り替えが動作する', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]');
      
      // 表示モード切り替えボタンを探す
      const viewToggle = page.locator('[data-testid="view-mode-toggle"]');
      if (await viewToggle.count() > 0) {
        // 初期の表示モードを確認
        const initialGridClass = await page.locator('.grid-cols-1').count();
        
        // 表示モードを切り替え
        await viewToggle.click();
        await page.waitForTimeout(500);
        
        // 表示が変わったことを確認
        const afterGridClass = await page.locator('.grid-cols-1').count();
        expect(afterGridClass).not.toBe(initialGridClass);
      }
    });
  });

  test.describe('モバイル対応', () => {
    test('モバイルビューでハンバーガーメニューが表示される', async ({ page }) => {
      // モバイルビューポートに設定
      await page.setViewportSize({ width: 375, height: 667 });
      
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]');
      
      // モバイルフィルターボタンが表示される
      const mobileFilterButton = page.locator('[data-testid="mobile-filter-button"]');
      expect(await mobileFilterButton.count()).toBeGreaterThan(0);
      
      // クリックでドロワーが開く
      await mobileFilterButton.click();
      await page.waitForTimeout(300);
      
      // フィルターオプションが表示される
      const filterDrawer = page.locator('[data-testid="mobile-filter-drawer"]');
      expect(await filterDrawer.count()).toBeGreaterThan(0);
    });
  });

  test.describe('パフォーマンス', () => {
    test('初期読み込みが3秒以内に完了する', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]');
      
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(3000);
    });

    test('記事カードのアニメーションがスムーズ', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]');
      
      // ホバーアニメーションの確認
      const firstCard = page.locator('[data-testid="article-card"]').first();
      
      // ホバー前のスタイルを取得
      const beforeHover = await firstCard.evaluate(el => {
        return window.getComputedStyle(el).transform;
      });
      
      // ホバー
      await firstCard.hover();
      await page.waitForTimeout(300);
      
      // ホバー後のスタイルを取得
      const afterHover = await firstCard.evaluate(el => {
        return window.getComputedStyle(el).transform;
      });
      
      // transformが変化していることを確認
      expect(beforeHover).not.toBe(afterHover);
    });
  });
});

test.describe('エラーハンドリング', () => {
  test('ネットワークエラー時に適切なメッセージが表示される', async ({ page }) => {
    // APIリクエストを失敗させる
    await page.route('**/api/articles*', route => {
      route.abort();
    });
    
    await page.goto('/');
    
    // エラーメッセージが表示される
    const errorMessage = await page.textContent('.text-red-500');
    expect(errorMessage).toContain('エラーが発生しました');
  });

  test('空の検索結果で適切なメッセージが表示される', async ({ page }) => {
    await page.goto('/?search=xyzxyzxyzxyzxyz');
    await page.waitForTimeout(1000);
    
    // 「記事が見つかりませんでした」メッセージが表示される
    const emptyMessage = await page.textContent('.text-gray-500');
    expect(emptyMessage).toContain('記事が見つかりませんでした');
  });
});