import { calculateQualityScore, checkCategoryQuality } from '@/lib/utils/quality-score';
import { createMockArticle, createMockSource, createMockTag } from '../../__mocks__/prisma';

describe('calculateQualityScore', () => {
  it('高品質な記事に高いスコアを付与する', () => {
    const article = {
      ...createMockArticle({
        publishedAt: new Date(), // 本日
        summary: 'これは60文字以上の要約です。技術的な内容を含む詳細な説明が記載されています。',
        bookmarks: 150,
      }),
      source: createMockSource({ name: 'Qiita Popular' }),
      tags: [
        createMockTag({ name: 'React' }),
        createMockTag({ name: 'TypeScript' }),
        createMockTag({ name: 'Next.js' }),
        createMockTag({ name: 'フロントエンド' }),
        createMockTag({ name: 'パフォーマンス' }),
      ],
    };

    const score = calculateQualityScore(article);
    expect(score).toBeGreaterThanOrEqual(80); // 高スコア
  });

  it('低品質な記事に低いスコアを付与する', () => {
    const article = {
      ...createMockArticle({
        publishedAt: new Date('2023-01-01'), // 1年以上前
        summary: '短い要約',
        bookmarks: 0,
      }),
      source: createMockSource({ name: 'Unknown Source' }),
      tags: [],
    };

    const score = calculateQualityScore(article);
    expect(score).toBeLessThan(30); // 低スコア
  });

  it('タグの質と量を正しく評価する', () => {
    const articleWithManyTags = {
      ...createMockArticle(),
      source: createMockSource(),
      tags: [
        createMockTag({ name: 'JavaScript' }),
        createMockTag({ name: 'Node.js' }),
        createMockTag({ name: 'Express' }),
        createMockTag({ name: 'MongoDB' }),
        createMockTag({ name: 'REST API' }),
      ],
    };

    const articleWithFewTags = {
      ...createMockArticle(),
      source: createMockSource(),
      tags: [createMockTag({ name: 'JavaScript' })],
    };

    const scoreMany = calculateQualityScore(articleWithManyTags);
    const scoreFew = calculateQualityScore(articleWithFewTags);

    expect(scoreMany).toBeGreaterThan(scoreFew);
  });

  it('ソースの信頼性を正しく評価する', () => {
    const trustedArticle = {
      ...createMockArticle(),
      source: createMockSource({ name: 'AWS' }),
      tags: [],
    };

    const untrustedArticle = {
      ...createMockArticle(),
      source: createMockSource({ name: 'Unknown Blog' }),
      tags: [],
    };

    const trustedScore = calculateQualityScore(trustedArticle);
    const untrustedScore = calculateQualityScore(untrustedArticle);

    expect(trustedScore).toBeGreaterThan(untrustedScore);
  });
});

describe('checkCategoryQuality', () => {
  it('高品質カテゴリの記事を識別する', () => {
    const article = {
      ...createMockArticle({
        content: 'import React from "react";\n\nコードサンプルを含む記事です。',
      }),
      source: createMockSource(),
      tags: [
        createMockTag({ name: 'AI' }),
        createMockTag({ name: '機械学習' }),
      ],
    };

    const result = checkCategoryQuality(article);
    expect(result.category).toBe('AI/ML');
    expect(result.qualityBonus).toBe(10);
  });

  it('カテゴリに該当しない記事を処理する', () => {
    const article = {
      ...createMockArticle(),
      source: createMockSource({ name: 'AWS' }),
      tags: [
        createMockTag({ name: 'EC2' }),
        createMockTag({ name: 'Lambda' }),
      ],
    };

    const result = checkCategoryQuality(article);
    expect(result.category).toBeNull();
    expect(result.qualityBonus).toBe(0);
  });
});