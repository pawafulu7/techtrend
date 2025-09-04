import { Page } from '@playwright/test';
import { execSync } from 'child_process';

/**
 * テストユーザーの認証情報
 * ブラウザごとに異なるユーザーを使用して競合を防ぐ
 */
export const TEST_USER = {
  email: 'test@example.com',
  password: 'TestPassword123',
  name: 'Test User',
  id: 'test-user-e2e',
  // bcrypt hash of 'TestPassword123' (10 rounds)
  passwordHash: '$2a$10$3RXlx0pvlAYMNSOgkQ6Mn.vqxhkbzOs4loaPljQcIWOzha7KAqq7O'
};

// ブラウザ別のテストユーザー
export const TEST_USERS = {
  chromium: {
    email: 'test-chromium@example.com',
    password: 'TestPassword123',
    name: 'Test User Chromium',
    id: 'test-user-chromium',
  },
  firefox: {
    email: 'test-firefox@example.com',
    password: 'TestPassword123',
    name: 'Test User Firefox',
    id: 'test-user-firefox',
  },
  webkit: {
    email: 'test-webkit@example.com',
    password: 'TestPassword123',
    name: 'Test User WebKit',
    id: 'test-user-webkit',
  }
};

// パスワード変更テスト専用ユーザー
export const TEST_USER_FOR_PASSWORD_CHANGE = {
  email: 'test-password-change@example.com',
  password: 'TestPassword123',
  name: 'Test User Password Change',
  id: 'test-user-password-change',
};

/**
 * テストユーザーを作成する
 * 注意: 開発データベースを使用（開発サーバーが開発DBに接続しているため）
 */
export async function createTestUser(): Promise<boolean> {
  try {
    // TypeScriptスクリプトを使用して正しいハッシュでユーザーを作成
    // DATABASE_URL環境変数を設定して実行
    const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres_dev_password@localhost:5432/techtrend_dev';
    execSync(
      'npx tsx scripts/create-test-user.ts',
      { 
        stdio: 'pipe',
        env: {
          ...process.env,
          DATABASE_URL: dbUrl
        }
      }
    );
    
    console.log('Test user created successfully');
    return true;
  } catch (error) {
    console.error('Failed to create test user:', error);
    return false;
  }
}

/**
 * テストユーザーを削除する
 */
export async function deleteTestUser(): Promise<boolean> {
  try {
    // パラメータ化されたスクリプトを使用してユーザーを削除
    const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres_dev_password@localhost:5432/techtrend_dev';
    execSync(
      'npx tsx scripts/delete-test-user.ts',
      { 
        stdio: 'pipe',
        env: {
          ...process.env,
          DATABASE_URL: dbUrl,
          TEST_USER_EMAIL: TEST_USER.email
        }
      }
    );
    
    console.log('Test user deleted successfully');
    return true;
  } catch (error) {
    console.error('Failed to delete test user:', error);
    return false;
  }
}

/**
 * 現在のブラウザ名を取得する
 * @param page Playwrightのページオブジェクト
 */
function getBrowserName(page: Page): 'chromium' | 'firefox' | 'webkit' {
  const browserName = page.context().browser()?.browserType().name();
  if (browserName === 'firefox') return 'firefox';
  if (browserName === 'webkit') return 'webkit';
  return 'chromium'; // デフォルト
}

/**
 * ログイン処理を実行する
 * @param page Playwrightのページオブジェクト
 * @param options オプション
 */
