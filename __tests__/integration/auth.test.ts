import { describe, it, expect } from '@jest/globals';

describe('認証保護ミドルウェアテスト', () => {
  const baseUrl = 'http://localhost:3000';
  
  describe('保護されたページへのアクセス', () => {
    it('未認証で/profileへアクセスするとログインページにリダイレクトされること', async () => {
      const response = await fetch(`${baseUrl}/profile`, {
        redirect: 'manual'
      });

      expect(response.status).toBe(307); // Temporary Redirect
      const location = response.headers.get('location');
      expect(location).toContain('/auth/login');
      expect(location).toContain('callbackUrl=%2Fprofile');
    });

    it('未認証で/article-favoritesへアクセスするとログインページにリダイレクトされること', async () => {
      const response = await fetch(`${baseUrl}/article-favorites`, {
        redirect: 'manual'
      });

      expect(response.status).toBe(307);
      const location = response.headers.get('location');
      expect(location).toContain('/auth/login');
      expect(location).toContain('callbackUrl=%2Farticle-favorites');
    });

    it('未認証で/historyへアクセスするとログインページにリダイレクトされること', async () => {
      const response = await fetch(`${baseUrl}/history`, {
        redirect: 'manual'
      });

      expect(response.status).toBe(307);
      const location = response.headers.get('location');
      expect(location).toContain('/auth/login');
      expect(location).toContain('callbackUrl=%2Fhistory');
    });
  });

  describe('保護されたAPIエンドポイントへのアクセス', () => {
    it('未認証で/api/favoritesへアクセスすると401エラーが返ること', async () => {
      const response = await fetch(`${baseUrl}/api/favorites`);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'Unauthorized');
    });

    it('未認証で/api/article-viewsへアクセスすると401エラーが返ること', async () => {
      const response = await fetch(`${baseUrl}/api/article-views`);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'Unauthorized');
    });
  });

  describe('公開ページへのアクセス', () => {
    it('未認証でもホームページにアクセスできること', async () => {
      const response = await fetch(`${baseUrl}/`);
      expect(response.status).toBe(200);
    });

    it('未認証でも記事APIにアクセスできること', async () => {
      const response = await fetch(`${baseUrl}/api/articles`);
      expect(response.status).toBe(200);
    });

    it('未認証でもソースAPIにアクセスできること', async () => {
      const response = await fetch(`${baseUrl}/api/sources`);
      expect(response.status).toBe(200);
    });

    it('未認証でもタグAPIにアクセスできること', async () => {
      const response = await fetch(`${baseUrl}/api/tags`);
      expect(response.status).toBe(200);
    });

    it('未認証でもログインページにアクセスできること', async () => {
      const response = await fetch(`${baseUrl}/auth/login`);
      expect(response.status).toBe(200);
    });

    it('未認証でもサインアップページにアクセスできること', async () => {
      const response = await fetch(`${baseUrl}/auth/signup`);
      expect(response.status).toBe(200);
    });
  });
});