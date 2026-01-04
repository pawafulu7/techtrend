import {
  DiffSummaryOutputSchema,
  ViewpointMapOutputSchema,
  CodeTipOutputSchema,
  parseJSONFromLLM,
  createCodeHash,
} from '@/lib/ai/extraction/extraction-schemas';

describe('Extraction Schemas', () => {
  describe('DiffSummaryOutputSchema', () => {
    it('should validate a valid diff summary', () => {
      const validData = {
        changes: [
          {
            type: 'new',
            topic: 'React Server Components',
            description: 'New approach to server-side rendering in React',
            significance: 'high',
            relatedArticleIds: ['article1', 'article2'],
          },
          {
            type: 'trending',
            topic: 'TypeScript 5.0',
            description: 'Growing adoption of TypeScript 5.0 features',
            significance: 'medium',
          },
        ],
        unchanged: ['JavaScript basics', 'CSS fundamentals'],
        summary:
          'This week saw major developments in React ecosystem with the introduction of Server Components. TypeScript 5.0 continues to gain traction.',
        keyTakeaways: [
          'React Server Components are production-ready',
          'TypeScript adoption increasing',
        ],
      };

      const result = DiffSummaryOutputSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid change type', () => {
      const invalidData = {
        changes: [
          {
            type: 'invalid_type',
            topic: 'Test',
            description: 'Test description',
            significance: 'high',
          },
        ],
        unchanged: [],
        summary: 'Test summary that is long enough to pass validation',
        keyTakeaways: ['Test takeaway'],
      };

      const result = DiffSummaryOutputSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('ViewpointMapOutputSchema', () => {
    it('should validate a valid viewpoint map', () => {
      const validData = {
        issues: [
          {
            title: 'AI in Software Development',
            description:
              'The role of AI tools in modern software development workflows',
            positions: [
              {
                stance: 'AI-augmented development',
                reasoning:
                  'AI tools enhance developer productivity without replacing them',
                supporters: ['Developer advocates'],
              },
              {
                stance: 'AI-cautious approach',
                reasoning: 'Over-reliance on AI may reduce developer skills',
              },
            ],
            consensus: 'AI tools are useful but require careful integration',
            openQuestions: ['How to measure AI impact on code quality?'],
          },
        ],
        overallTheme:
          'The tech community is actively debating the integration of AI in development workflows',
        controversyLevel: 'medium',
      };

      const result = ViewpointMapOutputSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject empty issues array', () => {
      const invalidData = {
        issues: [],
        overallTheme: 'No issues found',
        controversyLevel: 'low',
      };

      const result = ViewpointMapOutputSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('CodeTipOutputSchema', () => {
    it('should validate a valid code tip', () => {
      const validData = {
        title: 'Debounce function in JavaScript',
        description:
          'A utility function to limit the rate of function calls, useful for handling user input',
        code: 'function debounce(fn, delay) {\n  let timeoutId;\n  return (...args) => {\n    clearTimeout(timeoutId);\n    timeoutId = setTimeout(() => fn(...args), delay);\n  };\n}',
        language: 'javascript',
        tags: ['utility', 'performance', 'debounce'],
        quality: 85,
        useCase: 'Search input optimization',
        caveats: ['Does not work with async functions'],
      };

      const result = CodeTipOutputSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject quality score out of range', () => {
      const invalidData = {
        title: 'Test Tip',
        description: 'A test code tip description',
        code: 'console.log("test")',
        language: 'javascript',
        tags: ['test'],
        quality: 150, // Invalid: > 100
      };

      const result = CodeTipOutputSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('parseJSONFromLLM', () => {
    it('should parse plain JSON', () => {
      const jsonStr = '{"key": "value", "number": 42}';
      const result = parseJSONFromLLM<{ key: string; number: number }>(jsonStr);
      expect(result).toEqual({ key: 'value', number: 42 });
    });

    it('should parse JSON from markdown code block', () => {
      const markdownJson = '```json\n{"key": "value"}\n```';
      const result = parseJSONFromLLM<{ key: string }>(markdownJson);
      expect(result).toEqual({ key: 'value' });
    });

    it('should parse JSON from code block without language', () => {
      const codeBlock = '```\n{"key": "value"}\n```';
      const result = parseJSONFromLLM<{ key: string }>(codeBlock);
      expect(result).toEqual({ key: 'value' });
    });

    it('should extract JSON from mixed text', () => {
      const mixedText =
        'Here is the result:\n{"key": "value"}\nEnd of response.';
      const result = parseJSONFromLLM<{ key: string }>(mixedText);
      expect(result).toEqual({ key: 'value' });
    });

    it('should throw on invalid JSON', () => {
      const invalidJson = 'not valid json at all';
      expect(() => parseJSONFromLLM(invalidJson)).toThrow(
        'Failed to parse JSON from LLM response'
      );
    });
  });

  describe('createCodeHash', () => {
    it('should create consistent hash for same code', () => {
      const code = 'function test() { return true; }';
      const hash1 = createCodeHash(code);
      const hash2 = createCodeHash(code);
      expect(hash1).toBe(hash2);
    });

    it('should normalize whitespace', () => {
      const code1 = 'function test() {\n  return true;\n}';
      const code2 = 'function test() {  return true;  }';
      const hash1 = createCodeHash(code1);
      const hash2 = createCodeHash(code2);
      expect(hash1).toBe(hash2);
    });

    it('should create different hashes for different code', () => {
      const code1 = 'function test1() { return true; }';
      const code2 = 'function test2() { return false; }';
      const hash1 = createCodeHash(code1);
      const hash2 = createCodeHash(code2);
      expect(hash1).not.toBe(hash2);
    });

    it('should return string hash', () => {
      const code = 'const x = 1;';
      const hash = createCodeHash(code);
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });
  });
});
