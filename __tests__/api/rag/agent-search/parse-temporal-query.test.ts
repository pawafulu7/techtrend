import { parseTemporalQuery } from '@/app/api/rag/agent-search/request-handlers';

describe('parseTemporalQuery', () => {
  // 日付の動的計算のため、テスト内でexpected値を計算

  describe('Japanese patterns', () => {
    it('should parse "最新のReact記事"', () => {
      const result = parseTemporalQuery('最新のReact記事');
      expect(result.cleanQuery).toBe('React記事');
      expect(result.dateRange).toBeDefined();
      expect(result.dateRange!.from).toBeDefined();
      expect(result.dateRange!.to).toBeDefined();
      expect(result.recencyBoost).toBe(2.0);
    });

    it('should parse "先週のAWS障害"', () => {
      const result = parseTemporalQuery('先週のAWS障害');
      expect(result.cleanQuery).toBe('AWS障害');
      expect(result.dateRange).toBeDefined();
      expect(result.recencyBoost).toBe(1.5);
    });

    it('should parse "今月のTypeScript"', () => {
      const result = parseTemporalQuery('今月のTypeScript');
      expect(result.cleanQuery).toBe('TypeScript');
      expect(result.dateRange).toBeDefined();
      expect(result.recencyBoost).toBe(1.0);
    });

    it('should parse "昨日のニュース"', () => {
      const result = parseTemporalQuery('昨日のニュース');
      expect(result.cleanQuery).toBe('ニュース');
      expect(result.dateRange).toBeDefined();
      expect(result.recencyBoost).toBe(1.5);
    });

    it('should parse "去年のNext.js"', () => {
      const result = parseTemporalQuery('去年のNext.js');
      expect(result.cleanQuery).toBe('Next.js');
      expect(result.dateRange).toBeDefined();
      expect(result.recencyBoost).toBe(0);
    });

    it('should parse "今週のKubernetes"', () => {
      const result = parseTemporalQuery('今週のKubernetes');
      expect(result.cleanQuery).toBe('Kubernetes');
      expect(result.dateRange).toBeDefined();
      expect(result.recencyBoost).toBe(1.5);
    });
  });

  describe('English patterns', () => {
    it('should parse "latest Docker updates"', () => {
      const result = parseTemporalQuery('latest Docker updates');
      expect(result.cleanQuery).toBe('Docker updates');
      expect(result.dateRange).toBeDefined();
      expect(result.recencyBoost).toBe(2.0);
    });

    it('should parse "last week Kubernetes"', () => {
      const result = parseTemporalQuery('last week Kubernetes');
      expect(result.cleanQuery).toBe('Kubernetes');
      expect(result.recencyBoost).toBe(1.5);
    });

    it('should parse "this month AI news"', () => {
      const result = parseTemporalQuery('this month AI news');
      expect(result.cleanQuery).toBe('AI news');
      expect(result.recencyBoost).toBe(1.0);
    });
  });

  describe('no match', () => {
    it('should return original query when no temporal pattern found', () => {
      const result = parseTemporalQuery('React Server Components');
      expect(result.cleanQuery).toBe('React Server Components');
      expect(result.dateRange).toBeUndefined();
      expect(result.recencyBoost).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should return original query if cleanQuery would be empty', () => {
      const result = parseTemporalQuery('最新');
      expect(result.cleanQuery).toBe('最新');
      expect(result.dateRange).toBeDefined();
      expect(result.recencyBoost).toBe(2.0);
    });

    it('should handle multiple temporal patterns (first match only)', () => {
      const result = parseTemporalQuery('最新の先週のReact');
      // "最新" matches first
      expect(result.recencyBoost).toBe(2.0);
    });

    it('should produce valid ISO date strings', () => {
      const result = parseTemporalQuery('今月のtest');
      if (result.dateRange) {
        expect(result.dateRange.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(result.dateRange.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });
});
