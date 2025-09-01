import { test, expect } from '@playwright/test';
import { setupTestUser, cleanupTestUser } from './setup-test-user';

// シリアル実行を強制（並列実行を無効化）
test.describe.serial('Password Change Feature (Simple)', () => {
  // テストスイート開始前にテストユーザーを作成
  test.beforeAll(async () => {
    await setupTestUser();
  });
  
  // テストスイート終了後にクリーンアップ
  test.afterAll(async () => {
    await cleanupTestUser();
  });

  // 共通のログイン処理を関数化
  async function loginTestUser(page: any) {
    // ログインページへ移動
    await page.goto('/auth/login', { waitUntil: 'networkidle' });
    
    // フォームが表示されるまで待機
    await page.waitForSelector('input[id="email"]', { state: 'visible' });
    
    // ログイン情報を入力
    await page.fill('input[id="email"]', 'test@example.com');
    await page.fill('input[id="password"]', 'TestPassword123');
    
    // ログインボタンをクリック
    const loginButton = page.locator('button[type="submit"]').filter({ hasText: 'ログイン' });
    await loginButton.click();
    
    // ログイン後のリダイレクトを待つ（最大60秒）
    try {
      await page.waitForURL('/', { timeout: 60000 });
    } catch {
      // リダイレクトが失敗した場合、URLを確認
      const currentUrl = page.url();
      console.log('Current URL after login attempt:', currentUrl);
      
      // もしまだログインページにいる場合は、エラーメッセージを確認
      if (currentUrl.includes('/auth/login')) {
        const errorMessage = await page.locator('.text-destructive').textContent();
        console.log('Login error message:', errorMessage);
      }
    }
    
    // セッション確立のため少し待機
    await page.waitForTimeout(3000);
  }

  test('1. Should be able to login and access profile page', async ({ page }) => {
    await loginTestUser(page);
    
    // プロフィールページへ移動
    await page.goto('/profile', { waitUntil: 'networkidle' });
    
    // プロフィールページが表示されることを確認
    const pageTitle = page.locator('h1').filter({ hasText: 'プロフィール' });
    await expect(pageTitle).toBeVisible({ timeout: 10000 });
  });

  test('2. Should display password change form', async ({ page }) => {
    await loginTestUser(page);
    
    // プロフィールページへ移動
    await page.goto('/profile', { waitUntil: 'networkidle' });
    
    // アカウントタブをクリック
    const accountTab = page.locator('button').filter({ hasText: 'アカウント' });
    await accountTab.click();
    
    // タブ切り替えのアニメーション待機
    await page.waitForTimeout(1000);
    
    // パスワード変更フォームが表示されることを確認
    const passwordChangeTitle = page.getByText('パスワード変更').first();
    await expect(passwordChangeTitle).toBeVisible();
  });

  test('3. Should require authentication to access profile', async ({ page }) => {
    // 未認証状態でプロフィールページにアクセス
    await page.goto('/profile');
    
    // ログインページにリダイレクトされることを確認
    await expect(page).toHaveURL(/.*\/auth\/login/);
  });
});