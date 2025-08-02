import { calculateQualityScore, determineDifficulty, checkCategoryQuality } from '@/lib/utils/quality-score';
import { createMockArticle, createMockSource, createMockTag } from '../../__mocks__/prisma';
import type { ArticleWithDetails } from '@/types/models';

describe('calculateQualityScore', () => {
  describe('タグの質と量の評価', () => {
    it('5個以上の技術タグで30点を付与', () => {
      const article = {
        ...createMockArticle(),
        source: createMockSource(),
        tags: [
          createMockTag({ name: 'React' }),
          createMockTag({ name: 'TypeScript' }),
          createMockTag({ name: 'Next.js' }),
          createMockTag({ name: 'Jest' }),
          createMockTag({ name: 'Node.js' }),
        ],
      } as ArticleWithDetails;

      const score = calculateQualityScore(article);
      expect(score).toBeGreaterThanOrEqual(30);
    });

    it('3-4個の技術タグで25点を付与', () => {
      const article = {
        ...createMockArticle(),
        source: createMockSource(),
        tags: [
          createMockTag({ name: 'React' }),
          createMockTag({ name: 'TypeScript' }),
          createMockTag({ name: 'Next.js' }),
        ],
      } as ArticleWithDetails;

      const score = calculateQualityScore(article);
      expect(score).toBeGreaterThanOrEqual(25);
    });

    it('特定のタグ（AWS、SRE等）は技術タグとしてカウントしない', () => {
      const article = {
        ...createMockArticle(),
        source: createMockSource(),
        tags: [
          createMockTag({ name: 'AWS' }),
          createMockTag({ name: 'SRE' }),
          createMockTag({ name: 'React' }),
        ],
      } as ArticleWithDetails;

      const articleWithThreeTechTags = {
        ...createMockArticle(),
        source: createMockSource(),
        tags: [
          createMockTag({ name: 'React' }),
          createMockTag({ name: 'TypeScript' }),
          createMockTag({ name: 'Next.js' }),
        ],
      } as ArticleWithDetails;

      const score = calculateQualityScore(article);
      const scoreWithTechTags = calculateQualityScore(articleWithThreeTechTags);
      
      // AWS、SREタグを含む記事は技術タグ1個として10点
      // 技術タグ3個の記事は25点
      expect(scoreWithTechTags - score).toBeGreaterThan(10);
    });
  });

  describe('要約の充実度の評価', () => {
    it('60-120文字の要約で20点を付与', () => {
      const article = {
        ...createMockArticle({
          summary: 'これは理想的な長さの要約です。技術的な内容を含む詳細な説明が記載されており、読者にとって有益な情報が含まれています。',
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const score = calculateQualityScore(article);
      expect(score).toBeGreaterThanOrEqual(20);
    });

    it('40文字以上の要約で15点を付与', () => {
      const article = {
        ...createMockArticle({
          summary: 'これは中程度の長さの要約です。基本的な内容が含まれています。',
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const score = calculateQualityScore(article);
      expect(score).toBeGreaterThanOrEqual(15);
    });

    it('要約がない場合は要約点数なし', () => {
      const articleWithSummary = {
        ...createMockArticle({
          summary: 'これは中程度の長さの要約です。基本的な内容が含まれています。',
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const articleWithoutSummary = {
        ...createMockArticle({
          summary: null,
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const scoreWithSummary = calculateQualityScore(articleWithSummary);
      const scoreWithoutSummary = calculateQualityScore(articleWithoutSummary);

      // 要約がある場合は少なくとも10点以上の差がある
      expect(scoreWithSummary - scoreWithoutSummary).toBeGreaterThanOrEqual(10);
    });
  });

  describe('ソースの信頼性の評価', () => {
    it('信頼性の高いソース（Qiita Popular）で20点を付与', () => {
      const article = {
        ...createMockArticle(),
        source: createMockSource({ name: 'Qiita Popular' }),
        tags: [],
      } as ArticleWithDetails;

      const score = calculateQualityScore(article);
      expect(score).toBeGreaterThanOrEqual(20);
    });

    it('中程度の信頼性のソース（Dev.to）で15点を付与', () => {
      const article = {
        ...createMockArticle(),
        source: createMockSource({ name: 'Dev.to' }),
        tags: [],
      } as ArticleWithDetails;

      const score = calculateQualityScore(article);
      expect(score).toBeGreaterThanOrEqual(15);
    });

    it('未知のソースで10点を付与', () => {
      const article = {
        ...createMockArticle(),
        source: createMockSource({ name: 'Unknown Source' }),
        tags: [],
      } as ArticleWithDetails;

      const score = calculateQualityScore(article);
      expect(score).toBeGreaterThanOrEqual(10);
    });
  });

  describe('新鮮さの評価', () => {
    it('1日以内の記事で15点を付与', () => {
      const article = {
        ...createMockArticle({
          publishedAt: new Date(),
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const score = calculateQualityScore(article);
      expect(score).toBeGreaterThanOrEqual(15);
    });

    it('3日以内の記事で12点を付与', () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      
      const article = {
        ...createMockArticle({
          publishedAt: twoDaysAgo,
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const score = calculateQualityScore(article);
      expect(score).toBeGreaterThanOrEqual(12);
    });

    it('14日より古い記事では新鮮さ点数なし', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30);
      
      const oldArticle = {
        ...createMockArticle({
          publishedAt: oldDate,
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const newArticle = {
        ...createMockArticle({
          publishedAt: new Date(),
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const oldScore = calculateQualityScore(oldArticle);
      const newScore = calculateQualityScore(newArticle);

      // 新しい記事は古い記事より15点高い（新鮮さの満点）
      expect(newScore - oldScore).toBe(15);
    });
  });

  describe('エンゲージメントの評価', () => {
    it('500以上のブックマークで15点を付与', () => {
      const article = {
        ...createMockArticle({
          bookmarks: 600,
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const score = calculateQualityScore(article);
      expect(score).toBeGreaterThanOrEqual(15);
    });

    it('100-199のブックマークで10点を付与', () => {
      const article = {
        ...createMockArticle({
          bookmarks: 150,
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const score = calculateQualityScore(article);
      expect(score).toBeGreaterThanOrEqual(10);
    });

    it('ブックマークがない場合はエンゲージメント点数なし', () => {
      const articleWithBookmarks = {
        ...createMockArticle({
          bookmarks: 20,
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const articleWithoutBookmarks = {
        ...createMockArticle({
          bookmarks: 0,
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const scoreWith = calculateQualityScore(articleWithBookmarks);
      const scoreWithout = calculateQualityScore(articleWithoutBookmarks);

      // ブックマーク20の記事は5点のボーナス
      expect(scoreWith - scoreWithout).toBe(5);
    });
  });

  describe('タイトルの質（減点方式）', () => {
    it('クリックベイトタイトルで10点減点', () => {
      const normalArticle = {
        ...createMockArticle({
          title: '正常なタイトル',
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const clickbaitArticle = {
        ...createMockArticle({
          title: '10個の驚くべきReactテクニック',
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const normalScore = calculateQualityScore(normalArticle);
      const clickbaitScore = calculateQualityScore(clickbaitArticle);

      expect(normalScore - clickbaitScore).toBe(10);
    });

    it('複数のクリックベイトパターンでも減点は10点まで', () => {
      const article = {
        ...createMockArticle({
          title: '絶対に知らないと損する10個の理由',
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const normalArticle = {
        ...createMockArticle({
          title: '正常なタイトル',
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const score = calculateQualityScore(article);
      const normalScore = calculateQualityScore(normalArticle);

      expect(normalScore - score).toBe(10);
    });
  });

  describe('ユーザー投票ボーナス', () => {
    it('ユーザー投票数×2点を付与（最大20点）', () => {
      const article = {
        ...createMockArticle({
          userVotes: 5,
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const score = calculateQualityScore(article);
      expect(score).toBeGreaterThanOrEqual(10); // 5 * 2 = 10点
    });

    it('ユーザー投票ボーナスは最大20点まで', () => {
      const article = {
        ...createMockArticle({
          userVotes: 15, // 15 * 2 = 30だが、最大20点
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const articleWithManyVotes = {
        ...createMockArticle({
          userVotes: 20,
        }),
        source: createMockSource(),
        tags: [],
      } as ArticleWithDetails;

      const score1 = calculateQualityScore(article);
      const score2 = calculateQualityScore(articleWithManyVotes);

      expect(score2 - score1).toBe(0); // どちらも最大20点
    });
  });

  describe('スコアの範囲', () => {
    it('スコアは0-100の範囲に収まる', () => {
      const perfectArticle = {
        ...createMockArticle({
          publishedAt: new Date(),
          summary: 'これは理想的な長さの要約です。技術的な内容を含む詳細な説明が記載されており、読者にとって有益な情報が含まれています。',
          bookmarks: 1000,
          userVotes: 20,
        }),
        source: createMockSource({ name: 'Qiita Popular' }),
        tags: [
          createMockTag({ name: 'React' }),
          createMockTag({ name: 'TypeScript' }),
          createMockTag({ name: 'Next.js' }),
          createMockTag({ name: 'Jest' }),
          createMockTag({ name: 'Node.js' }),
        ],
      } as ArticleWithDetails;

      const score = calculateQualityScore(perfectArticle);
      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('最低品質の記事でもスコアは0以上', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 365);

      const worstArticle = {
        ...createMockArticle({
          publishedAt: oldDate,
          summary: null,
          bookmarks: 0,
          userVotes: 0,
          title: '絶対に知らないと損する理由',
        }),
        source: createMockSource({ name: 'Unknown' }),
        tags: [],
      } as ArticleWithDetails;

      const score = calculateQualityScore(worstArticle);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('境界値テスト', () => {
    it('タグ数の境界値（1, 2, 3, 5個）で正しいスコア', () => {
      const testCases = [
        { tagCount: 0, expectedMinScore: 0 },
        { tagCount: 1, expectedMinScore: 10 },
        { tagCount: 2, expectedMinScore: 15 },
        { tagCount: 3, expectedMinScore: 25 },
        { tagCount: 5, expectedMinScore: 30 },
      ];

      testCases.forEach(({ tagCount, expectedMinScore }) => {
        const tags = Array.from({ length: tagCount }, (_, i) => 
          createMockTag({ name: `Tech${i}` })
        );

        const article = {
          ...createMockArticle(),
          source: createMockSource(),
          tags,
        } as ArticleWithDetails;

        const score = calculateQualityScore(article);
        expect(score).toBeGreaterThanOrEqual(expectedMinScore);
      });
    });

    it('ブックマーク数の境界値で正しいスコア', () => {
      const testCases = [
        { bookmarks: 0, expectedBonus: 0 },
        { bookmarks: 1, expectedBonus: 2 },
        { bookmarks: 20, expectedBonus: 5 },
        { bookmarks: 50, expectedBonus: 8 },
        { bookmarks: 100, expectedBonus: 10 },
        { bookmarks: 200, expectedBonus: 12 },
        { bookmarks: 500, expectedBonus: 15 },
      ];

      testCases.forEach(({ bookmarks, expectedBonus }) => {
        const article = {
          ...createMockArticle({ bookmarks }),
          source: createMockSource(),
          tags: [],
        } as ArticleWithDetails;

        const baseArticle = {
          ...createMockArticle({ bookmarks: 0 }),
          source: createMockSource(),
          tags: [],
        } as ArticleWithDetails;

        const score = calculateQualityScore(article);
        const baseScore = calculateQualityScore(baseArticle);

        expect(score - baseScore).toBe(expectedBonus);
      });
    });
  });
});

describe('determineDifficulty', () => {
  it('上級者向けキーワードが多い記事をadvancedと判定', () => {
    const article = {
      ...createMockArticle({
        title: 'マイクロサービスアーキテクチャの設計パターン',
        content: 'Kubernetesを使用した分散システムのスケーラビリティ最適化について解説します。',
      }),
      source: createMockSource(),
      tags: [
        createMockTag({ name: 'kubernetes' }),
        createMockTag({ name: 'アーキテクチャ' }),
      ],
    } as ArticleWithDetails;

    const difficulty = determineDifficulty(article);
    expect(difficulty).toBe('advanced');
  });

  it('初心者向けキーワードが多い記事をbeginnerと判定', () => {
    const article = {
      ...createMockArticle({
        title: 'React入門：はじめてのHello World',
        content: '基本的なセットアップ方法とインストール手順を解説します。',
      }),
      source: createMockSource(),
      tags: [
        createMockTag({ name: '入門' }),
        createMockTag({ name: 'tutorial' }),
      ],
    } as ArticleWithDetails;

    const difficulty = determineDifficulty(article);
    expect(difficulty).toBe('beginner');
  });

  it('中間的な記事をintermediateと判定', () => {
    const article = {
      ...createMockArticle({
        title: 'Reactのカスタムフックを作ってみよう',
        content: 'useStateとuseEffectを組み合わせた実装例を紹介します。',
      }),
      source: createMockSource(),
      tags: [
        createMockTag({ name: 'React' }),
        createMockTag({ name: 'Hooks' }),
      ],
    } as ArticleWithDetails;

    const difficulty = determineDifficulty(article);
    expect(difficulty).toBe('intermediate');
  });

  it('コードブロックが多い記事は難易度が上がる', () => {
    const article = {
      ...createMockArticle({
        title: '実装例',
        content: '```javascript\ncode1\n```\n```javascript\ncode2\n```\n```javascript\ncode3\n```\n```javascript\ncode4\n```\n```javascript\ncode5\n```\n```javascript\ncode6\n```',
      }),
      source: createMockSource(),
      tags: [],
    } as ArticleWithDetails;

    const difficulty = determineDifficulty(article);
    expect(difficulty).not.toBe('beginner');
  });

  it('長い記事は難易度が上がる', () => {
    const longContent = 'a'.repeat(6000);
    const article = {
      ...createMockArticle({
        title: '詳細解説',
        content: longContent,
      }),
      source: createMockSource(),
      tags: [],
    } as ArticleWithDetails;

    const difficulty = determineDifficulty(article);
    expect(difficulty).not.toBe('beginner');
  });
});

describe('checkCategoryQuality', () => {
  it('AI/ML記事でコード例がある場合10点ボーナス', () => {
    const article = {
      ...createMockArticle({
        content: '```python\nimport tensorflow as tf\n```',
      }),
      source: createMockSource(),
      tags: [
        createMockTag({ name: 'AI' }),
        createMockTag({ name: '機械学習' }),
      ],
    } as ArticleWithDetails;

    const result = checkCategoryQuality(article);
    expect(result.category).toBe('AI/ML');
    expect(result.qualityBonus).toBe(10);
  });

  it('セキュリティ記事でCVE番号がある場合10点ボーナス', () => {
    const article = {
      ...createMockArticle({
        content: '脆弱性CVE-2024-1234の対策について説明します。',
      }),
      source: createMockSource(),
      tags: [
        createMockTag({ name: 'セキュリティ' }),
      ],
    } as ArticleWithDetails;

    const result = checkCategoryQuality(article);
    expect(result.category).toBe('Security');
    expect(result.qualityBonus).toBe(10);
  });

  it('チュートリアル記事でステップ説明がある場合10点ボーナス', () => {
    const article = {
      ...createMockArticle({
        content: '1. まず環境をセットアップ\n2. 次にコードを実装\n3. 最後にテスト',
      }),
      source: createMockSource(),
      tags: [
        createMockTag({ name: 'tutorial' }),
      ],
    } as ArticleWithDetails;

    const result = checkCategoryQuality(article);
    expect(result.category).toBe('Tutorial');
    expect(result.qualityBonus).toBe(10);
  });

  it('カテゴリに該当しない記事はnullとボーナス0', () => {
    const article = {
      ...createMockArticle(),
      source: createMockSource(),
      tags: [
        createMockTag({ name: 'JavaScript' }),
      ],
    } as ArticleWithDetails;

    const result = checkCategoryQuality(article);
    expect(result.category).toBeNull();
    expect(result.qualityBonus).toBe(0);
  });

  it('コンテンツがない場合はボーナスなし', () => {
    const article = {
      ...createMockArticle({
        content: null,
      }),
      source: createMockSource(),
      tags: [
        createMockTag({ name: 'AI' }),
      ],
    } as ArticleWithDetails;

    const result = checkCategoryQuality(article);
    expect(result.category).toBe('AI/ML');
    expect(result.qualityBonus).toBe(0);
  });
});