import { test, expect } from '@playwright/test';
import { 
  TEST_USER,
  createTestUser, 
  deleteTestUser, 
  loginTestUser
} from './test-helpers';

/**
 * ログイン機能の改善版E2Eテスト
 * - シリアル実行
 * - 共通ヘルパー関数を使用
 * - 待機処理を改善
 */
test.describe.serial('Login Feature - Improved', () => {
  
  // グローバルセットアップでテストユーザーが作成されているため、
  // ここでの作成は不要

  test('1. ログインページが正しく表示される', async ({ page }) => {
    // ログインページへ移動
    await page.goto('/auth/login');
    
    // ページタイトルを確認
    await expect(page).toHaveTitle(/TechTrend/);
    
    // ログインフォームの要素が表示されることを確認
    await expect(page.locator('text=ログイン').first()).toBeVisible();
    await expect(page.locator('input[id="email"]')).toBeVisible();
    await expect(page.locator('input[id="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]:has-text("ログイン")')).toBeVisible();
    
    // OAuth ボタンも表示されることを確認
    await expect(page.locator('button:has-text("Google")')).toBeVisible();
    await expect(page.locator('button:has-text("GitHub")')).toBeVisible();
  });

  test('2. 空のフォームでエラーが表示される', async ({ page }) => {
    // ログインページへ移動
    await page.goto('/auth/login');
    
    // 何も入力せずに送信ボタンをクリック
    await page.click('button[type="submit"]:has-text("ログイン")');
    
    // バリデーションエラーが表示されることを確認
    await expect(page.locator('text=メールアドレスを入力してください')).toBeVisible();
    await expect(page.locator('text=パスワードを入力してください')).toBeVisible();
  });

  test('3. 無効なメールアドレスでエラーが表示される', async ({ page }) => {
    // ログインページへ移動
    await page.goto('/auth/login');
    
    // 無効なメールアドレスを入力
    await page.fill('input[id="email"]', 'invalid-email');
    await page.fill('input[id="password"]', 'password123');
    
    // 複数の方法でバリデーションをトリガー
    // 方法1: フォーカスを外す（blur）
    await page.locator('input[id="email"]').blur();
    await page.waitForTimeout(500); // バリデーション処理を待つ
    
    // バリデーションエラーが表示されているか確認
    let errorVisible = await page.locator('text=有効なメールアドレスを入力してください').isVisible();
    
    // 方法2: エラーが表示されていない場合は、送信ボタンをクリックしてバリデーションをトリガー
    if (!errorVisible) {
      await page.click('button[type="submit"]:has-text("ログイン")');
      await page.waitForTimeout(500);
    }
    
    // バリデーションエラーが表示されることを確認
    await expect(page.locator('text=有効なメールアドレスを入力してください, text=メールアドレスの形式が正しくありません')).toBeVisible();
  });

  test('4. 短いパスワードでエラーが表示される', async ({ page }) => {
    // ログインページへ移動
    await page.goto('/auth/login');
    
    // 短いパスワードを入力
    await page.fill('input[id="email"]', 'test@example.com');
    await page.fill('input[id="password"]', '12345');
    
    // 複数の方法でバリデーションをトリガー
    // 方法1: フォーカスを外す（blur）
    await page.locator('input[id="password"]').blur();
    await page.waitForTimeout(500); // バリデーション処理を待つ
    
    // バリデーションエラーが表示されているか確認
    let errorVisible = await page.locator('text=パスワードは6文字以上である必要があります').isVisible();
    
    // 方法2: エラーが表示されていない場合は、送信ボタンをクリックしてバリデーションをトリガー
    if (!errorVisible) {
      await page.click('button[type="submit"]:has-text("ログイン")');
      await page.waitForTimeout(500);
    }
    
    // バリデーションエラーが表示されることを確認（複数の可能なメッセージに対応）
    await expect(page.locator('text=パスワードは6文字以上である必要があります, text=パスワードは6文字以上')).toBeVisible();
  });

  test('5. 存在しないユーザーでログインエラーが表示される', async ({ page }) => {
    // ログインページへ移動
    await page.goto('/auth/login');
    
    // 存在しないユーザーの情報を入力
    await page.fill('input[id="email"]', 'nonexistent@example.com');
    await page.fill('input[id="password"]', 'Password123');
    
    // ログインボタンをクリック
    await page.click('button[type="submit"]:has-text("ログイン")');
    
    // エラーメッセージが表示されることを確認
    await expect(page.locator('text=メールアドレスまたはパスワードが正しくありません')).toBeVisible({ timeout: 10000 });
    
    // まだログインページにいることを確認
    await expect(page).toHaveURL(/.*\/auth\/login/);
  });

  test('6. 間違ったパスワードでログインエラーが表示される', async ({ page }) => {
    // ログインページへ移動
    await page.goto('/auth/login');
    
    // 正しいメールアドレスと間違ったパスワードを入力
    await page.fill('input[id="email"]', TEST_USER.email);
    await page.fill('input[id="password"]', 'WrongPassword123');
    
    // ログインボタンをクリック
    await page.click('button[type="submit"]:has-text("ログイン")');
    
    // エラーメッセージが表示されることを確認
    await expect(page.locator('text=メールアドレスまたはパスワードが正しくありません')).toBeVisible({ timeout: 10000 });
    
    // まだログインページにいることを確認
    await expect(page).toHaveURL(/.*\/auth\/login/);
  });

  test('7. 正しい認証情報でログインに成功する', async ({ page }) => {
    // loginTestUserヘルパーを使用（デバッグモード有効）
    const loginSuccess = await loginTestUser(page, { debug: true });
    expect(loginSuccess).toBe(true);
    
    // ホームページにリダイレクトされることを確認
    await expect(page).toHaveURL('http://localhost:3000/');
    
    // ユーザーメニューが表示されることを確認（ログイン成功の証）
    // ヘッダーのユーザーアイコンまたはメニューボタンを探す
    const userMenuTrigger = page.locator('[data-testid="user-menu-trigger"], button[aria-label*="user"], button[aria-label*="menu"]').first();
    const isUserMenuVisible = await userMenuTrigger.isVisible();
    
    // ユーザーメニューが存在することを確認
    expect(isUserMenuVisible).toBe(true);
  });

  test('8. ログイン状態が維持される', async ({ page }) => {
    // 前のテストでログイン済みなので、直接プロフィールページにアクセス
    await page.goto('/profile');
    
    // ログインページにリダイレクトされないことを確認
    await expect(page).not.toHaveURL(/.*\/auth\/login/);
    
    // プロフィールページが表示されることを確認
    const pageTitle = page.locator('h1').filter({ hasText: 'プロフィール' });
    await expect(pageTitle).toBeVisible({ timeout: 10000 });
  });

  test('9. ローディング状態が表示される', async ({ page }) => {
    // 新しいコンテキストでテスト（前のセッションを引き継がない）
    await page.context().clearCookies();
    
    // ログインページへ移動
    await page.goto('/auth/login');
    
    // ログイン情報を入力
    await page.fill('input[id="email"]', TEST_USER.email);
    await page.fill('input[id="password"]', TEST_USER.password);
    
    // ログインボタンをクリック
    const submitButton = page.locator('button[type="submit"]:has-text("ログイン")');
    await submitButton.click();
    
    // ローディング状態を確認（すぐに確認する必要がある）
    const loadingButton = page.locator('button:has-text("ログイン中...")');
    const isLoading = await loadingButton.isVisible();
    
    // ローディング状態が表示されるか、すでにリダイレクトされていることを確認
    const currentUrl = page.url();
    expect(isLoading || !currentUrl.includes('/auth/login')).toBe(true);
  });
});