import { test, expect } from '@playwright/test';
import {
  PASSWORD_CHANGE_PATHS,
  UNUSED_ADMIN_PLUGIN_PATHS,
} from '../../lib/auth/disabled-paths';

/**
 * better-auth の組み込みエンドポイントのうち、パスワードを変えても他のセッションを
 * 失効させないものが閉じていること（#666、lib/auth/auth.ts の disabledPaths）。
 *
 * disabledPaths が返す 404 は本文が "Not Found"。経路が無いときの 404 は本文が空なので、
 * 本文まで見て区別する（区別しないと、パスの書き間違いでもテストが通ってしまう）。
 * 設定の値そのものは lib/auth/__tests__/auth-config.test.ts で確かめる。
 * admin プラグインの未使用のエンドポイントもすべて閉じている（lib/auth/disabled-paths.ts）。
 */

test.describe('auth の組み込みエンドポイントの閉鎖（#666）', () => {
  // 一覧の書き間違いは下の 404 の検査では見つからない（disabledPaths は経路の有無より先に判定するので、
  // 実在しないパスも 404 になる）。admin プラグインが実際に持つエンドポイントと照らし合わせる
  test('admin プラグインのエンドポイントはすべて閉じている', async () => {
    const { admin } = await import('better-auth/plugins');
    const pluginPaths = Object.values(admin().endpoints)
      .map((endpoint) => (endpoint as { path?: string }).path)
      .filter((path): path is string => typeof path === 'string')
      .sort();

    expect(pluginPaths.length).toBeGreaterThan(0);
    expect([...UNUSED_ADMIN_PLUGIN_PATHS].sort()).toEqual(pluginPaths);
  });

  for (const path of [...PASSWORD_CHANGE_PATHS, ...UNUSED_ADMIN_PLUGIN_PATHS].map(
    (p) => `/api/auth${p}`
  )) {
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
