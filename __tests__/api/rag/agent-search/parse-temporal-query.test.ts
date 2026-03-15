import { parseTemporalQuery } from '@/app/api/rag/agent-search/request-handlers';

describe('parseTemporalQuery', () => {
  // 日付の動的計算のため、テスト内でexpected値を計算

  describe('Japanese patterns', () => {
    it('should parse "最新のReact記事"', () => {
      const result = parseTemporalQuery('最新のReact記事');
      expect(result.cleanQuery).toBe('React記事');
      expect(result.dateRange).toBeUndefined();
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

    it('should parse "今年のNext.js"', () => {
      const result = parseTemporalQuery('今年のNext.js');
      expect(result.cleanQuery).toBe('Next.js');
      expect(result.recencyBoost).toBe(0.5);
      expect(result.strict).toBe(true);
    });
  });

  describe('English patterns', () => {
    it('should parse "latest Docker updates"', () => {
      const result = parseTemporalQuery('latest Docker updates');
      expect(result.cleanQuery).toBe('Docker updates');
      expect(result.dateRange).toBeUndefined();
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

    it('should parse "yesterday news"', () => {
      const result = parseTemporalQuery('yesterday news');
      expect(result.cleanQuery).toBe('news');
      expect(result.recencyBoost).toBe(1.5);
      expect(result.strict).toBe(true);
    });

    it('should parse "this week updates"', () => {
      const result = parseTemporalQuery('this week updates');
      expect(result.cleanQuery).toBe('updates');
      expect(result.recencyBoost).toBe(1.5);
      expect(result.strict).toBe(true);
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
      expect(result.dateRange).toBeUndefined();
      expect(result.recencyBoost).toBe(2.0);
    });

    it('should prefer strict patterns over vague recency patterns', () => {
      const result = parseTemporalQuery('最新の先週のReact');
      // "先週" (strict: true) wins over "最新" (strict: false)
      expect(result.recencyBoost).toBe(1.5);
      expect(result.strict).toBe(true);
    });

    it('should produce valid ISO datetime strings', () => {
      const result = parseTemporalQuery('今月のtest');
      if (result.dateRange) {
        expect(result.dateRange.from).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
        expect(result.dateRange.to).toMatch(/^\d{4}-\d{2}-\d{2}T23:59:59\.999Z$/);
      }
    });

    it('should prefer strict match in mixed query "先週の最新React記事"', () => {
      const result = parseTemporalQuery('先週の最新React記事');
      expect(result.strict).toBe(true);
      expect(result.recencyBoost).toBe(1.5);
    });

    it('should prefer strict match in mixed query "latest React from last week"', () => {
      const result = parseTemporalQuery('latest React from last week');
      expect(result.strict).toBe(true);
      expect(result.recencyBoost).toBe(1.5);
    });
  });

  describe('strict flag', () => {
    it('should return strict: false for vague recency patterns', () => {
      const result = parseTemporalQuery('最新のReact');
      expect(result.strict).toBe(false);
    });

    it('should return strict: true for explicit period patterns', () => {
      const result = parseTemporalQuery('先週のReact');
      expect(result.strict).toBe(true);
    });

    it('should return strict: false when no pattern matches', () => {
      const result = parseTemporalQuery('React Server Components');
      expect(result.strict).toBe(false);
    });
  });
});
