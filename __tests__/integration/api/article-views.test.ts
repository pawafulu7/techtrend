import { describe, it, expect, beforeAll } from '@jest/globals';
import { prisma } from '@/lib/database';

const run = process.env.INTEGRATION_E2E === 'true' ? describe : describe.skip;

run('閲覧履歴APIエンドポイントテスト', () => {
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
    const testEmail = `test-view-${Date.now()}@example.com`;
    const testPassword = 'TestPassword123!';

    // ユーザー登録
    await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: 'View Test User'
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
    it('未認証で閲覧履歴取得が401エラーになること', async () => {
      const response = await fetch(`${baseUrl}/api/article-views`);
      expect(response.status).toBe(401);
    });
  });

  describe('閲覧履歴の記録', () => {
    it('未認証でも閲覧記録のPOSTが成功すること（記録はされない）', async () => {
      const response = await fetch(`${baseUrl}/api/article-views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: testArticleId })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('message', 'View not recorded (not logged in)');
    });

    it('認証済みユーザーの閲覧が記録されること', async () => {
      if (!sessionCookie || !testArticleId) {
        console.warn('セッションまたはテスト記事が準備できませんでした');
        return;
      }

      const response = await fetch(`${baseUrl}/api/article-views`, {
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
      expect(data).toHaveProperty('viewId');
    });

    it('同じ記事の連続閲覧は時刻更新のみ行われること', async () => {
      if (!sessionCookie || !testArticleId) {
        console.warn('セッションまたはテスト記事が準備できませんでした');
        return;
      }

      // 2回目の閲覧記録
      const response = await fetch(`${baseUrl}/api/article-views`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `authjs.session-token=${sessionCookie}`
        },
        body: JSON.stringify({ articleId: testArticleId })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('message', 'View timestamp updated');
      expect(data).toHaveProperty('viewId');
    });

    it('存在しない記事の閲覧記録が失敗すること', async () => {
      if (!sessionCookie) {
        console.warn('セッションが準備できませんでした');
        return;
      }

      const response = await fetch(`${baseUrl}/api/article-views`, {
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

  describe('閲覧履歴の取得', () => {
    it('認証済みユーザーの閲覧履歴を取得できること', async () => {
      if (!sessionCookie) {
        console.warn('セッションが準備できませんでした');
        return;
      }

      const response = await fetch(`${baseUrl}/api/article-views`, {
        headers: {
          'Cookie': `authjs.session-token=${sessionCookie}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('views');
      expect(Array.isArray(data.views)).toBe(true);
      expect(data).toHaveProperty('pagination');
      
      // 記録した閲覧履歴が含まれていることを確認
      if (data.views.length > 0) {
        expect(data.views[0]).toHaveProperty('id');
        expect(data.views[0]).toHaveProperty('title');
        expect(data.views[0]).toHaveProperty('viewedAt');
      }
    });

    it('ページネーションが機能すること', async () => {
      if (!sessionCookie) {
        console.warn('セッションが準備できませんでした');
        return;
      }

      const response = await fetch(`${baseUrl}/api/article-views?page=1&limit=5`, {
        headers: {
          'Cookie': `authjs.session-token=${sessionCookie}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('pagination');
      expect(data.pagination).toHaveProperty('page', 1);
      expect(data.pagination).toHaveProperty('limit', 5);
      expect(data.pagination).toHaveProperty('total');
      expect(data.pagination).toHaveProperty('totalPages');
    });
  });
});
