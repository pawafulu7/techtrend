import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import bcrypt from 'bcryptjs';

// テスト用のパスワード
const TEST_PASSWORD = 'TestPassword123';

test.describe.serial('Password Change Feature (Debug)', () => {
  
  test.beforeAll(async () => {
    // 新しいパスワードハッシュを生成
    const hash = await bcrypt.hash(TEST_PASSWORD, 10);
    console.log('Generated hash:', hash);
    
    // テストユーザーを作成（生成したハッシュを使用）
    const sql = `
      DELETE FROM "User" WHERE email = 'test@example.com';
      INSERT INTO "User" (id, email, name, password, "emailVerified", "createdAt", "updatedAt")
      VALUES (
        'test-user-' || gen_random_uuid(),
        'test@example.com',
        'Test User',
        '${hash}',
        NOW(),
        NOW(),
        NOW()
      );
    `;
    
    try {
      execSync(
        `echo "${sql}" | docker exec -i techtrend-postgres-test psql -U postgres -d techtrend_test`,
        { stdio: 'pipe' }
      );
      console.log('Test user created successfully');
      
      // 作成されたユーザーを確認
      const checkSql = `SELECT email, password FROM "User" WHERE email = 'test@example.com';`;
      const result = execSync(
        `echo "${checkSql}" | docker exec -i techtrend-postgres-test psql -U postgres -d techtrend_test -t`,
        { encoding: 'utf8' }
      );
      console.log('Created user:', result.trim());
      
      // ハッシュの検証
      const dbHash = result.trim().split('|')[1]?.trim();
      if (dbHash) {
        const isValid = await bcrypt.compare(TEST_PASSWORD, dbHash);
        console.log('Password verification in DB:', isValid ? 'SUCCESS' : 'FAILED');
      }
    } catch (error) {
      console.error('Failed to create test user:', error);
    }
  });
  
  test.afterAll(async () => {
    try {
      const sql = `DELETE FROM "User" WHERE email = 'test@example.com';`;
      execSync(
        `echo '${sql}' | docker exec -i techtrend-postgres-test psql -U postgres -d techtrend_test`,
        { stdio: 'pipe' }
      );
      console.log('Test user cleaned up successfully');
    } catch (error) {
      console.error('Failed to cleanup test user:', error);
    }
  });

  test('Debug: Check login page and attempt login', async ({ page }) => {
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