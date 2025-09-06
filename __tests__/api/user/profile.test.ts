import { NextRequest } from 'next/server';
import { GET } from '@/app/api/user/profile/route';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';

// モック
jest.mock('@/lib/auth/auth');

const mockFindUnique = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
  },
}));

describe('/api/user/profile', () => {
  const mockAuth = auth as jest.MockedFunction<typeof auth>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET', () => {
    it('認証されていないユーザーの場合、401エラーを返す', async () => {
      mockAuth.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/user/profile');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('メール/パスワード認証ユーザーの情報を正しく返す', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        image: 'https://example.com/avatar.jpg',
        password: 'hashed-password',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        emailVerified: null,
        accounts: [],
      };

      mockAuth.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User', image: 'https://example.com/avatar.jpg' },
        expires: '2024-12-31',
      });
      mockFindUnique.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3000/api/user/profile');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        image: 'https://example.com/avatar.jpg',
        createdAt: '2024-01-01T00:00:00.000Z',
        hasPassword: true,
        providers: [],
      });
    });

    it('OAuth認証ユーザーの情報を正しく返す', async () => {
      const mockUser = {
        id: 'user-2',
        email: 'oauth@example.com',
        name: 'OAuth User',
        image: 'https://example.com/oauth-avatar.jpg',
        password: null,
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-01'),
        emailVerified: null,
        accounts: [
          { provider: 'google' },
          { provider: 'github' },
        ],
      };

      mockAuth.mockResolvedValue({
        user: { id: 'user-2', email: 'oauth@example.com', name: 'OAuth User', image: 'https://example.com/oauth-avatar.jpg' },
        expires: '2024-12-31',
      });
      mockFindUnique.mockResolvedValue(mockUser as any);

      const request = new NextRequest('http://localhost:3000/api/user/profile');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        id: 'user-2',
        email: 'oauth@example.com',
        name: 'OAuth User',
        image: 'https://example.com/oauth-avatar.jpg',
        createdAt: '2024-02-01T00:00:00.000Z',
        hasPassword: false,
        providers: ['google', 'github'],
      });
    });

    it('複数のOAuthプロバイダーを正しく返す', async () => {
      const mockUser = {
        id: 'user-3',
        email: 'multi@example.com',
        name: 'Multi Provider User',
        image: null,
        password: null,
        createdAt: new Date('2024-03-01'),
        updatedAt: new Date('2024-03-01'),
        emailVerified: null,
        accounts: [
          { provider: 'google' },
          { provider: 'github' },
        ],
      };

      mockAuth.mockResolvedValue({
        user: { id: 'user-3', email: 'multi@example.com', name: 'Multi Provider User', image: null },
        expires: '2024-12-31',
      });
      mockFindUnique.mockResolvedValue(mockUser as any);

      const request = new NextRequest('http://localhost:3000/api/user/profile');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.providers).toEqual(['google', 'github']);
      expect(data.hasPassword).toBe(false);
    });

    it('ユーザーが見つからない場合、404エラーを返す', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'non-existent', email: 'test@example.com', name: 'Test User', image: null },
        expires: '2024-12-31',
      });
      mockFindUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/user/profile');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('User not found');
    });

    it('データベースエラーの場合、500エラーを返す', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User', image: null },
        expires: '2024-12-31',
      });
      mockFindUnique.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost:3000/api/user/profile');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });
  });
});