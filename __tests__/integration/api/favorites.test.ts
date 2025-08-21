import { describe, it, expect, beforeAll } from '@jest/globals';
import { prisma } from '@/lib/database';

describe('お気に入りAPIエンドポイントテスト', () => {
  const baseUrl = 'http://localhost:3000';
  let testArticleId: string;
  let sessionCookie: string | undefined;

  beforeAll(async () => {
    // テスト用記事を取得
    const article = await prisma.article.findFirst({
      where: {
        qualityScore: { gte: 30 }
      }
    });
    
    if (article) {
      testArticleId = article.id;
    }

    // テスト用ユーザーでログイン
    const testEmail = `test-fav-${Date.now()}@example.com`;
    const testPassword = 'TestPassword123!';

    // ユーザー登録
    await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: 'Favorite Test User'
      })
    });

    // ログイン
    const loginResponse = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword
      }),
      redirect: 'manual'
    });

    const cookies = loginResponse.headers.get('set-cookie');
    if (cookies) {
      const sessionMatch = cookies.match(/authjs\.session-token=([^;]+)/);
      if (sessionMatch) {
        sessionCookie = sessionMatch[1];
      }
    }
  });

  describe('認証が必要なエンドポイントの保護', () => {
    it('未認証でお気に入り一覧取得が401エラーになること', async () => {
      const response = await fetch(`${baseUrl}/api/favorites`);
      expect(response.status).toBe(401);
    });

    it('未認証でお気に入り追加が401エラーになること', async () => {
      const response = await fetch(`${baseUrl}/api/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: testArticleId })
      });
      expect(response.status).toBe(401);
    });

    it('未認証でお気に入り削除が401エラーになること', async () => {
      const response = await fetch(`${baseUrl}/api/favorites?articleId=${testArticleId}`, {
        method: 'DELETE'
      });
      expect(response.status).toBe(401);
    });
  });

  describe('認証済みユーザーのお気に入り機能', () => {
    it('お気に入りに記事を追加できること', async () => {
      if (!sessionCookie || !testArticleId) {
        console.warn('セッションまたはテスト記事が準備できませんでした');
        return;
      }

      const response = await fetch(`${baseUrl}/api/favorites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `authjs.session-token=${sessionCookie}`
        },
        body: JSON.stringify({ articleId: testArticleId })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('favorite');
    });

    it('同じ記事を重複してお気に入りに追加できないこと', async () => {
      if (!sessionCookie || !testArticleId) {
        console.warn('セッションまたはテスト記事が準備できませんでした');
        return;
      }

      const response = await fetch(`${baseUrl}/api/favorites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `authjs.session-token=${sessionCookie}`
        },
        body: JSON.stringify({ articleId: testArticleId })
      });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'Already favorited');
    });

    it('お気に入り一覧を取得できること', async () => {
      if (!sessionCookie) {
        console.warn('セッションが準備できませんでした');
        return;
      }

      const response = await fetch(`${baseUrl}/api/favorites`, {
        headers: {
          'Cookie': `authjs.session-token=${sessionCookie}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('favorites');
      expect(Array.isArray(data.favorites)).toBe(true);
      expect(data).toHaveProperty('pagination');
    });

    it('特定記事のお気に入り状態を確認できること', async () => {
      if (!sessionCookie || !testArticleId) {
        console.warn('セッションまたはテスト記事が準備できませんでした');
        return;
      }

      const response = await fetch(`${baseUrl}/api/favorites/${testArticleId}`, {
        headers: {
          'Cookie': `authjs.session-token=${sessionCookie}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('isFavorited');
      expect(data.isFavorited).toBe(true);
    });

    it('お気に入りから記事を削除できること', async () => {
      if (!sessionCookie || !testArticleId) {
        console.warn('セッションまたはテスト記事が準備できませんでした');
        return;
      }

      const response = await fetch(`${baseUrl}/api/favorites?articleId=${testArticleId}`, {
        method: 'DELETE',
        headers: {
          'Cookie': `authjs.session-token=${sessionCookie}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('message', 'Article removed from favorites');
    });

    it('存在しない記事のお気に入り追加が失敗すること', async () => {
      if (!sessionCookie) {
        console.warn('セッションが準備できませんでした');
        return;
      }

      const response = await fetch(`${baseUrl}/api/favorites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `authjs.session-token=${sessionCookie}`
        },
        body: JSON.stringify({ articleId: 'non-existent-id' })
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'Article not found');
    });
  });
});