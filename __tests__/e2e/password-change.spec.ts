import { test, expect } from '@playwright/test';

test.describe('Password Change Feature', () => {
  test.beforeEach(async ({ page }) => {
    // ログインページへ移動
    await page.goto('/auth/login');
  });

  test('should display password change form in profile page', async ({ page }) => {
    // テストユーザーでログイン
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'TestPassword123');
    await page.click('button[type="submit"]');
    
    // ログイン後のリダイレクトを待つ
    await page.waitForURL('**/');
    
    // プロフィールページへ移動
    await page.goto('/profile');
    
    // ページの読み込みを待つ
    await page.waitForLoadState('networkidle');
    
    // タブリストが表示されるまで待つ
    await page.waitForSelector('[role="tablist"]');
    
    // アカウントタブをクリック
    await page.click('button:has-text("アカウント")');
    
    // パスワード変更フォームの要素が表示されることを確認
    await expect(page.locator('text=パスワードの変更')).toBeVisible();
    await expect(page.locator('label:has-text("現在のパスワード")')).toBeVisible();
    await expect(page.locator('label:has-text("新しいパスワード")')).toBeVisible();
    await expect(page.locator('label:has-text("新しいパスワード（確認）")')).toBeVisible();
    await expect(page.locator('button:has-text("パスワードを変更")')).toBeVisible();
  });

  test('should show validation errors for invalid password', async ({ page }) => {
    // テストユーザーでログイン
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'TestPassword123');
    await page.click('button[type="submit"]');
    
    // プロフィールページへ移動
    await page.waitForURL('**/');
    await page.goto('/profile');
    
    // ページの読み込みを待つ
    await page.waitForLoadState('networkidle');
    
    // タブリストが表示されるまで待つ
    await page.waitForSelector('[role="tablist"]');
    
    // アカウントタブをクリック  
    await page.click('button:has-text("アカウント")');
    
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
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'TestPassword123');
    await page.click('button[type="submit"]');
    
    // プロフィールページへ移動
    await page.waitForURL('**/');
    await page.goto('/profile');
    
    // ページの読み込みを待つ
    await page.waitForLoadState('networkidle');
    
    // タブリストが表示されるまで待つ
    await page.waitForSelector('[role="tablist"]');
    
    // アカウントタブをクリック  
    await page.click('button:has-text("アカウント")');
    
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
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'TestPassword123');
    await page.click('button[type="submit"]');
    
    // プロフィールページへ移動
    await page.waitForURL('**/');
    await page.goto('/profile');
    
    // ページの読み込みを待つ
    await page.waitForLoadState('networkidle');
    
    // タブリストが表示されるまで待つ
    await page.waitForSelector('[role="tablist"]');
    
    // アカウントタブをクリック  
    await page.click('button:has-text("アカウント")');
    
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
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'TestPassword123');
    await page.click('button[type="submit"]');
    
    // プロフィールページへ移動
    await page.waitForURL('**/');
    await page.goto('/profile');
    
    // ページの読み込みを待つ
    await page.waitForLoadState('networkidle');
    
    // タブリストが表示されるまで待つ
    await page.waitForSelector('[role="tablist"]');
    
    // アカウントタブをクリック  
    await page.click('button:has-text("アカウント")');
    
    // 正しいパスワード情報を入力
    await page.fill('input[name="currentPassword"]', 'TestPassword123');
    await page.fill('input[name="newPassword"]', 'NewSecurePass456');
    await page.fill('input[name="confirmPassword"]', 'NewSecurePass456');
    
    // 送信ボタンをクリック
    await page.click('button:has-text("パスワードを変更")');
    
    // 成功メッセージが表示されることを確認
    await expect(page.locator('text=/パスワードが正常に変更されました|Password changed successfully/')).toBeVisible();
    
    // フォームがクリアされることを確認
    await expect(page.locator('input[name="currentPassword"]')).toHaveValue('');
    await expect(page.locator('input[name="newPassword"]')).toHaveValue('');
    await expect(page.locator('input[name="confirmPassword"]')).toHaveValue('');
  });

  test('should show loading state during password change', async ({ page }) => {
    // テストユーザーでログイン
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'TestPassword123');
    await page.click('button[type="submit"]');
    
    // プロフィールページへ移動
    await page.waitForURL('**/');
    await page.goto('/profile');
    
    // ページの読み込みを待つ
    await page.waitForLoadState('networkidle');
    
    // タブリストが表示されるまで待つ
    await page.waitForSelector('[role="tablist"]');
    
    // アカウントタブをクリック  
    await page.click('button:has-text("アカウント")');
    
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
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'TestPassword123');
    await page.click('button[type="submit"]');
    
    // プロフィールページへ移動
    await page.waitForURL('**/');
    await page.goto('/profile');
    
    // ページの読み込みを待つ
    await page.waitForLoadState('networkidle');
    
    // タブリストが表示されるまで待つ
    await page.waitForSelector('[role="tablist"]');
    
    // アカウントタブをクリック  
    await page.click('button:has-text("アカウント")');
    
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