export async function loginTestUser(
  page: Page,
  options: {
    waitForRedirect?: boolean;
    redirectUrl?: string;
    debug?: boolean;
    timeout?: number;
  } = {}
): Promise<boolean> {
  const { waitForRedirect = true, redirectUrl = '/', debug = false, timeout = 30000 } = options;
  
  // ブラウザごとに異なるテストユーザーを使用
  const browserName = getBrowserName(page);
  const testUser = TEST_USERS[browserName] || TEST_USER;
  
  try {
    if (debug) console.log('🔍 Debug: Starting login process');
    
    // ログインページへ移動
    await page.goto('/auth/login', { waitUntil: 'networkidle' });
    if (debug) console.log('🔍 Debug: Navigated to login page');
    
    // フォームが表示されるまで待機
    await page.waitForSelector('input[id="email"]', { state: 'visible', timeout });
    if (debug) console.log('🔍 Debug: Login form is visible');
    
    // ログイン情報を入力（ブラウザ固有のユーザー）
    await page.fill('input[id="email"]', testUser.email);
    await page.fill('input[id="password"]', testUser.password);
    if (debug) console.log(`🔍 Debug: Filled login credentials for ${browserName} user: ${testUser.email}`);
    
    // ログインボタンをクリック
    const submitButton = page.locator('button[type="submit"]:has-text("ログイン")');
    await submitButton.click();
    if (debug) console.log('🔍 Debug: Clicked submit button');
    
    // リダイレクトを待つ場合
    if (waitForRedirect) {
      // フォーム送信処理を待つ（waitForTimeoutの代わりにより適切な待機方法を使用）
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500); // 最小限の待機のみ
      
      // エラーメッセージの確認
      const hasError = await page.locator('text=メールアドレスまたはパスワードが正しくありません').isVisible();
      if (hasError) {
        if (debug) console.log('🔍 Debug: Login error message detected');
        return false;
      }
      
      // URLが変更されるのを待つ（ポーリング方式）
      let currentUrl = page.url();
      let attempts = 0;
      const maxAttempts = 10;
      
      if (debug) console.log(`🔍 Debug: Initial URL: ${currentUrl}`);
      
      while (currentUrl.includes('/auth/login') && attempts < maxAttempts) {
        await page.waitForTimeout(1000);
        currentUrl = page.url();
        attempts++;
        if (debug) console.log(`🔍 Debug: Waiting for redirect... Attempt ${attempts}/${maxAttempts}, URL: ${currentUrl}`);
        
        // エラーメッセージを再チェック
        const errorVisible = await page.locator('text=メールアドレスまたはパスワードが正しくありません').isVisible();
        if (errorVisible) {
          if (debug) console.log('🔍 Debug: Error message appeared during wait');
          return false;
        }
      }
      
      // まだログインページにいる場合
      if (currentUrl.includes('/auth/login')) {
        if (debug) {
          console.log('🔍 Debug: Still on login page after waiting');
          // デバッグ情報を追加
          const pageTitle = await page.title();
          console.log(`🔍 Debug: Page title: ${pageTitle}`);
          const bodyText = await page.locator('body').innerText();
          console.log(`🔍 Debug: Page contains login form: ${bodyText.includes('ログイン')}`);
        }
        return false;
      }
      
      if (debug) console.log(`🔍 Debug: Successfully redirected to: ${currentUrl}`);
      
      // ネットワークが安定するまで待機
      await page.waitForLoadState('networkidle');
      if (debug) console.log('🔍 Debug: Network is idle');
    }
    
    // セッション確立のため少し待機
    await page.waitForTimeout(1000);
    if (debug) console.log('🔍 Debug: Login successful');
    
    return true;
  } catch (error) {
    console.error('Login failed:', error);
    if (debug) {
      const currentUrl = page.url();
      console.log(`🔍 Debug: Final URL: ${currentUrl}`);
      // スクリーンショットを撮る
      await page.screenshot({ path: 'login-error.png' });
      console.log('🔍 Debug: Screenshot saved as login-error.png');
    }
    return false;
  }
}

/**
 * プロフィールページのアカウントタブを開く
 * @param page Playwrightのページオブジェクト
 */
export async function openAccountTab(page: Page): Promise<boolean> {
  try {
    // プロフィールページへ移動
    await page.goto('/profile', { waitUntil: 'networkidle' });
    
    // ログインページにリダイレクトされた場合はエラー
    const currentUrl = page.url();
    if (currentUrl.includes('/auth/login')) {
      console.error('Redirected to login page. User is not authenticated.');
      return false;
    }
    
    // プロフィールページが表示されるまで待機
    // h1タグのテキストは「プロフィール設定」または「プロフィール」
    const pageTitle = page.locator('h1').first();
    await pageTitle.waitFor({ state: 'visible', timeout: 10000 });
    
    const titleText = await pageTitle.textContent();
    console.log('Profile page h1 text:', titleText);
    
    // アカウントタブをクリック
    // TabsTriggerコンポーネントは実際にはbuttonタグでレンダリングされる
    // data-state属性やrole属性も使用可能
    const accountTab = page.locator('button[role="tab"]').filter({ hasText: 'アカウント' });
    await accountTab.click();
    
    // タブ切り替えのアニメーション待機
    await page.waitForTimeout(500);
    
    // パスワード変更カードが表示されることを確認
    const passwordCard = page.locator('text=パスワード変更').first();
    await passwordCard.waitFor({ state: 'visible', timeout: 5000 });
    
    return true;
  } catch (error) {
    console.error('Failed to open account tab:', error);
    // 現在のURLとページコンテンツをデバッグ出力
    console.error('Current URL:', page.url());
    const h1Elements = await page.locator('h1').allTextContents();
    console.error('All h1 elements on page:', h1Elements);
    return false;
  }
}

/**
 * パスワード変更フォームに値を入力する
 * @param page Playwrightのページオブジェクト
 * @param passwords パスワード情報
 */
export async function fillPasswordChangeForm(
  page: Page,
  passwords: {
    current: string;
    new: string;
    confirm: string;
  }
): Promise<void> {
  await page.fill('input[name="currentPassword"]', passwords.current);
  await page.fill('input[name="newPassword"]', passwords.new);
  await page.fill('input[name="confirmPassword"]', passwords.confirm);
}

/**
 * エラーメッセージが表示されるまで待機する
 * @param page Playwrightのページオブジェクト
 * @param errorText エラーメッセージのテキスト（部分一致）
 */
export async function waitForErrorMessage(
  page: Page,
  errorText: string
): Promise<boolean> {
  try {
    const errorLocator = page.locator(`text=${errorText}`);
    await errorLocator.waitFor({ state: 'visible', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 成功メッセージが表示されるまで待機する
 * @param page Playwrightのページオブジェクト
 * @param successText 成功メッセージのテキスト（部分一致）
 */
export async function waitForSuccessMessage(
  page: Page,
  successText: string,
  timeout: number = 5000
): Promise<boolean> {
  try {
    const successLocator = page.locator(`text=${successText}`);
    await successLocator.waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}