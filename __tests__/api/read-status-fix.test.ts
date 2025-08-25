/**
 * read-status APIのviewedAt非更新テスト
 * 「全て既読にする」機能でviewedAtが更新されないことを確認
 */

import { POST, PUT } from '@/app/api/articles/read-status/route';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

// モック設定
jest.mock('next-auth');
jest.mock('@/lib/prisma', () => ({
  prisma: {
    article: {
      findMany: jest.fn(),
    },
    articleView: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

describe('read-status API - viewedAt修正確認', () => {
  const mockSession = {
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
    },
  };

  const mockArticles = [
    { id: 'article-1', title: 'Test Article 1' },
    { id: 'article-2', title: 'Test Article 2' },
    { id: 'article-3', title: 'Test Article 3' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
  });

  describe('PUT - 全て既読にする', () => {
    it('viewedAtを更新しないこと', async () => {
      // Mock setup
      (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);
      (prisma.articleView.upsert as jest.Mock).mockImplementation(({ create, update }) => 
        Promise.resolve({ ...create, ...update })
      );

      // Execute
      const request = new NextRequest('http://localhost:3000/api/articles/read-status', {
        method: 'PUT',
      });

      const response = await PUT(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.markedCount).toBe(mockArticles.length);

      // viewedAtが更新されていないことを確認
      const upsertCalls = (prisma.articleView.upsert as jest.Mock).mock.calls;
      expect(upsertCalls.length).toBe(mockArticles.length);

      upsertCalls.forEach((call) => {
        const { update, create } = call[0];
        
        // updateにviewedAtが含まれていないこと
        expect(update).toHaveProperty('isRead', true);
        expect(update).toHaveProperty('readAt');
        expect(update).not.toHaveProperty('viewedAt');
        
        // createにもviewedAtが設定されていないこと
        expect(create).toHaveProperty('isRead', true);
        expect(create).toHaveProperty('readAt');
        expect(create).not.toHaveProperty('viewedAt');
      });
    });

    it('既に全て既読の場合は処理しないこと', async () => {
      // Mock setup - 未読記事なし
      (prisma.article.findMany as jest.Mock).mockResolvedValue([]);

      // Execute
      const request = new NextRequest('http://localhost:3000/api/articles/read-status', {
        method: 'PUT',
      });

      const response = await PUT(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.markedCount).toBe(0);
      expect(data.remainingUnreadCount).toBe(0);

      // upsertが呼ばれていないこと
      expect(prisma.articleView.upsert).not.toHaveBeenCalled();
    });
  });

  describe('POST - 個別記事の既読マーク', () => {
    it('個別の既読マークでもviewedAtを更新しないこと', async () => {
      const articleId = 'article-1';
      const now = new Date();

      (prisma.articleView.upsert as jest.Mock).mockResolvedValue({
        id: 'view-1',
        userId: mockSession.user.id,
        articleId,
        isRead: true,
        readAt: now,
        viewedAt: new Date('2025-01-01'), // 既存のviewedAt
      });

      // Execute
      const request = new NextRequest('http://localhost:3000/api/articles/read-status', {
        method: 'POST',
        body: JSON.stringify({ articleId }),
      });

      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // upsertの呼び出しを確認
      const upsertCall = (prisma.articleView.upsert as jest.Mock).mock.calls[0][0];
      
      // updateにviewedAtが含まれていないこと
      expect(upsertCall.update).toHaveProperty('isRead', true);
      expect(upsertCall.update).toHaveProperty('readAt');
      expect(upsertCall.update).not.toHaveProperty('viewedAt');
      
      // createにもviewedAtが設定されていないこと
      expect(upsertCall.create).toHaveProperty('isRead', true);
      expect(upsertCall.create).toHaveProperty('readAt');
      expect(upsertCall.create).not.toHaveProperty('viewedAt');
    });
  });
});