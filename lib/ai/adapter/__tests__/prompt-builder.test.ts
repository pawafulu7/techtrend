import { PromptBuilder } from '../prompt-builder';
import { SummaryProviderInput } from '../summary-provider.interface';
import {
  SUMMARY_LENGTH,
  getItemCountRule,
  getDetailLengthBand,
} from '../../constants';
import { SummaryQualityChecker } from '../../service/quality-checker';

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
      expect(prompt).toContain('<<<ARTICLE_START>>>');
      expect(prompt).toContain('<<<ARTICLE_END>>>');
      // SYSTEM_INSTRUCTIONS should contain core rules
      expect(prompt).toContain('summaryフィールド');
      expect(prompt).toContain('detailedSummaryItemsフィールド');
      expect(prompt).toContain('タグ正規化ルール');
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

      expect(prompt).toContain('トーン: フォーマル');
      expect(prompt).toContain('専門的で正確な用語');
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

      expect(prompt).toContain('記事タイプ: 技術記事');
      expect(prompt).toContain('実装の詳細');
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

      expect(prompt).toContain('12000文字（非常に長い）');
      expect(prompt).toContain('detailedSummaryItems: 7-9項目');
      expect(prompt).toContain('120-180文字');
      expect(prompt).toContain(
        'IMPORTANT: The above metadata is for your reference only'
      );
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

      expect(prompt).toContain('7000文字（長い）');
      expect(prompt).toContain('detailedSummaryItems: 5-7項目');
      expect(prompt).toContain('120-200文字');
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

      expect(prompt).toContain('4000文字');
      expect(prompt).toContain('detailedSummaryItems: 4-5項目');
      expect(prompt).toContain('150-200文字');
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

      expect(prompt).toContain('1500文字');
      expect(prompt).toContain('detailedSummaryItems: 3-4項目');
      expect(prompt).toContain('130-175文字');
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

      expect(prompt).toContain('500文字（短い）');
      expect(prompt).toContain('detailedSummaryItems: 2-3項目');
      expect(prompt).toContain('80-200文字');
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

      expect(prompt).toContain('200文字（非常に短い）');
      expect(prompt).toContain('空配列[]');
      expect(prompt).toContain('summaryフィールドの作成のみに集中');
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

      expect(prompt).toContain('detailedSummaryItems: 6-8項目');
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

      // short policy: min=max(5, floor(5*0.8))=5, max=max(5, floor(7*0.8))=5
      expect(prompt).toContain('detailedSummaryItems: 5-5項目');
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

      expect(prompt).toContain('detailedSummaryItems: 5-7項目');
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

      expect(prompt).toContain('トーン: フォーマル');
      expect(prompt).toContain('専門的で正確な用語を使用');
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

      expect(prompt).toContain('トーン: カジュアル');
      expect(prompt).toContain('親しみやすく分かりやすい表現');
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

      expect(prompt).not.toContain('トーン:');
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

      expect(prompt).toContain('記事タイプ: 技術記事');
      expect(prompt).toContain('実装の詳細、仕様');
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

      expect(prompt).toContain('記事タイプ: ニュース');
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

      expect(prompt).toContain('記事タイプ: チュートリアル');
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

      expect(prompt).toContain('記事タイプ: オピニオン');
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

      expect(prompt).not.toContain('記事タイプ:');
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

      expect(prompt).toContain('...[truncated]');
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
      expect(prompt).not.toContain('...[truncated]');
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
      expect(prompt).toContain('トーン: フォーマル');
      expect(prompt).toContain('記事タイプ: 技術記事');
      expect(prompt).toContain('5000文字（長い）');
      // long policy on 5000-9999: min=max(5,floor(5*1.2))=6, max=max(6,floor(7*1.2))=8
      expect(prompt).toContain('detailedSummaryItems: 6-8項目');
    });
  });

  /**
   * プロンプトの指示と品質チェックの閾値がずれると、
   * 「指示に忠実な出力ほど減点される」状態になる。
   * 過去に 150-250文字 と指示しながら上限200文字で減点していた実績があるため、
   * 両者が同一の定数から導出されていることをテストで固定する。
   */
  describe('指示と品質チェックの整合性', () => {
    const input = (content: string): SummaryProviderInput => ({
      title: 'T',
      content,
      constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
      requestId: 'consistency',
    });

    it('プロンプトが提示する目標帯が SUMMARY_LENGTH の target と一致する', () => {
      const prompt = new PromptBuilder().buildPrompt(input('x'.repeat(5000)));
      expect(prompt).toContain(
        `${SUMMARY_LENGTH.targetMin}-${SUMMARY_LENGTH.targetMax}文字`
      );
    });

    it('目標帯の下限ちょうどの要約は減点されない', () => {
      const checker = new SummaryQualityChecker();
      const summary = 'あ'.repeat(SUMMARY_LENGTH.targetMin);
      const result = checker.checkQuality(summary, 'い'.repeat(800), {
        totalLength: 5000,
        contentLength: 5000,
      } as never);

      expect(result.issues.filter((i) => i.type === 'length')).toEqual([]);
    });

    it('目標帯を下回っても減点しきい値(penaltyMin)以上なら減点されない', () => {
      // 目標帯(150-250)を減点しきい値に流用すると、ここが減点されてしまう。
      // 減点は明確な外れ値だけに限定する。
      const checker = new SummaryQualityChecker();
      const summary = 'あ'.repeat(SUMMARY_LENGTH.penaltyMin + 10);
      const result = checker.checkQuality(summary, 'い'.repeat(800), {
        totalLength: 5000,
        contentLength: 5000,
      } as never);

      expect(result.issues.filter((i) => i.type === 'length')).toEqual([]);
    });

    it('減点しきい値を下回る要約は減点される', () => {
      const checker = new SummaryQualityChecker();
      const summary = 'あ'.repeat(SUMMARY_LENGTH.penaltyMin - 1);
      const result = checker.checkQuality(summary, 'い'.repeat(800), {
        totalLength: 5000,
        contentLength: 5000,
      } as never);

      expect(result.issues.some((i) => i.type === 'length')).toBe(true);
    });

    it('目標帯の上限ちょうどの要約は減点されない', () => {
      const checker = new SummaryQualityChecker();
      const summary = 'あ'.repeat(SUMMARY_LENGTH.targetMax);
      // contentLength 5000 の詳細要約は 600-1200文字が想定範囲
      const result = checker.checkQuality(summary, 'い'.repeat(800), {
        totalLength: 5000,
        contentLength: 5000,
      } as never);

      expect(result.issues.filter((i) => i.type === 'length')).toEqual([]);
    });

    it('各帯域で totalMin は減点されず totalMax 超過は減点される', () => {
      const checker = new SummaryQualityChecker();
      const summary = 'あ'.repeat(SUMMARY_LENGTH.targetMin);
      for (const contentLength of [500, 1500, 3500, 6000, 12000]) {
        const band = getDetailLengthBand(contentLength);
        const analysis = {
          totalLength: contentLength,
          contentLength,
        } as never;

        const atMin = checker.checkQuality(
          summary,
          'い'.repeat(band!.totalMin),
          analysis
        );
        expect(
          atMin.issues.filter(
            (i) => i.type === 'length' && i.message.includes('詳細要約')
          )
        ).toEqual([]);

        const overMax = checker.checkQuality(
          summary,
          'い'.repeat(band!.totalMax + 1),
          analysis
        );
        expect(
          overMax.issues.some(
            (i) => i.type === 'length' && i.message.includes('詳細要約が長すぎる')
          )
        ).toBe(true);
      }
    });

    it('プロンプトの詳細要約長の指示が quality-checker の帯域と一致する', () => {
      for (const contentLength of [500, 1500, 3500, 6000, 12000]) {
        const prompt = new PromptBuilder().buildPrompt(
          input('x'.repeat(contentLength))
        );
        const band = getDetailLengthBand(contentLength);
        expect(prompt).toContain(
          `detailedSummaryItems全体の合計は${band?.totalMin}文字以上${band?.totalMax}文字以内`
        );
      }
    });

    it('プロンプトの項目数指示が quality-checker と同じルールから導出される', () => {
      for (const contentLength of [500, 1500, 3500, 6000, 12000]) {
        const prompt = new PromptBuilder().buildPrompt(
          input('x'.repeat(contentLength))
        );
        const rule = getItemCountRule(contentLength, 'medium');
        expect(prompt).toContain(
          `detailedSummaryItems: ${rule.recommendedItems}項目`
        );
      }
    });
  });
});
