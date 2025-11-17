import { expandQueryWithDictionary, TECH_ABBREVIATIONS } from '@/lib/rag/abbreviations';

describe('TECH_ABBREVIATIONS', () => {
  it('should contain common tech abbreviations', () => {
    expect(TECH_ABBREVIATIONS['CTO']).toBe('Chief Technology Officer');
    expect(TECH_ABBREVIATIONS['CEO']).toBe('Chief Executive Officer');
    expect(TECH_ABBREVIATIONS['SRE']).toBe('Site Reliability Engineering');
    expect(TECH_ABBREVIATIONS['API']).toBe('Application Programming Interface');
  });

  it('should have consistent casing (uppercase keys)', () => {
    const keys = Object.keys(TECH_ABBREVIATIONS);
    keys.forEach(key => {
      expect(key).toBe(key.toUpperCase());
    });
  });
});

describe('expandQueryWithDictionary', () => {
  describe('Direct match (entire query is an abbreviation)', () => {
    it('should expand "CTO" to "Chief Technology Officer"', () => {
      expect(expandQueryWithDictionary('CTO')).toBe('Chief Technology Officer');
    });

    it('should expand "CEO" to "Chief Executive Officer"', () => {
      expect(expandQueryWithDictionary('CEO')).toBe('Chief Executive Officer');
    });

    it('should expand "SRE" to "Site Reliability Engineering"', () => {
      expect(expandQueryWithDictionary('SRE')).toBe('Site Reliability Engineering');
    });

    it('should expand "API" to "Application Programming Interface"', () => {
      expect(expandQueryWithDictionary('API')).toBe('Application Programming Interface');
    });

    it('should expand "DevOps" to "Development and Operations"', () => {
      expect(expandQueryWithDictionary('DevOps')).toBe('Development and Operations');
    });

    it('should be case-insensitive for direct match', () => {
      expect(expandQueryWithDictionary('cto')).toBe('Chief Technology Officer');
      expect(expandQueryWithDictionary('Cto')).toBe('Chief Technology Officer');
      expect(expandQueryWithDictionary('CTO')).toBe('Chief Technology Officer');
    });
  });

  describe('Token match (expand individual tokens)', () => {
    it('should expand "CTO role" and preserve original', () => {
      expect(expandQueryWithDictionary('CTO role')).toBe('CTO Chief Technology Officer role');
    });

    it('should expand "SRE practices" and preserve original', () => {
      expect(expandQueryWithDictionary('SRE practices')).toBe('SRE Site Reliability Engineering practices');
    });

    it('should expand "API design patterns" and preserve original', () => {
      expect(expandQueryWithDictionary('API design patterns')).toBe('API Application Programming Interface design patterns');
    });

    it('should expand multiple abbreviations and preserve originals', () => {
      expect(expandQueryWithDictionary('SRE and DevOps')).toBe('SRE Site Reliability Engineering and DevOps Development and Operations');
    });

    it('should preserve case and expand "CTO responsibilities"', () => {
      expect(expandQueryWithDictionary('CTO responsibilities')).toBe('CTO Chief Technology Officer responsibilities');
    });
  });

  describe('No match (return original)', () => {
    it('should return "React" as-is', () => {
      expect(expandQueryWithDictionary('React')).toBe('React');
    });

    it('should return "TypeScript tutorial" as-is', () => {
      expect(expandQueryWithDictionary('TypeScript tutorial')).toBe('TypeScript tutorial');
    });

    it('should return "Next.js" as-is', () => {
      expect(expandQueryWithDictionary('Next.js')).toBe('Next.js');
    });

    it('should return long queries as-is', () => {
      const longQuery = 'How to optimize React application performance';
      expect(expandQueryWithDictionary(longQuery)).toBe(longQuery);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      expect(expandQueryWithDictionary('')).toBe('');
    });

    it('should handle whitespace-only string', () => {
      expect(expandQueryWithDictionary('   ')).toBe('');
    });

    it('should trim leading/trailing whitespace', () => {
      expect(expandQueryWithDictionary('  CTO  ')).toBe('Chief Technology Officer');
    });

    it('should handle multiple spaces between tokens', () => {
      expect(expandQueryWithDictionary('CTO   role')).toBe('CTO Chief Technology Officer role');
    });

    it('should not expand queries with >5 tokens', () => {
      // Avoid over-expansion for long queries
      const longQuery = 'API design patterns for microservices architecture best practices';
      expect(expandQueryWithDictionary(longQuery)).toBe(longQuery);
    });
  });

  describe('Special characters', () => {
    it('should handle abbreviations with slashes', () => {
      expect(expandQueryWithDictionary('CI/CD')).toBe('Continuous Integration Continuous Deployment');
    });

    it('should preserve non-abbreviated terms with special chars', () => {
      expect(expandQueryWithDictionary('Next.js optimization')).toBe('Next.js optimization');
    });
  });

  describe('Partial expansion', () => {
    it('should expand only recognized tokens', () => {
      expect(expandQueryWithDictionary('CTO at startup')).toBe('CTO Chief Technology Officer at startup');
    });

    it('should not expand if no tokens match', () => {
      expect(expandQueryWithDictionary('React hooks tutorial')).toBe('React hooks tutorial');
    });

    it('should expand mixed abbreviations and normal words', () => {
      expect(expandQueryWithDictionary('API and GraphQL comparison')).toBe('API Application Programming Interface and GraphQL Graph Query Language comparison');
    });
  });

  describe('Performance & Optimization expansion (Phase 2)', () => {
    describe('Framework-specific performance', () => {
      it('should expand "Rails 性能" to full expansion (Strategy 1: Direct match)', () => {
        const result = expandQueryWithDictionary('Rails 性能');
        expect(result).toBe('Rails performance Rails パフォーマンス Rails tuning');
      });

      it('should expand "Rails パフォーマンス" to full expansion (Strategy 1: Direct match)', () => {
        const result = expandQueryWithDictionary('Rails パフォーマンス');
        expect(result).toBe('Rails performance Rails 性能 Rails optimization');
      });

      it('should expand "React 性能" with scoped synonyms', () => {
        const result = expandQueryWithDictionary('React 性能');
        expect(result).toContain('React');
        expect(result).toContain('performance');
        expect(result).toContain('パフォーマンス');
        expect(result).toContain('optimization');
      });

      it('should expand "Next.js パフォーマンス" with scoped synonyms', () => {
        const result = expandQueryWithDictionary('Next.js パフォーマンス');
        expect(result).toContain('Next.js');
        expect(result).toContain('performance');
        expect(result).toContain('optimization');
      });
    });

    describe('Generic performance with context', () => {
      it('should expand "アプリ 性能" with application context', () => {
        const result = expandQueryWithDictionary('アプリ 性能');
        expect(result).toContain('application');
        expect(result).toContain('performance');
        expect(result).toContain('パフォーマンス');
      });

      it('should expand "性能改善" with improvement context', () => {
        const result = expandQueryWithDictionary('性能改善');
        expect(result).toContain('performance');
        expect(result).toContain('improvement');
        expect(result).toContain('optimization');
      });
    });

    describe('Core performance terms (limited scope)', () => {
      it('should expand "性能" to basic synonyms only', () => {
        const result = expandQueryWithDictionary('性能');
        expect(result).toBe('performance パフォーマンス');
      });

      it('should expand "パフォーマンス" to English equivalent', () => {
        const result = expandQueryWithDictionary('パフォーマンス');
        expect(result).toBe('performance');
      });
    });


    describe('Preserves non-performance queries', () => {
      it('should not expand "React hooks" (no performance keywords)', () => {
        expect(expandQueryWithDictionary('React hooks')).toBe('React hooks');
      });

      it('should not expand "Next.js routing" (no performance keywords)', () => {
        expect(expandQueryWithDictionary('Next.js routing')).toBe('Next.js routing');
      });
    });
  });
});
