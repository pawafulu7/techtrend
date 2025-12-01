import { PromptBuilder } from '../prompt-builder';
import { SummaryProviderInput } from '../summary-provider.interface';

describe('PromptBuilder', () => {
  let builder: PromptBuilder;

  beforeEach(() => {
    builder = new PromptBuilder();
  });

  describe('基本的なプロンプト生成', () => {
    it('should build prompt with minimum required fields', () => {
      const input: SummaryProviderInput = {
        title: 'Test Article',
        content: 'Test content',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-123',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('タイトル: Test Article');
      expect(prompt).toContain('内容: Test content');
      expect(prompt).toContain('要約:');
      expect(prompt).toContain('詳細要約:');
      expect(prompt).toContain('カテゴリ:');
      expect(prompt).toContain('タグ:');
    });

    it('should include tone guidance when specified', () => {
      const input: SummaryProviderInput = {
        title: 'Formal Article',
        content: 'Content',
        tone: 'formal',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-formal',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('【トーン指定】フォーマルな表現で作成してください');
    });

    it('should include article type guidance when specified', () => {
      const input: SummaryProviderInput = {
        title: 'Technical Article',
        content: 'Content',
        articleType: 'technical',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-tech',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('【記事タイプ】技術解説記事として');
    });
  });

  describe('コンテンツ長による条件分岐', () => {
    it('should generate instructions for very long content (10000+ chars)', () => {
      const longContent = 'a'.repeat(12000);
      const input: SummaryProviderInput = {
        title: 'Long Article',
        content: longContent,
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-long',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('INTERNAL METADATA');
      expect(prompt).toContain('very long article');
      expect(prompt).toContain('target 1000-1300 characters');
      expect(prompt).toContain('MUST be at least');
      expect(prompt).toContain('7-9 items only');
      expect(prompt).toContain('do not exceed 9 items');
      expect(prompt).toContain('CRITICAL: Each item MUST be at least 150 characters');
      expect(prompt).toContain('7 items x 150 chars');
    });

    it('should generate instructions for long content (5000-9999 chars)', () => {
      const longContent = 'a'.repeat(7000);
      const input: SummaryProviderInput = {
        title: 'Long Article',
        content: longContent,
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-5k',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('INTERNAL METADATA');
      expect(prompt).toContain('long article');
      expect(prompt).toContain('target 700-1000 characters');
      expect(prompt).toContain('MUST be at least');
      expect(prompt).toContain('5-7 items only');
      expect(prompt).toContain('do not exceed 7 items');
      expect(prompt).toContain('CRITICAL: Each item MUST be at least 120 characters');
      expect(prompt).toContain('5 items x 120 chars');
    });

    it('should generate instructions for medium content (3000-4999 chars)', () => {
      const mediumContent = 'a'.repeat(4000);
      const input: SummaryProviderInput = {
        title: 'Medium Article',
        content: mediumContent,
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-3k',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('INTERNAL METADATA');
      expect(prompt).toContain('4000 characters');
      expect(prompt).toContain('600-1000 characters');
      expect(prompt).toContain('4-5 items only');
      expect(prompt).toContain('do not exceed 5 items');
    });

    it('should generate instructions for short content (1000-2999 chars)', () => {
      const shortContent = 'a'.repeat(1500);
      const input: SummaryProviderInput = {
        title: 'Short Article',
        content: shortContent,
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-1k',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('INTERNAL METADATA');
      expect(prompt).toContain('1500 characters');
      expect(prompt).toContain('400-700 characters');
      expect(prompt).toContain('3-4 items only');
      expect(prompt).toContain('do not exceed 4 items');
    });

    it('should generate instructions for short-medium content (400-999 chars)', () => {
      const shortMediumContent = 'a'.repeat(500);
      const input: SummaryProviderInput = {
        title: 'Short Medium',
        content: shortMediumContent,
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-short-medium',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('INTERNAL METADATA');
      expect(prompt).toContain('short article');
      expect(prompt).toContain('200-400 characters');
      expect(prompt).toContain('2-3 items only');
      expect(prompt).toContain('do not exceed 3 items');
    });

    it('should generate instructions for very short content (<400 chars)', () => {
      const veryShortContent = 'a'.repeat(200);
      const input: SummaryProviderInput = {
        title: 'Very Short',
        content: veryShortContent,
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-very-short',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('INTERNAL METADATA');
      expect(prompt).toContain('very short article');
      expect(prompt).toContain('Plain text format ONLY');
      expect(prompt).toContain('NO bullet points');
      expect(prompt).toContain('Maximum length: 300 characters');
    });
  });

  describe('DetailPolicy による調整', () => {
    it('should adjust item count for long policy', () => {
      const content = 'a'.repeat(6000);
      const input: SummaryProviderInput = {
        title: 'Article',
        content,
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'long',
        },
        requestId: 'test-long-policy',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('6-8 items only');
      expect(prompt).toContain('do not exceed 8 items');
    });

    it('should adjust item count for short policy', () => {
      const content = 'a'.repeat(6000);
      const input: SummaryProviderInput = {
        title: 'Article',
        content,
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'short',
        },
        requestId: 'test-short-policy',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('5-5 items only');
      expect(prompt).toContain('do not exceed 5 items');
    });

    it('should use default multiplier for medium policy', () => {
      const content = 'a'.repeat(6000);
      const input: SummaryProviderInput = {
        title: 'Article',
        content,
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-medium-policy',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('5-7 items only');
      expect(prompt).toContain('do not exceed 7 items');
    });
  });

  describe('トーン指定', () => {
    it('should add formal tone guidance', () => {
      const input: SummaryProviderInput = {
        title: 'Article',
        content: 'Content',
        tone: 'formal',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-formal',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('フォーマルな表現で作成してください');
      expect(prompt).toContain('専門的な用語を使用');
    });

    it('should add casual tone guidance', () => {
      const input: SummaryProviderInput = {
        title: 'Article',
        content: 'Content',
        tone: 'casual',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-casual',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('カジュアルな表現で作成してください');
      expect(prompt).toContain('親しみやすい文体');
    });

    it('should not add tone guidance when not specified', () => {
      const input: SummaryProviderInput = {
        title: 'Article',
        content: 'Content',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-no-tone',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).not.toContain('【トーン指定】');
    });
  });

  describe('記事タイプ指定', () => {
    it('should add technical article guidance', () => {
      const input: SummaryProviderInput = {
        title: 'Article',
        content: 'Content',
        articleType: 'technical',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-technical',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('技術解説記事として');
      expect(prompt).toContain('実装詳細、技術仕様');
    });

    it('should add news article guidance', () => {
      const input: SummaryProviderInput = {
        title: 'Article',
        content: 'Content',
        articleType: 'news',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-news',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('ニュース記事として');
      expect(prompt).toContain('発表内容、新機能');
    });

    it('should add tutorial article guidance', () => {
      const input: SummaryProviderInput = {
        title: 'Article',
        content: 'Content',
        articleType: 'tutorial',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-tutorial',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('チュートリアル記事として');
      expect(prompt).toContain('手順、実装方法');
    });

    it('should add opinion article guidance', () => {
      const input: SummaryProviderInput = {
        title: 'Article',
        content: 'Content',
        articleType: 'opinion',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-opinion',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('意見記事として');
      expect(prompt).toContain('著者の見解');
    });

    it('should not add article type guidance when not specified', () => {
      const input: SummaryProviderInput = {
        title: 'Article',
        content: 'Content',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-no-type',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).not.toContain('【記事タイプ】');
    });
  });

  describe('コンテンツの切り詰め', () => {
    it('should truncate content exceeding max length', () => {
      const veryLongContent = 'a'.repeat(200000);
      const input: SummaryProviderInput = {
        title: 'Huge Article',
        content: veryLongContent,
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-truncate',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('...[文字数制限により以下省略]');
      expect(prompt.length).toBeLessThan(veryLongContent.length);
    });

    it('should not truncate content within max length', () => {
      const normalContent = 'Normal content within limits';
      const input: SummaryProviderInput = {
        title: 'Normal Article',
        content: normalContent,
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-normal',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain(normalContent);
      expect(prompt).not.toContain('...[文字数制限により以下省略]');
    });
  });

  describe('複合条件', () => {
    it('should combine all optional parameters', () => {
      const input: SummaryProviderInput = {
        title: 'Complex Article',
        content: 'a'.repeat(5000),
        articleType: 'technical',
        tone: 'formal',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'long',
        },
        requestId: 'test-complex',
      };

      const prompt = builder.buildPrompt(input);

      expect(prompt).toContain('タイトル: Complex Article');
      expect(prompt).toContain('【トーン指定】フォーマル');
      expect(prompt).toContain('【記事タイプ】技術解説');
      expect(prompt).toContain('INTERNAL METADATA');
      expect(prompt).toContain('long article');
      expect(prompt).toContain('6-8 items only');
      expect(prompt).toContain('do not exceed 8 items');
    });
  });
});