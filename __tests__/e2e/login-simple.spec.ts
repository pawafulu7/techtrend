import { test, expect } from '@playwright/test';

test.describe('Simple Login Test', () => {
  test('Should be able to login with test user', async ({ page }) => {
    // Go to login page
    await page.goto('/auth/login');
    
    // Wait for the form to be visible
    await page.waitForSelector('input[id="email"]');
    
    // Fill in login form
    await page.fill('input[id="email"]', 'test@example.com');
    await page.fill('input[id="password"]', 'TestPassword123');
    
    // Click login button
    await page.click('button[type="submit"]:has-text("ログイン")');
    
    // Wait for navigation (should redirect after successful login)
    await page.waitForNavigation({ timeout: 30000 });
    
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