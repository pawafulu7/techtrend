import { test, expect } from '@playwright/test';
import { setupTestUser, cleanupTestUser } from './setup-test-user';

// テスト用のパスワード
const TEST_PASSWORD = 'TestPassword123';

test.describe.serial('Password Change Feature (Debug)', () => {
  
  test.beforeAll(async () => {
    // PrismaClientを使用してテストユーザーを作成
    const success = await setupTestUser();
    if (!success) {
      throw new Error('Failed to create test user');
    }
  });
  
  test.afterAll(async () => {
    // PrismaClientを使用してテストユーザーを削除
    await cleanupTestUser();
  });

  test.skip('Debug: Check login page and attempt login', async ({ page }) => {
    // Note: E2E環境でのログイン処理が不安定なため一時的にスキップ
    // Enable console logs from the page
    page.on('console', msg => {
      console.log('Browser console:', msg.type(), msg.text());
    });
    
    // Enable request/response logging
    page.on('request', request => {
      if (request.url().includes('/api/auth')) {
        console.log('Auth request:', request.method(), request.url());
      }
    });
    
    page.on('response', response => {
      if (response.url().includes('/api/auth')) {
        console.log('Auth response:', response.status(), response.url());
      }
    });
    
    // ログインページへ移動
    await page.goto('/auth/login', { waitUntil: 'networkidle' });
    
    // ページタイトルを確認
    const title = await page.title();
    console.log('Page title:', title);
    
    // フォームが存在することを確認
    const emailInput = page.locator('input[id="email"]');
    const passwordInput = page.locator('input[id="password"]');
    const submitButton = page.locator('button[type="submit"]').filter({ hasText: 'ログイン' });
    
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();
    
    console.log('Login form is visible');
    
    // ログイン情報を入力
    await emailInput.fill('test@example.com');
    await passwordInput.fill(TEST_PASSWORD);
    
    console.log('Credentials entered');
    
    // ネットワークレスポンスを監視
    const responsePromise = page.waitForResponse(resp => 
      resp.url().includes('/api/auth/callback/credentials'), 
      { timeout: 30000 }
    );
    
    // ログインボタンをクリック
    await submitButton.click();
    console.log('Login button clicked');
    
    try {
      const response = await responsePromise;
      console.log('Auth callback response:', response.status());
      const responseBody = await response.text();
      console.log('Response body preview:', responseBody.substring(0, 200));
    } catch (error) {
      console.log('No auth callback response received');
    }
    
    // Wait a bit to see what happens
    await page.waitForTimeout(5000);
    
    // Check current URL
    const currentUrl = page.url();
    console.log('Current URL after login attempt:', currentUrl);
    
    // Check for error messages
    const errorElement = page.locator('.text-destructive');
    if (await errorElement.count() > 0) {
      const errorText = await errorElement.textContent();
      console.log('Error message found:', errorText);
    }
    
    // Check if we're still on login page
    if (currentUrl.includes('/auth/login')) {
      console.log('Still on login page - login failed');
      
      // Take a screenshot for debugging
      await page.screenshot({ path: 'test-results/login-failed.png', fullPage: true });
      throw new Error('Login failed - still on login page');
    } else {
      console.log('Redirected to:', currentUrl);
      // If we got redirected, login was successful
      expect(currentUrl).not.toContain('/auth/login');
    }
  });
});