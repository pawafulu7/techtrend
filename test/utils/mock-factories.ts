import type { Article, Tag, Source, User, ArticleView, Favorite } from '@prisma/client';
import { faker } from '@faker-js/faker';

/**
 * テスト用のモックデータファクトリー
 * 一貫性のあるテストデータを生成するためのユーティリティ
 */

let articleIdCounter = 1;
let tagIdCounter = 1;
let sourceIdCounter = 1;
let userIdCounter = 1;

// Faker シード設定（テストの一貫性のため）
faker.seed(123);

/**
 * 記事のモックデータを生成
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMockArticle(overrides?: any): any {
  const id = articleIdCounter++;
  const now = new Date();
  
  return {
    id: `article-${id}`,
    title: `Test Article ${id}`,
    url: `https://example.com/article-${id}`,
    summary: `This is a summary for test article ${id}`,
    detailedSummary: `This is a detailed summary for test article ${id}.\n\n- Point 1\n- Point 2\n- Point 3`,
    content: `Full content of test article ${id}`,
    publishedAt: now,
    sourceId: `source-1`,
    ogImage: `https://example.com/images/article-${id}.jpg`,
    thumbnail: null,
    summaryVersion: 7,
    articleType: 'unified',
    qualityScore: null,
    bookmarks: null,
    userVotes: null,
    difficulty: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Article;
}

/**
 * タグのモックデータを生成
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMockTag(overrides?: any): any {
  const id = tagIdCounter++;
  
  return {
    id: `tag-${id}`,
    name: `tag${id}`,
    category: 'technology',
    ...overrides,
  };
}

/**
 * ソースのモックデータを生成
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMockSource(overrides?: any): any {
  const id = sourceIdCounter++;
  
  return {
    id: `source-${id}`,
    name: `Test Source ${id}`,
    type: 'rss',
    url: `https://source${id}.com`,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * ユーザーのモックデータを生成
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMockUser(overrides?: any): any {
  const id = userIdCounter++;
  const now = new Date();
  
  return {
    id: `user-${id}`,
    email: `user${id}@example.com`,
    name: `Test User ${id}`,
    password: 'hashed_password',
    emailVerified: null,
    image: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * 記事ビューのモックデータを生成
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMockArticleView(
  userId: string,
  articleId: string,
  overrides?: any
): any {
  const now = new Date();
  
  return {
    id: `${userId}_${articleId}`,
    userId,
    articleId,
    viewedAt: now,
    isRead: false,
    readAt: null,
    ...overrides,
  };
}

/**
 * お気に入りのモックデータを生成
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMockFavorite(
  userId: string,
  articleId: string,
  overrides?: any
): any {
  const now = new Date();
  
  return {
    id: `${userId}_${articleId}`,
    userId,
    articleId,
    createdAt: now,
    ...overrides,
  };
}

/**
 * リレーションを含む記事のモックデータを生成
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMockArticleWithRelations(overrides?: any) {
  const article = createMockArticle(overrides?.article);
  const source = createMockSource({ 
    id: article.sourceId,
    ...overrides?.source 
  });
  const tags = overrides?.tags?.map((tagOverride) => createMockTag(tagOverride)) || [
    createMockTag({ name: 'javascript' }),
    createMockTag({ name: 'react' }),
  ];
  
  return {
    ...article,
    source,
    tags,
  };
}

/**
 * IDカウンターをリセット（テスト間の独立性を保つため）
 */
export function resetMockCounters() {
  articleIdCounter = 1;
  tagIdCounter = 1;
  sourceIdCounter = 1;
  userIdCounter = 1;
}

/**
 * Fakerを使用したより現実的なモックデータファクトリー
 */

/**
 * リアルな記事データを生成
 */
