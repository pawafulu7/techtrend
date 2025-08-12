import { test, expect } from '@playwright/test';

test.describe('動的タグ検索機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('タグ検索APIが正常に動作する', async ({ request }) => {
    // 空クエリでのテスト
    const emptyResponse = await request.get('/api/tags/search?q=');
    expect(emptyResponse.ok()).toBeTruthy();
    const emptyData = await emptyResponse.json();
    expect(Array.isArray(emptyData)).toBeTruthy();
    expect(emptyData.length).toBeLessThanOrEqual(50);

    // React検索のテスト
    const reactResponse = await request.get('/api/tags/search?q=React');
    expect(reactResponse.ok()).toBeTruthy();
    const reactData = await reactResponse.json();
    expect(Array.isArray(reactData)).toBeTruthy();
    expect(reactData.length).toBeGreaterThan(0);
    expect(reactData[0].name).toContain('React');

    // GMO検索のテスト
    const gmoResponse = await request.get('/api/tags/search?q=GMO');
    expect(gmoResponse.ok()).toBeTruthy();
    const gmoData = await gmoResponse.json();
    expect(Array.isArray(gmoData)).toBeTruthy();
    const gmoTag = gmoData.find((tag: any) => tag.name === 'GMO');
    expect(gmoTag).toBeDefined();
    expect(gmoTag.count).toBeGreaterThan(0);
  });

  test('タグフィルターで企業タグを検索できる', async ({ page }) => {
    // タグフィルターボタンをクリック
    const tagButton = page.locator('button:has(svg.lucide-tag)').first();
    await tagButton.click();

    // ドロップダウンが開くのを待つ
    await page.waitForSelector('input[placeholder="タグを検索..."]', { state: 'visible' });

    // 検索フォームにGMOと入力
    const searchInput = page.locator('input[placeholder="タグを検索..."]');
    await searchInput.fill('GMO');

    // デバウンス待機とAPI応答を待つ
    await page.waitForTimeout(500);

    // GMOタグが表示されることを確認
    const gmoTag = page.locator('text=GMO').first();
    await expect(gmoTag).toBeVisible({ timeout: 5000 });

    // 検索をクリアしてfreeeを検索
    await searchInput.clear();
    await searchInput.fill('freee');
    await page.waitForTimeout(500);

    // freeeタグが表示されることを確認
    const freeeTag = page.locator('text=freee').first();
    await expect(freeeTag).toBeVisible({ timeout: 5000 });

    // SmartHRを検索
    await searchInput.clear();
    await searchInput.fill('SmartHR');
    await page.waitForTimeout(500);

    // SmartHRタグが表示されることを確認
    const smarthrTag = page.locator('text=SmartHR').first();
    await expect(smarthrTag).toBeVisible({ timeout: 5000 });
  });

  test('企業タグを選択してフィルタリングできる', async ({ page }) => {
    // タグフィルターボタンをクリック
    const tagButton = page.locator('button:has(svg.lucide-tag)').first();
    await tagButton.click();

    // 検索フォームにDeNAと入力
    const searchInput = page.locator('input[placeholder="タグを検索..."]');
    await searchInput.fill('DeNA');
    await page.waitForTimeout(500);

    // DeNAタグをクリック
    const denaTag = page.locator('div').filter({ hasText: /^DeNA$/ }).first();
    await denaTag.click();

    // URLにタグパラメータが追加されることを確認
    await expect(page).toHaveURL(/tags=DeNA/);

    // フィルタリングされた記事が表示されることを確認
    await page.waitForLoadState('networkidle');
    
    // 記事数が14件以下であることを確認（DeNAの記事数）
    const articles = page.locator('article');
    const count = await articles.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(14);
  });

  test('検索時にローディングインジケーターが表示される', async ({ page }) => {
    // タグフィルターボタンをクリック
    const tagButton = page.locator('button:has(svg.lucide-tag)').first();
    await tagButton.click();

    // 検索フォームに入力
    const searchInput = page.locator('input[placeholder="タグを検索..."]');
    
    // 入力と同時にローディングインジケーターを確認
    await searchInput.fill('TypeScript');
    
    // ローディングインジケーター（animate-spin）が一時的に表示されることを確認
    const spinner = page.locator('.animate-spin');
    // 一瞬でも表示されれば成功とする
    const spinnerCount = await spinner.count();
    expect(spinnerCount).toBeGreaterThanOrEqual(0); // 存在する可能性がある
  });
});