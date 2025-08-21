import { test, expect } from '@playwright/test';

test.describe('検索クリア機能', () => {
  test('検索クリアボタンが正常に動作する', async ({ page }) => {
    // ホームページにアクセス
    await page.goto('/');
    
    // 検索ボックスを取得
    const searchBox = page.locator('[data-testid="search-box-input"]');
    
    // 検索ワードを入力
    await searchBox.fill('TypeScript');
    
    // デバウンス処理を待つ
    await page.waitForTimeout(500);
    
    // URLに検索パラメータが含まれることを確認
    await expect(page).toHaveURL(/search=TypeScript/);
    
    // 検索ボックスに値が入っていることを確認
    await expect(searchBox).toHaveValue('TypeScript');
    
    // クリアボタンを取得してクリック
    const clearButton = page.locator('button').filter({ has: page.locator('svg') }).last();
    await clearButton.click();
    
    // 検索ボックスが空になることを確認
    await expect(searchBox).toHaveValue('');
    
    // URLから検索パラメータが削除されることを確認
    await expect(page).not.toHaveURL(/search=/);
    
    // 少し待機（状態の安定化）
    await page.waitForTimeout(500);
    
    // ページリロード後も検索ワードが復活しないことを確認
    await page.reload();
    await expect(searchBox).toHaveValue('');
    await expect(page).not.toHaveURL(/search=/);
  });

  test('複数回のクリア操作が正常に動作する', async ({ page }) => {
    await page.goto('/');
    const searchBox = page.locator('[data-testid="search-box-input"]');
    const clearButton = page.locator('button').filter({ has: page.locator('svg') }).last();
    
    // 1回目の検索とクリア
    await searchBox.fill('React');
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/search=React/);
    await clearButton.click();
    await expect(searchBox).toHaveValue('');
    await expect(page).not.toHaveURL(/search=/);
    
    // 2回目の検索とクリア
    await searchBox.fill('Vue');
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/search=Vue/);
    await clearButton.click();
    await expect(searchBox).toHaveValue('');
    await expect(page).not.toHaveURL(/search=/);
  });

  test('ブラウザナビゲーションで検索状態が保持される', async ({ page }) => {
    await page.goto('/');
    const searchBox = page.locator('[data-testid="search-box-input"]');
    
    // 検索を実行
    await searchBox.fill('JavaScript');
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/search=JavaScript/);
    
    // クリアボタンをクリック
    const clearButton = page.locator('button').filter({ has: page.locator('svg') }).last();
    await clearButton.click();
    await expect(searchBox).toHaveValue('');
    
    // ブラウザの戻るボタンで検索状態に戻る
    await page.goBack();
    await expect(searchBox).toHaveValue('JavaScript');
    await expect(page).toHaveURL(/search=JavaScript/);
    
    // ブラウザの進むボタンでクリア状態に戻る
    await page.goForward();
    await expect(searchBox).toHaveValue('');
    await expect(page).not.toHaveURL(/search=/);
  });
});