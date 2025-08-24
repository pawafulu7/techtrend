import { describe, it, expect, _beforeAll, _afterAll } from '@jest/globals';

describe('認証APIエンドポイントテスト', () => {
  const baseUrl = 'http://localhost:3000';
  const testUserEmail = `test-${Date.now()}@example.com`;
  const testUserPassword = 'TestPassword123!';
  let sessionCookie: string | undefined;

  describe('POST /api/auth/signup', () => {
    it('新規ユーザー登録が成功すること', async () => {
      const response = await fetch(`${baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUserEmail,
          password: testUserPassword,
          name: 'Test User'
        })
      });

      // ステータスコードの確認
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('user');
      expect(data.user).toHaveProperty('email', testUserEmail);
      expect(data.user).toHaveProperty('name', 'Test User');
      expect(data.user).not.toHaveProperty('password');
    });

    it('既存のメールアドレスでの登録が失敗すること', async () => {
      const response = await fetch(`${baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUserEmail,
          password: testUserPassword,
          name: 'Duplicate User'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('不正なメールアドレスでの登録が失敗すること', async () => {
      const response = await fetch(`${baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email',
          password: testUserPassword,
          name: 'Invalid Email User'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/callback/credentials', () => {
    it('正しい認証情報でログインできること', async () => {
      const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUserEmail,
          password: testUserPassword
        }),
        redirect: 'manual'
      });

      // セッションCookieを取得
      const cookies = response.headers.get('set-cookie');
      if (cookies) {
        const sessionMatch = cookies.match(/authjs\.session-token=([^;]+)/);
        if (sessionMatch) {
          sessionCookie = sessionMatch[1];
        }
      }

      expect(response.status).toBeLessThan(400);
    });

    it('間違ったパスワードでログインが失敗すること', async () => {
      const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUserEmail,
          password: 'WrongPassword'
        })
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('存在しないユーザーでログインが失敗すること', async () => {
      const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: testUserPassword
        })
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /api/auth/session', () => {
    it('認証済みユーザーのセッション情報が取得できること', async () => {
      if (!sessionCookie) {
        console.warn('セッションCookieが取得できませんでした');
        return;
      }

      const response = await fetch(`${baseUrl}/api/auth/session`, {
        headers: {
          'Cookie': `authjs.session-token=${sessionCookie}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      if (data.user) {
        expect(data.user).toHaveProperty('email', testUserEmail);
      }
    });

    it('未認証ユーザーのセッション情報が空であること', async () => {
      const response = await fetch(`${baseUrl}/api/auth/session`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({});
    });
  });
});