export function mockArticle(overrides: Partial<Article> = {}): Article {
  const now = new Date();
  const publishedAt = faker.date.recent({ days: 30 });
  
  return {
    id: faker.string.uuid(),
    title: faker.lorem.sentence({ min: 5, max: 10 }),
    url: faker.internet.url(),
    summary: faker.lorem.paragraph({ min: 2, max: 4 }),
    detailedSummary: `${faker.lorem.paragraph()}\n\n• ${faker.lorem.sentence()}\n• ${faker.lorem.sentence()}\n• ${faker.lorem.sentence()}`,
    content: faker.lorem.paragraphs({ min: 3, max: 5 }),
    publishedAt,
    sourceId: overrides.sourceId || `source-${faker.number.int({ min: 1, max: 10 })}`,
    ogImage: faker.image.url(),
    thumbnail: faker.datatype.boolean() ? faker.image.url() : null,
    summaryVersion: 7,
    articleType: 'unified',
    qualityScore: faker.number.int({ min: 60, max: 100 }),
    bookmarks: faker.number.int({ min: 0, max: 100 }),
    userVotes: faker.number.int({ min: 0, max: 50 }),
    difficulty: faker.helpers.arrayElement(['beginner', 'intermediate', 'advanced'] as const),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Article;
}

/**
 * リアルなソースデータを生成
 */
export function mockSource(overrides: Partial<Source> = {}): Source {
  const sources = [
    { name: 'Dev.to', url: 'https://dev.to' },
    { name: 'Qiita', url: 'https://qiita.com' },
    { name: 'Zenn', url: 'https://zenn.dev' },
    { name: 'GitHub Blog', url: 'https://github.blog' },
    { name: 'Medium', url: 'https://medium.com' },
  ];
  
  const selectedSource = faker.helpers.arrayElement(sources);
  
  return {
    id: faker.string.uuid(),
    name: selectedSource.name,
    type: faker.helpers.arrayElement(['rss', 'api', 'scraper']),
    url: selectedSource.url,
    enabled: true,
    createdAt: faker.date.past(),
    updatedAt: new Date(),
    ...overrides,
  } as Source;
}

/**
 * リアルなタグデータを生成
 */
export function mockTag(overrides: Partial<Tag> = {}): Tag {
  const techTags = [
    'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular',
    'Node.js', 'Python', 'Go', 'Rust', 'Java',
    'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure',
    'GraphQL', 'REST API', 'MongoDB', 'PostgreSQL', 'Redis',
  ];
  
  return {
    id: faker.string.uuid(),
    name: faker.helpers.arrayElement(techTags).toLowerCase(),
    category: faker.helpers.arrayElement(['language', 'framework', 'tool', 'platform', 'database']),
    ...overrides,
  } as Tag;
}

/**
 * リアルなユーザーデータを生成
 */
export function mockUser(overrides: Partial<User> = {}): User {
  const now = new Date();
  
  return {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    password: 'hashed_password_' + faker.string.alphanumeric(32),
    emailVerified: faker.datatype.boolean() ? faker.date.past() : null,
    image: faker.datatype.boolean() ? faker.image.avatar() : null,
    createdAt: faker.date.past(),
    updatedAt: now,
    ...overrides,
  } as User;
}

/**
 * セッションのモックデータを生成
 */
export function mockSession(overrides: Partial<{ user: Partial<User>; expires: string }> = {}) {
  return {
    user: mockUser(overrides.user || {}),
    expires: overrides.expires || faker.date.future().toISOString(),
  };
}

/**
 * リレーション付き記事データを生成
 */
export function mockArticleWithRelations(overrides: Partial<{
  article?: Partial<Article>;
  source?: Partial<Source>;
  tags?: Partial<Tag>[];
}> = {}) {
  const source = mockSource(overrides.source || {});
  const article = mockArticle({ ...overrides.article, sourceId: source.id });
  const tags = overrides.tags?.map(t => mockTag(t)) || [
    mockTag(),
    mockTag(),
    mockTag(),
  ];
  
  return {
    ...article,
    source,
    tags,
  };
}

/**
 * お気に入りのリアルなモックデータを生成
 */
export function mockFavorite(
  userId?: string,
  articleId?: string,
  overrides: Partial<Favorite> = {}
): Favorite {
  const finalUserId = userId || faker.string.uuid();
  const finalArticleId = articleId || faker.string.uuid();
  
  return {
    id: `${finalUserId}_${finalArticleId}`,
    userId: finalUserId,
    articleId: finalArticleId,
    createdAt: faker.date.recent(),
    ...overrides,
  } as Favorite;
}

/**
 * 記事ビューのリアルなモックデータを生成
 */
export function mockArticleView(
  userId?: string,
  articleId?: string,
  overrides: Partial<ArticleView> = {}
): ArticleView {
  const finalUserId = userId || faker.string.uuid();
  const finalArticleId = articleId || faker.string.uuid();
  const viewedAt = faker.date.recent();
  const isRead = faker.datatype.boolean();
  
  return {
    id: `${finalUserId}_${finalArticleId}`,
    userId: finalUserId,
    articleId: finalArticleId,
    viewedAt,
    isRead,
    readAt: isRead ? faker.date.between({ from: viewedAt, to: new Date() }) : null,
    ...overrides,
  } as ArticleView;
}