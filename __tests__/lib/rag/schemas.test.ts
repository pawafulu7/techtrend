/**
 * RAG 検索オプションの検証（lib/rag/schemas.ts）
 */

import { describe, it, expect } from '@jest/globals';
import { searchOptionsSchema } from '@/lib/rag/schemas';

describe('searchOptionsSchema', () => {
  it('省略した項目に既定値を入れる', () => {
    expect(searchOptionsSchema.parse({})).toEqual({
      topK: 10,
      similarityThreshold: 0.5,
      embeddingKey: 'summary',
      recencyBoost: 0,
    });
  });

  describe('sourceIds', () => {
    it('Source の ID（cuid ではない slug）を受け付け、前後の空白を除く', () => {
      const result = searchOptionsSchema.parse({
        sourceIds: [
          'qiita',
          'dena_tech_blog',
          'cookpad_tech_blog',
          ' cncf_blog ',
        ],
      });

      expect(result.sourceIds).toEqual([
        'qiita',
        'dena_tech_blog',
        'cookpad_tech_blog',
        'cncf_blog',
      ]);
    });

    it.each([
      ['記号を含む', `qiita'; DROP TABLE "Article"; --`],
      ['空白だけ', '   '],
      ['101 文字', 'a'.repeat(101)],
    ])('%s ID は文言つきで弾く', (_label, id) => {
      const result = searchOptionsSchema.safeParse({ sourceIds: [id] });

      expect(result.success).toBe(false);
      expect(result.error?.issues).toEqual([
        expect.objectContaining({
          path: ['sourceIds', 0],
          message: 'Invalid source ID format',
        }),
      ]);
    });
  });

  describe('dateRange', () => {
    it('UTC の ISO 8601 を受け付ける', () => {
      const dateRange = {
        from: '2025-10-18T00:00:00.000Z',
        to: '2025-10-25T23:59:59.999Z',
      };

      expect(searchOptionsSchema.parse({ dateRange }).dateRange).toEqual(
        dateRange
      );
    });

    it('from が to より後なら dateRange の項目に文言を返す', () => {
      const result = searchOptionsSchema.safeParse({
        dateRange: {
          from: '2025-10-25T00:00:00.000Z',
          to: '2025-10-18T00:00:00.000Z',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues).toEqual([
        expect.objectContaining({
          path: ['dateRange'],
          message: 'dateRange.from must be before or equal to dateRange.to',
        }),
      ]);
    });
  });
});
