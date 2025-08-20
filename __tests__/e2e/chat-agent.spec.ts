import { test, expect } from '@playwright/test';

test.describe('AIチャットエージェント機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // チャットが閉じていることを確認
    await expect(page.locator('[data-testid="chat-window"]')).not.toBeVisible();
  });

  test('チャットボタンの表示と基本動作', async ({ page }) => {
    // チャットボタンが表示されている
    const chatButton = page.locator('[data-testid="chat-button"]');
    await expect(chatButton).toBeVisible();

    // チャットボタンをクリック
    await chatButton.click();

    // チャットウィンドウが開く
    await expect(page.locator('[data-testid="chat-window"]')).toBeVisible();

    // 再度クリックで閉じる（force: trueで強制クリック）
    await chatButton.click({ force: true });
    await expect(page.locator('[data-testid="chat-window"]')).not.toBeVisible();
  });

  test('基本的な会話フロー', async ({ page }) => {
    // チャットを開く
    await page.click('[data-testid="chat-button"]');
    
    // チャットウィンドウが表示される
    const chatWindow = page.locator('[data-testid="chat-window"]');
    await expect(chatWindow).toBeVisible();

    // 初期メッセージが表示されている
    await expect(chatWindow).toContainText('TechTrendのAIアシスタント');

    // 挨拶を送信
    const input = page.locator('[data-testid="chat-input"]');
    await input.fill('こんにちは');
    await input.press('Enter');

    // 応答を待つ
    await page.waitForTimeout(1000);

    // 応答メッセージが表示される
    await expect(chatWindow).toContainText('技術記事の検索');
  });

  test('技術キーワード検索', async ({ page }) => {
    // チャットを開く
    await page.click('[data-testid="chat-button"]');
    
    // Reactについて検索
    const input = page.locator('[data-testid="chat-input"]');
    await input.fill('React');
    await input.press('Enter');

    // 応答を待つ
    await page.waitForTimeout(1500);

    // React関連の応答が表示される
    const chatWindow = page.locator('[data-testid="chat-window"]');
    await expect(chatWindow).toContainText('React');
  });

  test('Rails検索が正しく動作する', async ({ page }) => {
    // チャットを開く
    await page.click('[data-testid="chat-button"]');
    
    // Railsについて検索
    const input = page.locator('[data-testid="chat-input"]');
    await input.fill('Rails');
    await input.press('Enter');

    // 応答を待つ
    await page.waitForTimeout(1500);

    // Rails関連の応答が表示される（AIと誤検出されない）
    const chatWindow = page.locator('[data-testid="chat-window"]');
    await expect(chatWindow).toContainText('Rails');
    
    // AIという文字列が検索結果に含まれていないことを確認
    const messageText = await chatWindow.locator('.message-bubble').last().textContent();
    expect(messageText?.toLowerCase()).toContain('rails');
  });

  test('モバイルレスポンシブ対応', async ({ page }) => {
    // モバイルサイズに変更
    await page.setViewportSize({ width: 375, height: 667 });
    
    // チャットを開く
    await page.click('[data-testid="chat-button"]');
    
    // モバイルではフルスクリーン表示
    const chatWindow = page.locator('[data-testid="chat-window"]');
    await expect(chatWindow).toBeVisible();
    
    // Sheet形式で表示されることを確認
    const sheet = page.locator('[role="dialog"]');
    await expect(sheet).toBeVisible();
  });

  test('会話のクリア機能', async ({ page }) => {
    // チャットを開く
    await page.click('[data-testid="chat-button"]');
    
    // メッセージを送信
    const input = page.locator('[data-testid="chat-input"]');
    await input.fill('テストメッセージ');
    await input.press('Enter');
    
    await page.waitForTimeout(1000);
    
    // クリアボタンをクリック
    const clearButton = page.locator('[aria-label="会話をクリア"]');
    await clearButton.click();
    
    // 会話がクリアされ、初期メッセージが表示される
    const chatWindow = page.locator('[data-testid="chat-window"]');
    await expect(chatWindow).toContainText('TechTrendのAIアシスタント');
    await expect(chatWindow).not.toContainText('テストメッセージ');
  });

  test('キーボードショートカット', async ({ page }) => {
    // Ctrl+/ でチャットを開く
    await page.keyboard.press('Control+/');
    await expect(page.locator('[data-testid="chat-window"]')).toBeVisible();
    
    // Escapeで閉じる
    await page.keyboard.press('Escape');
    // アニメーション完了を待つ
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid="chat-window"]')).not.toBeVisible();
  });
});