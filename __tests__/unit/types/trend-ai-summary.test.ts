import { TrendAiSummarySchema, extractFirstJsonObject } from '@/lib/types/trend-ai-summary';

describe('trend-ai-summary', () => {
  describe('extractFirstJsonObject', () => {
    it('parses direct JSON', () => {
      const obj = extractFirstJsonObject('{"a":1,"b":"c"}');
      expect(obj).toEqual({ a: 1, b: 'c' });
    });

    it('parses JSON inside code fences', () => {
      const obj = extractFirstJsonObject('```json\n{"a":1}\n```');
      expect(obj).toEqual({ a: 1 });
    });

    it('parses JSON with surrounding text', () => {
      const obj = extractFirstJsonObject('Here you go:\n{"a":1,"b":2}\nThanks');
      expect(obj).toEqual({ a: 1, b: 2 });
    });

    it('parses JSON with trailing commas', () => {
      const obj = extractFirstJsonObject('{"a":1,"b":2,}');
      expect(obj).toEqual({ a: 1, b: 2 });
    });
  });

  describe('TrendAiSummarySchema', () => {
    it('accepts v2 summary', () => {
      const candidate = {
        version: 'trend_ai_summary_v2',
        core: 'Gemini 2.0発表でマルチモーダルAI開発が加速。',
        keyTopics: [
          {
            topic: 'Gemini 2.0',
            whatHappened: '新モデル発表や周辺ツールの更新が話題になっている。',
            whyItMatters: '画像/音声/テキストを跨いだ実装の設計判断が増えるため。',
            evidenceArticleIds: ['a1'],
          },
        ],
        trendChanges: {
          available: false,
          basis: { periodLabel: '前日', date: '2025-01-01' },
          new: [],
          rising: [],
          falling: [],
          summary: '前期間データがないため変化は算出できない。',
        },
        actions: [
          {
            action: 'まずは上位記事から概要を把握する',
            reason: '判断に必要な前提と用語を最短で揃えられる。',
            articleIds: ['a1'],
          },
        ],
        numbers: [{ label: '記事総数', value: '10' }],
        notes: ['サンプル'],
      };

      const parsed = TrendAiSummarySchema.safeParse(candidate);
      expect(parsed.success).toBe(true);
    });
  });
});

