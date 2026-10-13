/**
 * agent-search のリクエスト検証（schemas.ts）
 *
 * route.ts は検証エラーの issue を { field: path.join('.'), message } に変えて
 * details に入れて返す。その元になる issue の path と文言を確かめる。
 */

import { describe, it, expect } from '@jest/globals';
import {
  agentRequestSchema,
  agentTypeSchema,
} from '@/app/api/rag/agent-search/schemas';

describe('agentRequestSchema', () => {
  it('article-qa で articleId が無ければ articleId の項目に文言を返す', () => {
    const result = agentRequestSchema.safeParse({
      agentType: 'article-qa',
      query: 'React の使い方',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        code: 'custom',
        path: ['articleId'],
        message: 'articleId is required for article-qa mode',
      }),
    ]);
  });

  it('空白だけの query は、整形した後の文言を query の項目に返す', () => {
    const result = agentRequestSchema.safeParse({ query: '   ' });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        code: 'custom',
        path: ['query'],
        message: 'Query cannot be empty after sanitization',
      }),
    ]);
  });

  it('500 文字を超える query は指定した文言を返す', () => {
    const result = agentRequestSchema.safeParse({ query: 'a'.repeat(501) });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ['query'],
      message: 'Query too long (max 500 characters)',
    });
  });

  it('agentType を省略すると article-search になる', () => {
    expect(agentRequestSchema.parse({ query: ' React ' })).toEqual({
      agentType: 'article-search',
      query: 'React',
    });
    expect(agentTypeSchema.parse({})).toEqual({ agentType: 'article-search' });
  });

  it('articleId は cuid の形式だけを受け付ける', () => {
    const query = 'React の使い方';

    expect(
      agentRequestSchema.safeParse({
        agentType: 'article-qa',
        query,
        articleId: 'cmabc12345xyz',
      }).success
    ).toBe(true);
    expect(
      agentRequestSchema.safeParse({
        agentType: 'article-qa',
        query,
        articleId: 'not a cuid',
      }).success
    ).toBe(false);
  });
});
