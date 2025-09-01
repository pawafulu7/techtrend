import { test, expect } from '@playwright/test';
import { setupTestUser, cleanupTestUser } from './setup-test-user';

test.describe('Password Change Feature', () => {
  // テストスイート開始前にテストユーザーを作成
  test.beforeAll(async () => {
    await setupTestUser();
  });
  
  // テストスイート終了後にクリーンアップ
  test.afterAll(async () => {
    await cleanupTestUser();
  });
  
  test.beforeEach(async ({ page }) => {
    // ログインページへ移動
    await page.goto('/auth/login');
  });

  test('should display password change form in profile page', async ({ page }) => {
    // テストユーザーでログイン
    await page.fill('input[id="email"]', 'test@example.com');
    await page.fill('input[id="password"]', 'TestPassword123');
    await page.click('button[type="submit"]:has-text("ログイン")');
    
    // ログイン成功を待つ（ホームページへのリダイレクトを待つ）
    await page.waitForURL('/', { timeout: 30000 });
    
    // 少し待機してセッションが確立されるのを待つ
    await page.waitForTimeout(2000);
    
    // プロフィールページへ移動
    await page.goto('/profile', { waitUntil: 'networkidle' });
    
    // プロフィールページの要素を確認（より柔軟なセレクタ）
    const pageTitle = page.locator('h1').filter({ hasText: 'プロフィール' });
    await expect(pageTitle).toBeVisible({ timeout: 30000 });
    
    // アカウントタブをクリック（より柔軟なセレクタを使用）
    const accountTab = page.locator('button').filter({ hasText: 'アカウント' });
    await accountTab.click();
    
    // パスワード変更セクションが表示されるのを待つ
    await page.waitForTimeout(1000); // タブ切り替えのアニメーション待機
    
    // パスワード変更フォームの要素が表示されることを確認
    const passwordChangeTitle = page.getByText('パスワード変更').first();
    await expect(passwordChangeTitle).toBeVisible();
    
    // フォーム要素の確認（より柔軟なセレクタ）
    await expect(page.locator('label').filter({ hasText: /現在.*パスワード/ })).toBeVisible();
    await expect(page.locator('label').filter({ hasText: /新しい.*パスワード/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'パスワードを変更' })).toBeVisible();
  });

  test('should show validation errors for invalid password', async ({ page }) => {
    // テストユーザーでログイン
    await page.fill('input[id="email"]', 'test@example.com');
    await page.fill('input[id="password"]', 'TestPassword123');
    await page.click('button[type="submit"]:has-text("ログイン")');
    
    // ログイン成功を待つ
    await page.waitForURL('/', { timeout: 30000 });
    
    // 少し待機してセッションが確立されるのを待つ
    await page.waitForTimeout(2000);
    
    // プロフィールページへ移動
    await page.goto('/profile', { waitUntil: 'networkidle' });
    
    // プロフィールページの要素を確認
    const pageTitle = page.locator('h1').filter({ hasText: 'プロフィール' });
    await expect(pageTitle).toBeVisible({ timeout: 30000 });
    
    // アカウントタブをクリック
    const accountTab = page.locator('button').filter({ hasText: 'アカウント' });
    await accountTab.click();
    
    // 短いパスワードを入力
    await page.fill('input[name="currentPassword"]', 'TestPassword123');
    await page.fill('input[name="newPassword"]', 'short');
    await page.fill('input[name="confirmPassword"]', 'short');
    
    // 送信ボタンをクリック
    await page.click('button:has-text("パスワードを変更")');
    
    // バリデーションエラーが表示されることを確認
    await expect(page.locator('text=/パスワードは8文字以上/')).toBeVisible();
  });

  test('should show error when passwords do not match', async ({ page }) => {
    // テストユーザーでログイン
    await page.fill('input[id="email"]', 'test@example.com');
    await page.fill('input[id="password"]', 'TestPassword123');
    await page.click('button[type="submit"]:has-text("ログイン")');
    
    // ログイン成功を待つ
    await page.waitForURL('/', { timeout: 30000 });
    
    // 少し待機してセッションが確立されるのを待つ
    await page.waitForTimeout(2000);
    
    // プロフィールページへ移動
    await page.goto('/profile', { waitUntil: 'networkidle' });
    
    // プロフィールページの要素を確認
    const pageTitle = page.locator('h1').filter({ hasText: 'プロフィール' });
    await expect(pageTitle).toBeVisible({ timeout: 30000 });
    
    // アカウントタブをクリック
    const accountTab = page.locator('button').filter({ hasText: 'アカウント' });
    await accountTab.click();
    
    // 一致しないパスワードを入力
    await page.fill('input[name="currentPassword"]', 'TestPassword123');
    await page.fill('input[name="newPassword"]', 'NewPassword123');
    await page.fill('input[name="confirmPassword"]', 'DifferentPassword123');
    
    // 送信ボタンをクリック
    await page.click('button:has-text("パスワードを変更")');
    
    // エラーメッセージが表示されることを確認
    await expect(page.locator('text=パスワードが一致しません')).toBeVisible();
  });

  test('should show error for incorrect current password', async ({ page }) => {
    // テストユーザーでログイン
    await page.fill('input[id="email"]', 'test@example.com');
    await page.fill('input[id="password"]', 'TestPassword123');
    await page.click('button[type="submit"]:has-text("ログイン")');
    
    // ログイン成功を待つ
    await page.waitForURL('/', { timeout: 30000 });
    
    // 少し待機してセッションが確立されるのを待つ
    await page.waitForTimeout(2000);
    
    // プロフィールページへ移動
    await page.goto('/profile', { waitUntil: 'networkidle' });
    
    // プロフィールページの要素を確認
    const pageTitle = page.locator('h1').filter({ hasText: 'プロフィール' });
    await expect(pageTitle).toBeVisible({ timeout: 30000 });
    
    // アカウントタブをクリック
    const accountTab = page.locator('button').filter({ hasText: 'アカウント' });
    await accountTab.click();
    
    // 間違った現在のパスワードを入力
    await page.fill('input[name="currentPassword"]', 'WrongPassword123');
    await page.fill('input[name="newPassword"]', 'NewPassword123');
    await page.fill('input[name="confirmPassword"]', 'NewPassword123');
    
    // 送信ボタンをクリック
    await page.click('button:has-text("パスワードを変更")');
    
    // エラーメッセージが表示されることを確認
    await expect(page.locator('text=/Current password is incorrect|現在のパスワードが正しくありません/')).toBeVisible();
  });

  test('should successfully change password with valid inputs', async ({ page }) => {
    // テストユーザーでログイン
    await page.fill('input[id="email"]', 'test@example.com');
    await page.fill('input[id="password"]', 'TestPassword123');
    await page.click('button[type="submit"]:has-text("ログイン")');
    
    // ログイン成功を待つ
    await page.waitForURL('/', { timeout: 30000 });
    
    // 少し待機してセッションが確立されるのを待つ
    await page.waitForTimeout(2000);
    
    // プロフィールページへ移動
    await page.goto('/profile', { waitUntil: 'networkidle' });
    
    // プロフィールページの要素を確認
    const pageTitle = page.locator('h1').filter({ hasText: 'プロフィール' });
    await expect(pageTitle).toBeVisible({ timeout: 30000 });
    
    // アカウントタブをクリック
    const accountTab = page.locator('button').filter({ hasText: 'アカウント' });
    await accountTab.click();
    
    // 正しいパスワード情報を入力
    await page.fill('input[name="currentPassword"]', 'TestPassword123');
    await page.fill('input[name="newPassword"]', 'NewSecurePass456');
    await page.fill('input[name="confirmPassword"]', 'NewSecurePass456');
    
    // 送信ボタンをクリック
    await page.click('button:has-text("パスワードを変更")');
    
    // 成功メッセージが表示されることを確認
    await expect(page.locator('text=/パスワードを変更しました|Password changed successfully/')).toBeVisible();
    
    // フォームがクリアされることを確認
    await expect(page.locator('input[name="currentPassword"]')).toHaveValue('');
    await expect(page.locator('input[name="newPassword"]')).toHaveValue('');
    await expect(page.locator('input[name="confirmPassword"]')).toHaveValue('');
  });

  test('should show loading state during password change', async ({ page }) => {
    // テストユーザーでログイン
    await page.fill('input[id="email"]', 'test@example.com');
    await page.fill('input[id="password"]', 'TestPassword123');
    await page.click('button[type="submit"]:has-text("ログイン")');
    
    // ログイン成功を待つ
    await page.waitForURL('/', { timeout: 30000 });
    
    // 少し待機してセッションが確立されるのを待つ
    await page.waitForTimeout(2000);
    
    // プロフィールページへ移動
    await page.goto('/profile', { waitUntil: 'networkidle' });
    
    // プロフィールページの要素を確認
    const pageTitle = page.locator('h1').filter({ hasText: 'プロフィール' });
    await expect(pageTitle).toBeVisible({ timeout: 30000 });
    
    // アカウントタブをクリック
    const accountTab = page.locator('button').filter({ hasText: 'アカウント' });
    await accountTab.click();
    
    // パスワード情報を入力
    await page.fill('input[name="currentPassword"]', 'TestPassword123');
    await page.fill('input[name="newPassword"]', 'NewPassword123');
    await page.fill('input[name="confirmPassword"]', 'NewPassword123');
    
    // 送信ボタンをクリック
    const submitButton = page.locator('button:has-text("パスワードを変更")');
    await submitButton.click();
    
    // ローディング状態を確認
    await expect(page.locator('button:has-text("変更中...")')).toBeVisible();
    await expect(submitButton).toBeDisabled();
  });

  test('should require authentication to access profile page', async ({ page }) => {
    // 直接プロフィールページにアクセス（未認証）
    await page.goto('/profile');
    
    // ログインページにリダイレクトされることを確認
    await expect(page).toHaveURL(/.*\/auth\/login/);
  });

  test('should maintain form state on validation error', async ({ page }) => {
    // テストユーザーでログイン
    await page.fill('input[id="email"]', 'test@example.com');
    await page.fill('input[id="password"]', 'TestPassword123');
    await page.click('button[type="submit"]:has-text("ログイン")');
    
    // ログイン成功を待つ
    await page.waitForURL('/', { timeout: 30000 });
    
    // 少し待機してセッションが確立されるのを待つ
    await page.waitForTimeout(2000);
    
    // プロフィールページへ移動
    await page.goto('/profile', { waitUntil: 'networkidle' });
    
    // プロフィールページの要素を確認
    const pageTitle = page.locator('h1').filter({ hasText: 'プロフィール' });
    await expect(pageTitle).toBeVisible({ timeout: 30000 });
    
    // アカウントタブをクリック
    const accountTab = page.locator('button').filter({ hasText: 'アカウント' });
    await accountTab.click();
    
    // フォームに入力（新しいパスワードが短い）
    await page.fill('input[name="currentPassword"]', 'TestPassword123');
    await page.fill('input[name="newPassword"]', 'short');
    await page.fill('input[name="confirmPassword"]', 'short');
    
    // 送信ボタンをクリック
    await page.click('button:has-text("パスワードを変更")');
    
    // エラー後も入力値が保持されていることを確認
    await expect(page.locator('input[name="currentPassword"]')).toHaveValue('TestPassword123');
    await expect(page.locator('input[name="newPassword"]')).toHaveValue('short');
    await expect(page.locator('input[name="confirmPassword"]')).toHaveValue('short');
  });
});