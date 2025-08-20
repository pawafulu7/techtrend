import { POST, GET } from '@/app/api/ai/chat/route';
import { NextRequest } from 'next/server';

// Prismaのモック
jest.mock('@/lib/database/prisma', () => ({
  prisma: {
    article: {
      findMany: jest.fn()
    }
  }
}));

describe('/api/ai/chat', () => {
  describe('POST', () => {
    it('returns fixed response for greeting', async () => {
      const request = new NextRequest('http://localhost:3000/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'こんにちは'
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.response).toContain('こんにちは');
      expect(data.type).toBe('text');
      expect(data.suggestedActions).toBeDefined();
    });

    it('returns help response for help queries', async () => {
      const request = new NextRequest('http://localhost:3000/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: '使い方を教えて'
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.response).toContain('使い方');
      expect(data.type).toBe('text');
    });

    it('detects search queries', async () => {
      const request = new NextRequest('http://localhost:3000/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Reactの記事を探して'
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.response).toContain('React');
    });

    it('returns error for invalid request', async () => {
      const request = new NextRequest('http://localhost:3000/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Message is required');
    });
  });

  describe('GET', () => {
    it('returns API information', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.version).toBe('1.0.0');
      expect(data.capabilities).toContain('fixed_responses');
      expect(data.capabilities).toContain('article_search');
      expect(data.status).toBe('active');
    });
  });
});