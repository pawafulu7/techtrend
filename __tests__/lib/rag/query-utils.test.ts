import { getDynamicThreshold } from '@/lib/rag/query-utils';

describe('getDynamicThreshold', () => {
  describe('Very short queries (single token, 1-3 chars)', () => {
    it('should return 0.5 for "CTO"', () => {
      expect(getDynamicThreshold('CTO')).toBe(0.5);
    });

    it('should return 0.5 for "AI"', () => {
      expect(getDynamicThreshold('AI')).toBe(0.5);
    });

    it('should return 0.5 for "API"', () => {
      expect(getDynamicThreshold('API')).toBe(0.5);
    });
  });

  describe('Short queries (single token, 4-10 chars)', () => {
    it('should return 0.55 for "React"', () => {
      expect(getDynamicThreshold('React')).toBe(0.55);
    });

    it('should return 0.55 for "TypeScript"', () => {
      expect(getDynamicThreshold('TypeScript')).toBe(0.55);
    });

    it('should return 0.55 for "Next.js"', () => {
      expect(getDynamicThreshold('Next.js')).toBe(0.55);
    });
  });

  describe('Medium queries (single token, > 10 chars)', () => {
    it('should return 0.6 for "Authentication"', () => {
      expect(getDynamicThreshold('Authentication')).toBe(0.6);
    });

    it('should return 0.6 for "Optimization"', () => {
      expect(getDynamicThreshold('Optimization')).toBe(0.6);
    });
  });

  describe('Two-token queries', () => {
    it('should return 0.6 for "React hooks"', () => {
      expect(getDynamicThreshold('React hooks')).toBe(0.6);
    });

    it('should return 0.6 for "API design"', () => {
      expect(getDynamicThreshold('API design')).toBe(0.6);
    });

    it('should return 0.6 for "TypeScript tutorial"', () => {
      expect(getDynamicThreshold('TypeScript tutorial')).toBe(0.6);
    });
  });

  describe('Multi-token queries (3-4 tokens)', () => {
    it('should return 0.6 for "React hooks tutorial"', () => {
      expect(getDynamicThreshold('React hooks tutorial')).toBe(0.6);
    });

    it('should return 0.6 for "Next.js image optimization"', () => {
      expect(getDynamicThreshold('Next.js image optimization')).toBe(0.6);
    });

    it('should return 0.6 for "API authentication best practices"', () => {
      expect(getDynamicThreshold('API authentication best practices')).toBe(0.6);
    });
  });

  describe('Long queries (5+ tokens)', () => {
    it('should return 0.65 for "How to optimize React application performance"', () => {
      expect(getDynamicThreshold('How to optimize React application performance')).toBe(0.65);
    });

    it('should return 0.65 for "Best practices for building scalable Next.js applications"', () => {
      expect(getDynamicThreshold('Best practices for building scalable Next.js applications')).toBe(0.65);
    });
  });

  describe('Edge cases', () => {
    it('should return 0.5 for empty string', () => {
      expect(getDynamicThreshold('')).toBe(0.5);
    });

    it('should return 0.5 for whitespace-only string', () => {
      expect(getDynamicThreshold('   ')).toBe(0.5);
    });

    it('should handle leading/trailing whitespace', () => {
      expect(getDynamicThreshold('  CTO  ')).toBe(0.5);
      expect(getDynamicThreshold('  React hooks  ')).toBe(0.6);
    });

    it('should handle multiple spaces between tokens', () => {
      expect(getDynamicThreshold('React   hooks')).toBe(0.6);
    });
  });

  describe('Token vs character length priority', () => {
    it('should prioritize token count over character length', () => {
      // Single token (even if long) should follow single-token rules
      expect(getDynamicThreshold('Internationalization')).toBe(0.6); // 20 chars, single token

      // Two tokens should return 0.6 regardless of total character length
      expect(getDynamicThreshold('AI ML')).toBe(0.6); // 5 chars, two tokens
    });
  });

  describe('Special characters', () => {
    it('should handle queries with hyphens', () => {
      expect(getDynamicThreshold('Next.js')).toBe(0.55);
      // "Server-side-rendering" splits to ["Server","side","rendering"], max length = 9 -> 0.55
      expect(getDynamicThreshold('Server-side-rendering')).toBe(0.55);
    });

    it('should handle queries with slashes', () => {
      // "React/TypeScript" splits to ["React","TypeScript"], max length = 10 -> 0.55
      expect(getDynamicThreshold('React/TypeScript')).toBe(0.55);
    });

    it('should handle queries with underscores', () => {
      expect(getDynamicThreshold('snake_case')).toBe(0.55);
    });
  });
});
