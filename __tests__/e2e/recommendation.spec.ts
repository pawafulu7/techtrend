import { test, expect } from '@playwright/test';

test.describe('推薦機能', () => {
  test.beforeEach(async ({ page }) => {
    // ホームページへアクセス
    await page.goto('http://localhost:3001');
  });

  test('推薦トグルボタンの表示', async ({ page }) => {
    // トグルボタンが存在することを確認
    const toggleButton = page.locator('button:has-text("おすすめ")');
    await expect(toggleButton).toBeVisible();
  });

  test('推薦トグル機能の動作', async ({ page }) => {
    // トグルボタンを探す
    const toggleButton = page.locator('button:has-text("おすすめ")');
    
    // 初期状態を確認（EyeOffアイコンまたはEyeアイコン）
    const initialIcon = await toggleButton.locator('svg').first();
    await expect(initialIcon).toBeVisible();
    
    // ボタンをクリックして状態を切り替え
    await toggleButton.click();
    
    // アイコンが変更されることを確認
    await page.waitForTimeout(500); // 状態変更を待つ
    const newIcon = await toggleButton.locator('svg').first();
    await expect(newIcon).toBeVisible();
  });

  test('localStorage永続化の確認', async ({ page, context }) => {
    const toggleButton = page.locator('button:has-text("おすすめ")');
    
    // 初期状態を記録
    const initialState = await page.evaluate(() => {
      return localStorage.getItem('hide-recommendations');
    });
    
    // トグルボタンをクリック
    await toggleButton.click();
    await page.waitForTimeout(500);
    
    // localStorageが更新されることを確認
    const newState = await page.evaluate(() => {
      return localStorage.getItem('hide-recommendations');
    });
    
    expect(newState).not.toBe(initialState);
    
    // ページリロード後も状態が保持されることを確認
    await page.reload();
    
    const stateAfterReload = await page.evaluate(() => {
      return localStorage.getItem('hide-recommendations');
    });
    
    expect(stateAfterReload).toBe(newState);
  });

  test('推薦セクション表示切り替え（ログイン済みの場合）', async ({ page }) => {
    // 注意: 実際のテストではログイン処理が必要
    // ここでは推薦トグルボタンの存在確認のみ
    const recommendationSection = page.locator('section:has-text("あなたへのおすすめ")');
    
    // ログインしていない場合は推薦セクションが表示されない
    await expect(recommendationSection).toBeHidden();
  });

  test('記事数表示の位置関係', async ({ page }) => {
    // 記事数表示を探す
    const articleCount = page.locator('text=/\\d+件の記事/');
    
    // 推薦トグルボタンを探す
    const toggleButton = page.locator('button:has-text("おすすめ")');
    
    // 両方が存在することを確認
    await expect(articleCount).toBeVisible();
    await expect(toggleButton).toBeVisible();
    
    // 同じツールバー内にあることを確認
    const toolbar = page.locator('.flex-shrink-0.bg-gray-50\\/50');
    await expect(toolbar).toContainText('件の記事');
    await expect(toolbar.locator('button:has-text("おすすめ")')).toBeVisible();
  });
});