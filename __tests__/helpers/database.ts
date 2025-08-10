/**
 * データベース関連のテストヘルパー
 * Prismaクライアントのモックとテストデータビルダーを提供
 */

import { Article, Source, Tag, ArticleTag } from '@prisma/client';

/**
 * Prismaクライアントのモックファクトリー
 */
export const createMockPrismaClient = () => {
  const mockClient = {
    article: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    source: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    tag: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    articleTag: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn((fn: any) => {
      if (typeof fn === 'function') {
        return Promise.resolve(fn(mockClient));
      }
      return Promise.resolve(fn);
    }),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };

  return mockClient;
};

/**
 * テスト用記事データビルダー
 */
export const createTestArticle = (overrides: Partial<Article> = {}): Article => {
  const now = new Date('2025-01-09T00:00:00.000Z');
  
  return {
    id: 'test-article-id',
    title: 'Test Article Title',
    url: 'https://test.example.com/article',
    summary: '## 概要\nこれはテスト記事の要約です。\n\n## 主なポイント\n- ポイント1\n- ポイント2\n\n## 技術スタック\n- TypeScript\n- React',
    content: 'This is the full content of the test article.',
    publishedAt: now,
    sourceId: 'test-source-id',
    thumbnail: 'https://test.example.com/thumbnail.jpg',
    qualityScore: 85,
    summaryVersion: 5,
    articleType: 'unified',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

/**
 * テスト用ソースデータビルダー
 */
export const createTestSource = (overrides: Partial<Source> = {}): Source => {
  const now = new Date('2025-01-09T00:00:00.000Z');
  
  return {
    id: 'test-source-id',
    name: 'Test Source',
    url: 'https://test.example.com',
    rssUrl: 'https://test.example.com/rss',
    category: 'tech',
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

/**
 * テスト用タグデータビルダー
 */
export const createTestTag = (overrides: Partial<Tag> = {}): Tag => {
  const now = new Date('2025-01-09T00:00:00.000Z');
  
  return {
    id: 'test-tag-id',
    name: 'typescript',
    displayName: 'TypeScript',
    category: 'language',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

/**
 * テスト用記事タグ関連データビルダー
 */
export const createTestArticleTag = (overrides: Partial<ArticleTag> = {}): ArticleTag => {
  const now = new Date('2025-01-09T00:00:00.000Z');
  
  return {
    id: 'test-article-tag-id',
    articleId: 'test-article-id',
    tagId: 'test-tag-id',
    createdAt: now,
    ...overrides,
  };
};

/**
 * 複数の記事データを生成
 */
export const createTestArticles = (count: number, baseOverrides: Partial<Article> = {}): Article[] => {
  return Array.from({ length: count }, (_, index) => 
    createTestArticle({
      id: `test-article-id-${index + 1}`,
      title: `Test Article ${index + 1}`,
      url: `https://test.example.com/article-${index + 1}`,
      ...baseOverrides,
    })
  );
};

/**
 * 複数のソースデータを生成
 */
export const createTestSources = (count: number, baseOverrides: Partial<Source> = {}): Source[] => {
  return Array.from({ length: count }, (_, index) => 
    createTestSource({
      id: `test-source-id-${index + 1}`,
      name: `Test Source ${index + 1}`,
      url: `https://test${index + 1}.example.com`,
      ...baseOverrides,
    })
  );
};

/**
 * 複数のタグデータを生成
 */
export const createTestTags = (count: number, baseOverrides: Partial<Tag> = {}): Tag[] => {
  const categories = ['language', 'framework', 'tool', 'concept'];
  const tagNames = ['typescript', 'react', 'nodejs', 'docker', 'kubernetes', 'graphql', 'prisma', 'nextjs'];
  
  return Array.from({ length: count }, (_, index) => {
    const tagName = tagNames[index % tagNames.length];
    return createTestTag({
      id: `test-tag-id-${index + 1}`,
      name: tagName,
      displayName: tagName.charAt(0).toUpperCase() + tagName.slice(1),
      category: categories[index % categories.length],
      ...baseOverrides,
    });
  });
};

/**
 * 記事と関連データを含む完全なテストデータセット
 */
export interface TestDataSet {
  articles: Article[];
  sources: Source[];
  tags: Tag[];
  articleTags: ArticleTag[];
}

/**
 * 完全なテストデータセットを生成
 */
export const createTestDataSet = (
  articleCount = 3,
  sourceCount = 2,
  tagCount = 5
): TestDataSet => {
  const sources = createTestSources(sourceCount);
  const tags = createTestTags(tagCount);
  const articles = createTestArticles(articleCount).map((article, index) => ({
    ...article,
    sourceId: sources[index % sourceCount].id,
  }));
  
  // 各記事に2-3個のタグを関連付け
  const articleTags: ArticleTag[] = [];
  articles.forEach((article, articleIndex) => {
    const tagCountForArticle = 2 + (articleIndex % 2); // 2または3個
    for (let i = 0; i < tagCountForArticle; i++) {
      articleTags.push(createTestArticleTag({
        id: `article-tag-${articleIndex}-${i}`,
        articleId: article.id,
        tagId: tags[(articleIndex + i) % tagCount].id,
      }));
    }
  });
  
  return {
    articles,
    sources,
    tags,
    articleTags,
  };
};

/**
 * Prismaエラーのモック
 */
export class MockPrismaClientKnownRequestError extends Error {
  code: string;
  meta?: Record<string, any>;
  
  constructor(message: string, code: string, meta?: Record<string, any>) {
    super(message);
    this.name = 'PrismaClientKnownRequestError';
    this.code = code;
    this.meta = meta;
  }
}

/**
 * よく使うPrismaエラーのファクトリー
 */
export const createPrismaErrors = () => ({
  uniqueConstraint: (field: string) => new MockPrismaClientKnownRequestError(
    `Unique constraint failed on the fields: (\`${field}\`)`,
    'P2002',
    { target: [field] }
  ),
  recordNotFound: () => new MockPrismaClientKnownRequestError(
    'Record not found',
    'P2025'
  ),
  foreignKeyConstraint: (field: string) => new MockPrismaClientKnownRequestError(
    `Foreign key constraint failed on the field: \`${field}\``,
    'P2003',
    { field_name: field }
  ),
  connectionError: () => new MockPrismaClientKnownRequestError(
    'Can not connect to the database',
    'P1001'
  ),
});