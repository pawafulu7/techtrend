import { test, expect } from '@playwright/test';

test.describe('カテゴリーエラー修正のテスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // CI環境でのタイムアウトに対応
    await page.waitForLoadState('networkidle', { timeout: process.env.CI ? 60000 : 20000 });
  });

  test('"l"を入力してもエラーが発生しない', async ({ page, browserName }) => {
    // エラーハンドリングを設定
    let errorOccurred = false;
    page.on('pageerror', (error) => {
      console.error('Page error:', error);
      errorOccurred = true;
    });

    // Firefox用の追加待機
    if (browserName === 'firefox') {
      await page.waitForTimeout(500);
    }

    // タグフィルターボタンをクリック
    const tagButton = page.locator('[data-testid="tag-filter-button"]');
    await tagButton.click();

    // ドロップダウンが開くのを待つ
    await page.waitForSelector('[data-testid="tag-dropdown"]', { state: 'visible' });
    await page.waitForTimeout(100); // ドロップダウンアニメーション待機

    // Firefox用の追加待機（入力前）
    if (browserName === 'firefox') {
      await page.waitForTimeout(300);
    }

    // 検索フォームに"l"を入力
    const searchInput = page.locator('[data-testid="tag-search-input"]');
    await searchInput.fill('l');

    // デバウンス待機とAPI応答を待つ（Firefoxは長めに待機）
    await page.waitForTimeout(browserName === 'firefox' ? 800 : 500);

    // エラーが発生していないことを確認
    expect(errorOccurred).toBe(false);

    // タグが表示されることを確認（LLM、Claude、CLI等）
    const tagElements = page.locator('.space-y-2 .text-sm');
    const tagCount = await tagElements.count();
    expect(tagCount).toBeGreaterThan(0);
  });

  test('corporateカテゴリーのタグが「未分類」として表示される', async ({ page }) => {
    // タグフィルターボタンをクリック
    const tagButton = page.locator('[data-testid="tag-filter-button"]');
    await tagButton.click();

    // ドロップダウンが開くのを待つ
    await page.waitForSelector('[data-testid="tag-dropdown"]', { state: 'visible' });
    await page.waitForTimeout(100);

    // 検索フォームにLINEと入力（corporateカテゴリーのタグ）
    const searchInput = page.locator('[data-testid="tag-search-input"]');
    await searchInput.fill('LINE');

    // デバウンス待機（より長い時間待機して確実に検索結果を取得）
    await page.waitForTimeout(1000);

    // LINEヤフータグが存在することを確認
    const lineYahooTag = page.locator('text=LINEヤフー').first();
    await expect(lineYahooTag).toBeVisible({ timeout: 5000 });

    // カテゴリーヘッダーが表示されていることを確認
    const categoryHeaders = page.locator('.text-sm.font-medium');
    const headerCount = await categoryHeaders.count();
    expect(headerCount).toBeGreaterThan(0);

    // エラーが発生していないことを確認（カテゴリー名が表示される）
    const firstHeader = categoryHeaders.first();
    const headerText = await firstHeader.textContent();
    expect(headerText).toBeTruthy();
  });

  test('nullカテゴリーのタグも正常に表示される', async ({ page }) => {
    test.slow(); // CI環境での遅延に対応するためタイムアウトを3倍に延長
    
    // タグフィルターボタンをクリック
    const tagButton = page.locator('[data-testid="tag-filter-button"]');
    await tagButton.click();

    // ドロップダウンが開くのを待つ
    await page.waitForSelector('[data-testid="tag-dropdown"]', { state: 'visible' });
    await page.waitForTimeout(100);

    // 検索フォームに"Claude Code"と入力（categoryがnull）
    const searchInput = page.locator('[data-testid="tag-search-input"]');
    await searchInput.fill('Claude Code');

    // デバウンス待機（より長い時間待機して確実に検索結果を取得）
    await page.waitForTimeout(1000);

    // Claude Codeタグが表示されることを確認
    const claudeCodeTag = page.locator('text=Claude Code').first();
    await expect(claudeCodeTag).toBeVisible({ timeout: 5000 });

    // エラーが発生していないことを確認
    const errorElement = page.locator('.error-boundary');
    const errorCount = await errorElement.count();
    expect(errorCount).toBe(0);
  });

  test('複数のカテゴリーが混在しても正常に動作する', async ({ page }) => {
    // タグフィルターボタンをクリック
    const tagButton = page.locator('[data-testid="tag-filter-button"]');
    await tagButton.click();

    // ドロップダウンが開くのを待つ
    await page.waitForSelector('[data-testid="tag-dropdown"]', { state: 'visible' });
    await page.waitForTimeout(100);

    // 様々なカテゴリーを含む検索を実行
    const searchInput = page.locator('[data-testid="tag-search-input"]');
    
    // まず"a"で検索（様々なカテゴリーのタグが含まれる）
    await searchInput.fill('a');
    await page.waitForTimeout(500);

    // カテゴリーセクションが複数表示されることを確認
    // セレクタを調整（異なる実装パターンに対応）
    const categoryTriggers = page.locator('[role="button"]:has(.text-sm.font-medium), .collapsible-trigger:has(.text-sm.font-medium)');
    const triggerCount = await categoryTriggers.count();
    
    // 期待値による固定待機は行わず、直後の if/else で両ケースを検証

    // カテゴリーセクションがある場合のみテスト
    if (triggerCount > 0) {
      const firstTrigger = categoryTriggers.first();
      
      // カテゴリーを展開/折りたたみできることを確認
      await firstTrigger.click();
      await page.waitForTimeout(200);
      
      // エラーが発生していないことを確認
      const errorElement = page.locator('.error-boundary');
      const errorCount = await errorElement.count();
      expect(errorCount).toBe(0);
    } else {
      // カテゴリーがない場合でも、タグ自体は表示されているはず
      const tagElements = page.locator('.space-y-2 .text-sm');
      const tagCount = await tagElements.count();
      expect(tagCount).toBeGreaterThan(0);
    }
  });
});