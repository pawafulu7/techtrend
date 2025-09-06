import { test, expect } from '@playwright/test';

test.describe('OAuth User Profile', () => {
  test.describe('OAuth認証ユーザーのプロフィール表示', () => {
    test('OAuth認証ユーザーにパスワード変更フォームが表示されない', async ({ page }) => {
      // OAuthユーザーのモックAPIレスポンスを設定
      await page.route('/api/user/profile', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'oauth-user-1',
            email: 'oauth@example.com',
            name: 'OAuth User',
            image: 'https://example.com/avatar.jpg',
            createdAt: '2024-01-01T00:00:00.000Z',
            hasPassword: false,
            providers: ['google'],
          }),
        });
      });

      // モック認証セッションを設定
      await page.route('/api/auth/session', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'oauth-user-1',
              email: 'oauth@example.com',
              name: 'OAuth User',
              image: 'https://example.com/avatar.jpg',
            },
            expires: '2024-12-31',
          }),
        });
      });

      // プロフィールページへ移動
      await page.goto('/profile');

      // プロフィールページが表示されるのを待つ
      await expect(page.locator('h1').filter({ hasText: 'プロフィール' })).toBeVisible();

      // アカウントタブをクリック
      await page.locator('button').filter({ hasText: 'アカウント' }).click();

      // パスワード変更フォームが表示されないことを確認
      await expect(page.locator('text=パスワード変更').first()).not.toBeVisible();

      // 代わりにOAuth認証の説明メッセージが表示されることを確認
      await expect(page.locator('text=/Googleでログインしているため、パスワード変更は不要です/')).toBeVisible();
    });

    test('OAuth認証ユーザーの認証方法が正しく表示される', async ({ page }) => {
      // GitHub OAuthユーザーのモックAPIレスポンスを設定
      await page.route('/api/user/profile', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'github-user-1',
            email: 'github@example.com',
            name: 'GitHub User',
            image: 'https://github.com/avatar.jpg',
            createdAt: '2024-02-01T00:00:00.000Z',
            hasPassword: false,
            providers: ['github'],
          }),
        });
      });

      // モック認証セッションを設定
      await page.route('/api/auth/session', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'github-user-1',
              email: 'github@example.com',
              name: 'GitHub User',
              image: 'https://github.com/avatar.jpg',
            },
            expires: '2024-12-31',
          }),
        });
      });

      // プロフィールページへ移動
      await page.goto('/profile');

      // プロフィールページが表示されるのを待つ
      await expect(page.locator('h1').filter({ hasText: 'プロフィール' })).toBeVisible();

      // アカウントタブをクリック
      await page.locator('button').filter({ hasText: 'アカウント' }).click();

      // 認証方法が「GitHub」と表示されることを確認
      await expect(page.locator('text=認証方法').locator('..').locator('text=GitHub')).toBeVisible();
    });

    test('OAuth認証ユーザーのアカウント作成日が表示される', async ({ page }) => {
      const createdAt = '2024-03-15T10:30:00.000Z';
      
      // OAuthユーザーのモックAPIレスポンスを設定
      await page.route('/api/user/profile', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'oauth-user-2',
            email: 'oauth2@example.com',
            name: 'OAuth User 2',
            image: null,
            createdAt: createdAt,
            hasPassword: false,
            providers: ['google'],
          }),
        });
      });

      // モック認証セッションを設定
      await page.route('/api/auth/session', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'oauth-user-2',
              email: 'oauth2@example.com',
              name: 'OAuth User 2',
              image: null,
            },
            expires: '2024-12-31',
          }),
        });
      });

      // プロフィールページへ移動
      await page.goto('/profile');

      // プロフィールページが表示されるのを待つ
      await expect(page.locator('h1').filter({ hasText: 'プロフィール' })).toBeVisible();

      // アカウントタブをクリック
      await page.locator('button').filter({ hasText: 'アカウント' }).click();

      // アカウント作成日が表示されることを確認（日本のロケールで表示）
      const expectedDate = new Date(createdAt).toLocaleDateString('ja-JP');
      await expect(page.locator('text=アカウント作成日').locator('..').locator(`text=${expectedDate}`)).toBeVisible();
    });

    test('複数のOAuthプロバイダーが連携されている場合の表示', async ({ page }) => {
      // 複数プロバイダーのモックAPIレスポンスを設定
      await page.route('/api/user/profile', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'multi-oauth-user',
            email: 'multi@example.com',
            name: 'Multi OAuth User',
            image: null,
            createdAt: '2024-01-01T00:00:00.000Z',
            hasPassword: false,
            providers: ['google', 'github'],
          }),
        });
      });

      // モック認証セッションを設定
      await page.route('/api/auth/session', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'multi-oauth-user',
              email: 'multi@example.com',
              name: 'Multi OAuth User',
              image: null,
            },
            expires: '2024-12-31',
          }),
        });
      });

      // プロフィールページへ移動
      await page.goto('/profile');

      // プロフィールページが表示されるのを待つ
      await expect(page.locator('h1').filter({ hasText: 'プロフィール' })).toBeVisible();

      // アカウントタブをクリック
      await page.locator('button').filter({ hasText: 'アカウント' }).click();

      // 認証方法が「Google, GitHub」と表示されることを確認
      await expect(page.locator('text=認証方法').locator('..').locator('text=/Google.*GitHub|GitHub.*Google/')).toBeVisible();

      // 連携アカウントセクションに両方のプロバイダーが表示されることを確認
      await expect(page.locator('text=連携アカウント').locator('..').locator('text=google')).toBeVisible();
      await expect(page.locator('text=連携アカウント').locator('..').locator('text=github')).toBeVisible();
    });

    test('メール/パスワード認証ユーザーにはパスワード変更フォームが表示される', async ({ page }) => {
      // メール/パスワード認証ユーザーのモックAPIレスポンスを設定
      await page.route('/api/user/profile', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'email-user-1',
            email: 'email@example.com',
            name: 'Email User',
            image: null,
            createdAt: '2024-01-01T00:00:00.000Z',
            hasPassword: true,
            providers: [],
          }),
        });
      });

      // モック認証セッションを設定
      await page.route('/api/auth/session', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'email-user-1',
              email: 'email@example.com',
              name: 'Email User',
              image: null,
            },
            expires: '2024-12-31',
          }),
        });
      });

      // プロフィールページへ移動
      await page.goto('/profile');

      // プロフィールページが表示されるのを待つ
      await expect(page.locator('h1').filter({ hasText: 'プロフィール' })).toBeVisible();

      // アカウントタブをクリック
      await page.locator('button').filter({ hasText: 'アカウント' }).click();

      // パスワード変更フォームが表示されることを確認
      await expect(page.locator('text=パスワード変更').first()).toBeVisible();
      await expect(page.locator('label').filter({ hasText: /現在.*パスワード/ })).toBeVisible();
      await expect(page.locator('label').filter({ hasText: /新しい.*パスワード/ }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'パスワードを変更' })).toBeVisible();

      // OAuth認証の説明メッセージが表示されないことを確認
      await expect(page.locator('text=/でログインしているため、パスワード変更は不要です/')).not.toBeVisible();
    });
  });
});