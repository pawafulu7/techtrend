import { test, expect } from '@playwright/test';

/**
 * better-auth の組み込みエンドポイントのうち、パスワードを変えても他のセッションを
 * 失効させないものが閉じていること（#666、lib/auth/auth.ts の disabledPaths）。
 *
 * disabledPaths が返す 404 は本文が "Not Found"。経路が無いときの 404 は本文が空なので、
 * 本文まで見て区別する（区別しないと、パスの書き間違いでもテストが通ってしまう）。
 * 設定の値そのものは lib/auth/__tests__/auth-config.test.ts で確かめる。
 */
test.describe('auth の組み込みエンドポイントの閉鎖（#666）', () => {
  for (const path of ['/api/auth/change-password', '/api/auth/admin/set-user-password']) {
    test(`${path} は disabledPaths で 404 になる`, async ({ request }) => {
      const response = await request.post(path, {
        data: {
          currentPassword: 'OldPassword1',
          newPassword: 'NewPassword1',
          userId: 'user-1',
        },
      });

      expect(response.status()).toBe(404);
      expect(await response.text()).toBe('Not Found');
    });
  }

  test('有効なエンドポイントは未ログインで 401 になる（対照）', async ({ request }) => {
    const response = await request.post('/api/auth/update-user', {
      data: { name: 'x' },
    });

    // 経路が生きていて、better-auth の認証で止まることを確かめる
    expect(response.status()).toBe(401);
  });

  test('/api/auth/set-password は HTTP に出ていない（serverOnly）', async ({ request }) => {
    const response = await request.post('/api/auth/set-password', {
      data: { newPassword: 'NewPassword1' },
    });

    expect(response.status()).toBe(404);
  });

  test('/api/auth/reset-password は偽のトークンを受け付けない', async ({ request }) => {
    const response = await request.post('/api/auth/reset-password', {
      data: { newPassword: 'NewPassword1', token: 'not-a-real-token' },
    });

    expect(response.status()).toBe(400);
  });
});
