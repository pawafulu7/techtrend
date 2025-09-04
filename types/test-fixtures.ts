/**
 * Test Data Fixtures with Proper Types
 * テストデータフィクスチャの型定義
 */

import type { User, Favorite, ArticleView } from '@prisma/client';
import type { Article, Source, Tag, ArticleWithRelations } from './prisma-override';

// テスト用の基本データ生成
export class TestFixtures {
  private static idCounter = 1;

  static resetIdCounter(): void {
    this.idCounter = 1;
  }

  static generateId(prefix: string = 'test'): string {
    return `${prefix}-${this.idCounter++}`;
  }

  static createArticle(overrides?: Partial<Article>): Article {
    const now = new Date();
    return {
      id: this.generateId('article'),
      title: 'Test Article Title',
      summary: 'This is a test article summary.',
      detailedSummary: 'This is a detailed test article summary with more information.',
      url: `https://example.com/article-${this.idCounter}`,
      thumbnail: null,
      content: null,
      publishedAt: now,
      sourceId: 'test-source',
      bookmarks: 0,
      qualityScore: 80,
      userVotes: 0,
      summaryVersion: 7,
      articleType: 'unified',
      difficulty: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  static createArticleWithRelations(overrides?: {
    // Article fields
    id?: string;
    title?: string;
    summary?: string | null;
    detailedSummary?: string | null;
    url?: string;
    thumbnail?: string | null;
    content?: string | null;
    publishedAt?: Date;
    sourceId?: string;
    qualityScore?: number | null;
    summaryVersion?: number | null;
    articleType?: string | null;
    difficulty?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    bookmarks?: number;
    userVotes?: number;
    // Relations
    source?: Source;
    tags?: Tag[];
  }): ArticleWithRelations {
    const { source: sourceOverride, tags: tagsOverride, ...articleOverrides } = overrides || {};
    const article = this.createArticle(articleOverrides as Partial<Article>);
    const source = sourceOverride || this.createSource({ id: article.sourceId });
    const tags = tagsOverride || [];
    
    return {
      ...article,
      source,
      tags,
    };
  }

  static createSource(overrides?: Partial<Source>): Source {
    const now = new Date();
    return {
      id: this.generateId('source'),
      name: 'Test Source',
      type: 'rss',
      url: `https://test-source-${this.idCounter}.com`,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  static createTag(overrides?: Partial<Tag>): Tag {
    return {
      id: this.generateId('tag'),
      name: `TestTag${this.idCounter}`,
      category: null,
      ...overrides,
    };
  }

  static createUser(overrides?: Partial<User>): User {
    const now = new Date();
    return {
      id: this.generateId('user'),
      email: `test${this.idCounter}@example.com`,
      name: `Test User ${this.idCounter}`,
      emailVerified: null,
      image: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  static createFavorite(overrides?: Partial<Favorite>): Favorite {
    const now = new Date();
    return {
      id: this.generateId('bookmark'),
      userId: 'test-user',
      articleId: 'test-article',
      createdAt: now,
      ...overrides,
    };
  }

  static createArticleView(overrides?: Partial<ArticleView>): ArticleView {
    const now = new Date();
    return {
      id: this.generateId('view'),
      userId: 'test-user',
      articleId: 'test-article',
      viewedAt: now,
      ...overrides,
    };
  }

  // 複数データの生成
  static createArticles(count: number, overrides?: Partial<Article>): Article[] {
    return Array.from({ length: count }, () => this.createArticle(overrides));
  }

  static createArticlesWithRelations(
    count: number, 
    overrides?: Parameters<typeof TestFixtures.createArticleWithRelations>[0]
  ): ArticleWithRelations[] {
    return Array.from({ length: count }, () => this.createArticleWithRelations(overrides));
  }

  static createSources(count: number, overrides?: Partial<Source>): Source[] {
    return Array.from({ length: count }, () => this.createSource(overrides));
  }

  static createTags(count: number, overrides?: Partial<Tag>): Tag[] {
    return Array.from({ length: count }, () => this.createTag(overrides));
  }

  // 特定のシナリオ用データ
  static createHighQualityArticle(): ArticleWithRelations {
    return this.createArticleWithRelations({
      qualityScore: 95,
      tags: [
        this.createTag({ name: 'React', category: 'framework' }),
        this.createTag({ name: 'TypeScript', category: 'language' }),
      ],
    });
  }

  static createLowQualityArticle(): ArticleWithRelations {
    return this.createArticleWithRelations({
      qualityScore: 30,
      tags: [],
    });
  }

  static createTrendingArticle(): ArticleWithRelations {
    return this.createArticleWithRelations({
      bookmarks: 150,
      userVotes: 200,
    });
  }

  static createRecentArticle(): ArticleWithRelations {
    return this.createArticleWithRelations({
      publishedAt: new Date(),
      createdAt: new Date(),
    });
  }

  static createOldArticle(): ArticleWithRelations {
    const oldDate = new Date();
    oldDate.setMonth(oldDate.getMonth() - 6);
    
    return this.createArticleWithRelations({
      publishedAt: oldDate,
      createdAt: oldDate,
    });
  }
}

// モックレスポンスの生成
export class MockResponses {
  static success<T>(data: T, message?: string) {
    return {
      success: true,
      data,
      message,
    };
  }

  static error(error: string, code?: string, details?: any) {
    return {
      success: false,
      error,
      code,
      details,
    };
  }

  static paginated<T>(data: T[], page: number = 1, limit: number = 20, total?: number) {
    const actualTotal = total || data.length;
    return {
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: actualTotal,
        totalPages: Math.ceil(actualTotal / limit),
      },
    };
  }

  static healthCheck(status: 'healthy' | 'unhealthy' = 'healthy') {
    return {
      status,
      database: status === 'healthy' ? 'connected' : 'disconnected',
      redis: status === 'healthy' ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    };
  }

  static stats() {
    return {
      articles: { total: 1000, today: 50, week: 200, month: 800 },
      sources: { total: 17, active: 15 },
      tags: { total: 500, unique: 350 },
      users: { total: 100, active: 80 },
      quality: { average: 75, distribution: { high: 30, medium: 50, low: 20 } },
    };
  }
}

// デフォルトエクスポート
export default TestFixtures;