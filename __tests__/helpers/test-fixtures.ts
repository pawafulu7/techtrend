/**
 * テスト用フィクスチャデータ
 * 共通的に使用するテストデータを定義
 */

import { ArticleBuilder, SourceBuilder, UserBuilder, TagBuilder } from './test-builders';

// 共通的なソースデータ
export const MOCK_SOURCES = {
  qiita: new SourceBuilder()
    .withId('qiita')
    .withName('Qiita')
    .withType('api')
    .withUrl('https://qiita.com')
    .build(),
  
  zenn: new SourceBuilder()
    .withId('zenn')
    .withName('Zenn')
    .withType('rss')
    .withUrl('https://zenn.dev')
    .build(),
  
  devto: new SourceBuilder()
    .withId('devto')
    .withName('Dev.to')
    .withType('api')
    .withUrl('https://dev.to')
    .build(),
  
  hatena: new SourceBuilder()
    .withId('hatena')
    .withName('はてなブックマーク')
    .withType('rss')
    .withUrl('https://b.hatena.ne.jp')
    .build(),
  
  speakerdeck: new SourceBuilder()
    .withId('speakerdeck')
    .withName('Speaker Deck')
    .withType('scraper')
    .withUrl('https://speakerdeck.com')
    .build(),
};

// 共通的なタグデータ
export const MOCK_TAGS = {
  react: new TagBuilder().withId('tag-react').withName('React').build(),
  typescript: new TagBuilder().withId('tag-ts').withName('TypeScript').build(),
  nodejs: new TagBuilder().withId('tag-node').withName('Node.js').build(),
  testing: new TagBuilder().withId('tag-test').withName('Testing').build(),
  aws: new TagBuilder().withId('tag-aws').withName('AWS').build(),
  docker: new TagBuilder().withId('tag-docker').withName('Docker').build(),
  kubernetes: new TagBuilder().withId('tag-k8s').withName('Kubernetes').build(),
  python: new TagBuilder().withId('tag-python').withName('Python').build(),
  go: new TagBuilder().withId('tag-go').withName('Go').build(),
  rust: new TagBuilder().withId('tag-rust').withName('Rust').build(),
};

// 共通的なユーザーデータ
export const MOCK_USERS = {
  testUser: new UserBuilder()
    .withId('user-test')
    .withEmail('test@example.com')
    .withName('Test User')
    .build(),
  
  adminUser: new UserBuilder()
    .withId('user-admin')
    .withEmail('admin@example.com')
    .withName('Admin User')
    .build(),
  
  guestUser: new UserBuilder()
    .withId('user-guest')
    .withEmail('guest@example.com')
    .withName(null)
    .build(),
};

// 共通的な記事データ
export const MOCK_ARTICLES = {
  highQuality: new ArticleBuilder()
    .withId('article-high-quality')
    .withTitle('高品質なReact Testing戦略')
    .withSummary('Reactアプリケーションの効果的なテスト戦略について、単体テストから統合テスト、E2Eテストまで包括的に解説します。')
    .withQualityScore(95)
    .withSource(MOCK_SOURCES.qiita)
    .withTags([MOCK_TAGS.react, MOCK_TAGS.testing])
    .withBookmarks(50)
    .withUserVotes(30)
    .withViewCount(1000)
    .build(),
  
  mediumQuality: new ArticleBuilder()
    .withId('article-medium-quality')
    .withTitle('TypeScriptの型システム入門')
    .withSummary('TypeScriptの型システムの基本から応用まで、実践的な例を交えて解説します。')
    .withQualityScore(75)
    .withSource(MOCK_SOURCES.zenn)
    .withTags([MOCK_TAGS.typescript])
    .withBookmarks(20)
    .withUserVotes(10)
    .withViewCount(500)
    .build(),
  
  lowQuality: new ArticleBuilder()
    .withId('article-low-quality')
    .withTitle('Node.jsのインストール方法')
    .withSummary('Node.jsを各OSにインストールする手順を説明します。')
    .withQualityScore(50)
    .withSource(MOCK_SOURCES.devto)
    .withTags([MOCK_TAGS.nodejs])
    .withBookmarks(5)
    .withUserVotes(2)
    .withViewCount(100)
    .build(),
  
  recentArticle: new ArticleBuilder()
    .withId('article-recent')
    .withTitle('最新のAWS Lambda機能アップデート')
    .withSummary('AWS Lambdaの最新アップデートについて、新機能と改善点を詳しく解説します。')
    .withPublishedAt(new Date())
    .withQualityScore(85)
    .withSource(MOCK_SOURCES.hatena)
    .withTags([MOCK_TAGS.aws])
    .build(),
  
  oldArticle: new ArticleBuilder()
    .withId('article-old')
    .withTitle('Docker入門ガイド')
    .withSummary('Dockerの基本概念から実践的な使い方まで、初心者向けに解説します。')
    .withPublishedAt(new Date('2024-01-01'))
    .withQualityScore(70)
    .withSource(MOCK_SOURCES.speakerdeck)
    .withTags([MOCK_TAGS.docker])
    .build(),
};

