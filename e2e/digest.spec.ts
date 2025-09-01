import { test, expect } from '@playwright/test';

test.describe('週刊ダイジェスト機能', () => {
  test('ダイジェストページが表示される', async ({ page }) => {
    await page.goto('/digest');
    
    // ページタイトルが表示される
    await expect(page.locator('h1')).toContainText('TechTrend 週刊ダイジェスト');
  });

  test('ナビゲーションからダイジェストページにアクセスできる', async ({ page }) => {
    await page.goto('/');
    
    // デスクトップナビゲーションでダイジェストリンクをクリック
    const digestLink = page.locator('[data-testid="nav-link-ダイジェスト"]');
    await expect(digestLink).toBeVisible();
    await digestLink.click();
    
    // ダイジェストページに遷移したことを確認
    await expect(page).toHaveURL('/digest');
    await expect(page.locator('h1')).toContainText('TechTrend 週刊ダイジェスト');
  });

  test('モバイルメニューからダイジェストページにアクセスできる', async ({ page }) => {
    // モバイルビューポートに設定
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // モバイルメニューを開く
    const menuToggle = page.locator('[data-testid="mobile-menu-toggle"]');
    await menuToggle.click();
    
    // ダイジェストリンクをクリック
    const digestLink = page.locator('[data-testid="mobile-nav-link-ダイジェスト"]');
    await expect(digestLink).toBeVisible();
    await digestLink.click();
    
    // ダイジェストページに遷移したことを確認
    await expect(page).toHaveURL('/digest');
    await expect(page.locator('h1')).toContainText('TechTrend 週刊ダイジェスト');
  });

  test('ダイジェストが存在しない場合の表示', async ({ page }) => {
    // APIモックを設定（404を返す）
    await page.route('/api/digest/**', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' }),
      });
    });

    await page.goto('/digest');
    
    // エラーメッセージが表示される
    await expect(page.locator('text=週刊ダイジェストがまだ生成されていません')).toBeVisible();
    
    // 生成ボタンが表示される
    const generateButton = page.locator('button:has-text("ダイジェストを生成")');
    await expect(generateButton).toBeVisible();
  });

  test('ダイジェストの生成ボタンが機能する', async ({ page }) => {
    // 最初は404を返し、生成後は成功レスポンスを返す
    let generateCalled = false;
    
    await page.route('/api/digest/**', async (route) => {
      if (route.request().url().includes('/generate') && route.request().method() === 'POST') {
        generateCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else if (generateCalled) {
        // 生成後のダイジェストデータ
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'test-digest',
            weekStartDate: '2025-08-25T00:00:00Z',
            weekEndDate: '2025-08-31T23:59:59Z',
            articleCount: 100,
            topArticles: [],
            categories: [],
            articles: [],
          }),
        });
      } else {
        await route.fulfill({ status: 404 });
      }
    });

    await page.goto('/digest');
    
    // 生成ボタンをクリック
    const generateButton = page.locator('button:has-text("ダイジェストを生成")');
    await generateButton.click();
    
    // ローディング状態を確認
    await expect(generateButton).toContainText('ダイジェスト生成中...');
    
    // 生成完了後、ダイジェストが表示される
    await expect(page.locator('text=記事総数: 100件')).toBeVisible({ timeout: 10000 });
  });

  test('人気記事TOP10セクションが表示される', async ({ page }) => {
    // モックデータを設定
    await page.route('/api/digest/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-digest',
          weekStartDate: '2025-08-25T00:00:00Z',
          weekEndDate: '2025-08-31T23:59:59Z',
          articleCount: 100,
          topArticles: [],
          categories: [],
          articles: [
            {
              id: '1',
              title: 'テスト記事1',
              url: 'https://example.com/1',
              source: { name: 'Dev.to' },
              tags: [{ name: 'React' }, { name: 'TypeScript' }],
            },
            {
              id: '2',
              title: 'テスト記事2',
              url: 'https://example.com/2',
              source: { name: 'Qiita' },
              tags: [{ name: 'Node.js' }],
            },
          ],
        }),
      });
    });

    await page.goto('/digest');
    
    // 人気記事セクションが表示される
    await expect(page.locator('text=今週の人気記事 TOP 10')).toBeVisible();
    
    // 記事が表示される
    await expect(page.locator('text=テスト記事1')).toBeVisible();
    await expect(page.locator('text=テスト記事2')).toBeVisible();
    
    // ソースバッジが表示される
    await expect(page.locator('text=Dev.to')).toBeVisible();
    await expect(page.locator('text=Qiita')).toBeVisible();
    
    // タグが表示される
    await expect(page.locator('text=React')).toBeVisible();
    await expect(page.locator('text=TypeScript')).toBeVisible();
    await expect(page.locator('text=Node.js')).toBeVisible();
  });

  test('カテゴリ別ハイライトセクションが表示される', async ({ page }) => {
    // モックデータを設定
    await page.route('/api/digest/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-digest',
          weekStartDate: '2025-08-25T00:00:00Z',
          weekEndDate: '2025-08-31T23:59:59Z',
          articleCount: 100,
          topArticles: [],
          categories: [
            {
              name: 'Frontend',
              count: 45,
              topArticle: {
                id: '1',
                title: 'React 19の新機能',
              },
            },
            {
              name: 'Backend',
              count: 30,
              topArticle: {
                id: '2',
                title: 'Node.js v22リリース',
              },
            },
          ],
          articles: [],
        }),
      });
    });

    await page.goto('/digest');
    
    // カテゴリセクションが表示される
    await expect(page.locator('text=カテゴリ別ハイライト')).toBeVisible();
    
    // カテゴリが表示される
    await expect(page.locator('text=Frontend')).toBeVisible();
    await expect(page.locator('text=45件')).toBeVisible();
    await expect(page.locator('text=React 19の新機能')).toBeVisible();
    
    await expect(page.locator('text=Backend')).toBeVisible();
    await expect(page.locator('text=30件')).toBeVisible();
    await expect(page.locator('text=Node.js v22リリース')).toBeVisible();
  });
});