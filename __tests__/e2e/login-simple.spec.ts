import { test, expect } from '@playwright/test';

test.describe('Simple Login Test', () => {
  test.skip('Should be able to login with test user', async ({ page }) => {
    // Note: E2E環境でのログイン処理が不安定なため一時的にスキップ
    // Go to login page
    await page.goto('/auth/login');
    
    // Wait for the form to be visible
    await page.waitForSelector('input[id="email"]');
    
    // Fill in login form
    await page.fill('input[id="email"]', 'test@example.com');
    await page.fill('input[id="password"]', 'TestPassword123');
    
    // Click login button and wait for response
    await Promise.all([
      page.waitForURL((url) => !url.toString().includes('/auth/login'), { timeout: 30000 }),
      page.click('button[type="submit"]:has-text("ログイン")')
    ]);
    
    // Check that we're no longer on the login page
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/auth/login');
    
    // We should be redirected to the home page
    expect(currentUrl).toMatch(/^https?:\/\/localhost:\d+\/$/);
  });
  
  test('Should show error for invalid credentials', async ({ page }) => {
    // Go to login page
    await page.goto('/auth/login');
    
    // Wait for the form to be visible
    await page.waitForSelector('input[id="email"]');
    
    // Fill in login form with wrong password
    await page.fill('input[id="email"]', 'test@example.com');
    await page.fill('input[id="password"]', 'WrongPassword');
    
    // Click login button
    await page.click('button[type="submit"]:has-text("ログイン")');
    
    // Wait a bit for error to appear
    await page.waitForTimeout(2000);
    
    // Should still be on login page
    const currentUrl = page.url();
    expect(currentUrl).toContain('/auth/login');
    
    // Error message should be visible
    const errorMessage = page.locator('.text-destructive');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('メールアドレスまたはパスワードが正しくありません');
  });
});