// APIレスポンスのモックデータ
export const MOCK_API_RESPONSES = {
  articlesSuccess: {
    articles: Object.values(MOCK_ARTICLES),
    total: Object.keys(MOCK_ARTICLES).length,
    page: 1,
    limit: 20,
    hasMore: false,
  },
  
  articlesEmpty: {
    articles: [],
    total: 0,
    page: 1,
    limit: 20,
    hasMore: false,
  },
  
  sourcesSuccess: {
    sources: Object.values(MOCK_SOURCES),
    total: Object.keys(MOCK_SOURCES).length,
  },
  
  userSuccess: {
    user: MOCK_USERS.testUser,
    isAuthenticated: true,
  },
  
  errorResponse: {
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    statusCode: 500,
  },
};

// Prismaモック用のヘルパー関数
export function setupPrismaMock(prismaMock: any) {
  // デフォルトの成功レスポンスを設定
  prismaMock.article = {
    findMany: jest.fn().mockResolvedValue(Object.values(MOCK_ARTICLES)),
    findUnique: jest.fn().mockResolvedValue(MOCK_ARTICLES.highQuality),
    findFirst: jest.fn().mockResolvedValue(MOCK_ARTICLES.highQuality),
    count: jest.fn().mockResolvedValue(Object.keys(MOCK_ARTICLES).length),
    create: jest.fn().mockImplementation((data: any) => ({ ...data.data, id: 'new-article' })),
    update: jest.fn().mockImplementation((params: any) => ({ ...params.data, id: params.where.id })),
    delete: jest.fn().mockResolvedValue({ id: 'deleted' }),
    groupBy: jest.fn().mockResolvedValue([]),
  };
  
  prismaMock.source = {
    findMany: jest.fn().mockResolvedValue(Object.values(MOCK_SOURCES)),
    findUnique: jest.fn().mockResolvedValue(MOCK_SOURCES.qiita),
    findFirst: jest.fn().mockResolvedValue(MOCK_SOURCES.qiita),
    count: jest.fn().mockResolvedValue(Object.keys(MOCK_SOURCES).length),
  };
  
  prismaMock.user = {
    findUnique: jest.fn().mockResolvedValue(MOCK_USERS.testUser),
    findFirst: jest.fn().mockResolvedValue(MOCK_USERS.testUser),
    create: jest.fn().mockImplementation((data: any) => ({ ...data.data, id: 'new-user' })),
    update: jest.fn().mockImplementation((params: any) => ({ ...params.data, id: params.where.id })),
  };
  
  prismaMock.tag = {
    findMany: jest.fn().mockResolvedValue(Object.values(MOCK_TAGS)),
    findUnique: jest.fn().mockResolvedValue(MOCK_TAGS.react),
  };
  
  return prismaMock;
}

// Redisモック用のヘルパー関数
export function setupRedisMock(redisMock: any) {
  const cache = new Map<string, string>();
  
  redisMock.get = jest.fn().mockImplementation((key: string) => {
    return Promise.resolve(cache.get(key) || null);
  });
  
  redisMock.set = jest.fn().mockImplementation((key: string, value: string) => {
    cache.set(key, value);
    return Promise.resolve('OK');
  });
  
  redisMock.del = jest.fn().mockImplementation((key: string) => {
    const result = cache.has(key) ? 1 : 0;
    cache.delete(key);
    return Promise.resolve(result);
  });
  
  redisMock.flushall = jest.fn().mockImplementation(() => {
    cache.clear();
    return Promise.resolve('OK');
  });
  
  return redisMock;
}

// セッションモック用のヘルパー関数
export function mockSession(user: any = null) {
  return {
    data: user ? { user } : null,
    status: user ? 'authenticated' : 'unauthenticated',
    update: jest.fn(),
  };
}

// デフォルトエクスポート
export default {
  MOCK_SOURCES,
  MOCK_TAGS,
  MOCK_USERS,
  MOCK_ARTICLES,
  MOCK_API_RESPONSES,
  setupPrismaMock,
  setupRedisMock,
  mockSession,
};