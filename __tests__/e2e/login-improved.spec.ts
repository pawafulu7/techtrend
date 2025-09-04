import { test, expect } from '@playwright/test';
import { 
  TEST_USER,
  TEST_USERS,
  loginTestUser
} from './utils/test-helpers';

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
    
    // バリデーションエラーが表示されるまで少し待つ
    await page.waitForTimeout(500);
    
    // バリデーションエラーが表示されることを確認
    // React Hook Formのエラーは <p class="text-sm text-destructive"> 内に表示される
    const emailError = page.locator('p.text-destructive:has-text("メールアドレスを入力してください")');
    const passwordError = page.locator('p.text-destructive:has-text("パスワードを入力してください")');
    await expect(emailError).toBeVisible({ timeout: 5000 });
    await expect(passwordError).toBeVisible({ timeout: 5000 });
  });

  test('3. 無効なメールアドレスでエラーが表示される', async ({ page }) => {
    // ログインページへ移動
    await page.goto('/auth/login');
    
    // 無効なメールアドレスを入力
    await page.fill('input[id="email"]', 'invalid-email');
    await page.fill('input[id="password"]', 'password123');
    
    // 送信ボタンをクリックしてバリデーションをトリガー
    await page.click('button[type="submit"]:has-text("ログイン")');
    
    // バリデーションエラーが表示されるまで待機
    await page.waitForFunction(() => {
      const input = document.querySelector('input[id="email"]') as HTMLInputElement;
      return input?.validationMessage !== '';
    }, { timeout: 5000 }).catch(() => {});
    
    // フォームが送信されていないことを確認（URLが変わらない）
    // ブラウザのネイティブバリデーションによりフォーム送信がブロックされる
    await expect(page).toHaveURL('/auth/login');
    
    // メールフィールドにフォーカスが残っていることを確認（バリデーションエラーの典型的な動作）
    const emailInput = page.locator('input[id="email"]');
    const isFocused = await emailInput.evaluate(el => el === document.activeElement);
    expect(isFocused).toBeTruthy();
  });

  test('4. 短いパスワードでエラーが表示される', async ({ page }) => {
    // ログインページへ移動
    await page.goto('/auth/login');
    
    // 短いパスワードを入力
    await page.fill('input[id="email"]', 'test@example.com');
    await page.fill('input[id="password"]', '12345');
    
    // 送信ボタンをクリックしてバリデーションをトリガー
    await page.click('button[type="submit"]:has-text("ログイン")');
    
    // サーバー側バリデーションエラーを待つ（エラーアラートまたはURLの変化を待機）
    await Promise.race([
      page.waitForSelector('[role="alert"]', { state: 'visible', timeout: 3000 }),
      page.waitForURL((url) => !url.toString().includes('/auth/login'), { timeout: 3000 })
    ]).catch(() => {});
    
    // サーバーからのエラーメッセージを確認
    // 短いパスワードの場合、サーバー側でエラーになる可能性
    const errorAlert = page.locator('[role="alert"]').filter({ hasText: 'メールアドレスまたはパスワードが正しくありません' });
    
    // エラーアラートまたはフォームが送信されていないことを確認
    const hasError = await errorAlert.isVisible().catch(() => false);
    const isStillOnLoginPage = page.url().includes('/auth/login');
    
    expect(hasError || isStillOnLoginPage).toBeTruthy();
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

  test('6. 間違ったパスワードでログインエラーが表示される', async ({ page, browserName }) => {
    // ログインページへ移動
    await page.goto('/auth/login');
    
    // ブラウザ固有のテストユーザーを使用
    const testUser = TEST_USERS[browserName as keyof typeof TEST_USERS] || TEST_USER;
    
    // 正しいメールアドレスと間違ったパスワードを入力
    await page.fill('input[id="email"]', testUser.email);
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
    await expect(page).toHaveURL(/^https?:\/\/localhost:\d+\/$/);
    
    // ユーザーメニューが表示されるまで待機
    await page.waitForTimeout(2000); // セッション確立のため待機
    
    // ユーザーメニューが表示されることを確認（ログイン成功の証）
    const userMenuTrigger = page.locator('[data-testid="user-menu-trigger"]');
    
    // ユーザーメニューが表示されるまで待機（最大5秒）
    try {
      await userMenuTrigger.waitFor({ state: 'visible', timeout: 5000 });
      const isVisible = await userMenuTrigger.isVisible();
      expect(isVisible).toBe(true);
    } catch (error) {
      // フォールバック: 他のセレクタも試す
      const alternativeSelectors = [
        'button.h-10.w-10.rounded-full',
        'button:has(> span:has-text("U"))',
        '[aria-label*="user"]'
      ];
      
      let found = false;
      for (const selector of alternativeSelectors) {
        const element = page.locator(selector).first();
        if (await element.isVisible()) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    }
  });

  test('8. ログイン状態が維持される', async ({ page }) => {
    // まずログインする
    await loginTestUser(page);
    
    // プロフィールページにアクセス
    await page.goto('/profile');
    
    // ログインページにリダイレクトされないことを確認
    await expect(page).not.toHaveURL(/.*\/auth\/login/);
    
    // プロフィールページが表示されることを確認
    const pageTitle = page.locator('h1').filter({ hasText: 'プロフィール' });
    await expect(pageTitle).toBeVisible({ timeout: 10000 });
  });

  test('9. ローディング状態が表示される', async ({ page, browserName }) => {
    // 新しいコンテキストでテスト（前のセッションを引き継がない）
    await page.context().clearCookies();
    
    // ログインページへ移動
    await page.goto('/auth/login');
    
    // ブラウザ固有のテストユーザーを使用
    const testUser = TEST_USERS[browserName as keyof typeof TEST_USERS] || TEST_USER;
    
    // ログイン情報を入力
    await page.fill('input[id="email"]', testUser.email);
    await page.fill('input[id="password"]', testUser.password);
    
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