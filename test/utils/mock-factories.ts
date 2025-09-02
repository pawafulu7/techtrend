import { faker } from '@faker-js/faker';

/**
 * テスト用のモックデータファクトリー
 * 一貫性のあるテストデータを生成するためのユーティリティ
 */

// 厳密な型定義
type ArticleCategory = 'frontend' | 'backend' | 'ai_ml' | 'security' | 'devops' | 'database' | 'mobile' | 'web3' | 'design' | 'testing';
type SourceType = 'rss' | 'api' | 'scraping';
type ArticleDifficulty = 'beginner' | 'intermediate' | 'advanced';
type TagCategory = 'language' | 'framework' | 'tool' | 'platform' | 'database';

interface MockArticle {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  detailedSummary: string | null;
  content: string | null;
  publishedAt: Date;
  sourceId: string;
  thumbnail: string | null;
  summaryVersion: number;
  articleType: string | null;
  qualityScore: number;
  bookmarks: number;
  userVotes: number;
  difficulty: string | null;
  category: ArticleCategory | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockTag {
  id: string;
  name: string;
  category: TagCategory | null;
}

interface MockSource {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MockUser {
  id: string;
  email: string;
  name: string | null;
  password: string;
  emailVerified: Date | null;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockArticleView {
  id: string;
  userId: string;
  articleId: string;
  viewedAt: Date | null;
  isRead: boolean;
  readAt: Date | null;
}

interface MockFavorite {
  id: string;
  userId: string;
  articleId: string;
  createdAt: Date;
}

interface MockArticleWithRelations extends MockArticle {
  source: MockSource;
  tags: MockTag[];
}

let articleIdCounter = 1;
let tagIdCounter = 1;
let sourceIdCounter = 1;
let userIdCounter = 1;

// Faker シード設定（テストの決定論的実行のため）
faker.seed(123);

// 固定の基準日（テストの決定論的実行のため）
const REFERENCE_DATE = new Date('2025-01-01T00:00:00Z');

// 共通定数
const MOCK_SOURCES = [
  { name: 'Dev.to', url: 'https://dev.to' },
  { name: 'Qiita', url: 'https://qiita.com' },
  { name: 'Zenn', url: 'https://zenn.dev' },
  { name: 'GitHub Blog', url: 'https://github.blog' },
  { name: 'Medium', url: 'https://medium.com' },
] as const;

const TECH_TAGS = [
  'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular',
  'Node.js', 'Python', 'Go', 'Rust', 'Java',
  'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure',
  'GraphQL', 'REST API', 'MongoDB', 'PostgreSQL', 'Redis',
] as const;

/**
 * 記事のモックデータを生成
 */
export function createMockArticle(overrides?: Partial<MockArticle>): MockArticle {
  const id = articleIdCounter++;
  const now = new Date(REFERENCE_DATE);
  
  return {
    id: `article-${id}`,
    title: `Test Article ${id}`,
    url: `https://example.com/article-${id}`,
    summary: `This is a summary for test article ${id}`,
    detailedSummary: `This is a detailed summary for test article ${id}.\n\n- Point 1\n- Point 2\n- Point 3`,
    content: `Full content of test article ${id}`,
    publishedAt: now,
    sourceId: `source-1`,
    thumbnail: null,
    summaryVersion: 7,
    articleType: 'unified',
    qualityScore: 0,
    bookmarks: 0,
    userVotes: 0,
    difficulty: null,
    category: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * タグのモックデータを生成
 */
export function createMockTag(overrides?: Partial<MockTag>): MockTag {
  const id = tagIdCounter++;
  
  return {
    id: `tag-${id}`,
    name: `tag${id}`,
    category: 'framework' as TagCategory,
    ...overrides,
  };
}

/**
 * ソースのモックデータを生成
 */
export function createMockSource(overrides?: Partial<MockSource>): MockSource {
  const id = sourceIdCounter++;
  const now = new Date(REFERENCE_DATE);
  
  return {
    id: `source-${id}`,
    name: `Test Source ${id}`,
    type: 'rss' as SourceType,
    url: `https://source${id}.com`,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * ユーザーのモックデータを生成
 */
export function createMockUser(overrides?: Partial<MockUser>): MockUser {
  const id = userIdCounter++;
  const now = new Date(REFERENCE_DATE);
  
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
export function createMockArticleView(
  userId: string,
  articleId: string,
  overrides?: Partial<MockArticleView>
): MockArticleView {
  const now = new Date(REFERENCE_DATE);
  
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
export function createMockFavorite(
  userId: string,
  articleId: string,
  overrides?: Partial<MockFavorite>
): MockFavorite {
  const now = new Date(REFERENCE_DATE);
  
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
interface ArticleWithRelationsOverrides {
  article?: Partial<MockArticle>;
  source?: Partial<MockSource>;
  tags?: Partial<MockTag>[];
}

export function createMockArticleWithRelations(overrides?: ArticleWithRelationsOverrides): MockArticleWithRelations {
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
export function mockArticle(overrides: Partial<MockArticle> = {}): MockArticle {
  const now = new Date(REFERENCE_DATE);
  const publishedAt = faker.date.recent({ days: 30, refDate: REFERENCE_DATE });
  
  return {
    id: overrides.id ?? faker.string.uuid(),
    title: faker.lorem.sentence({ min: 5, max: 10 }),
    url: faker.internet.url(),
    summary: faker.lorem.paragraph({ min: 2, max: 4 }),
    detailedSummary: `${faker.lorem.paragraph()}\n\n• ${faker.lorem.sentence()}\n• ${faker.lorem.sentence()}\n• ${faker.lorem.sentence()}`,
    content: faker.lorem.paragraphs({ min: 3, max: 5 }),
    publishedAt,
    sourceId: `source-${faker.number.int({ min: 1, max: 10 })}`,
    thumbnail: faker.datatype.boolean() ? faker.image.url() : null,
    summaryVersion: 7,
    articleType: 'unified',
    qualityScore: faker.number.float({ min: 60, max: 100, fractionDigits: 2 }),
    bookmarks: faker.number.int({ min: 0, max: 100 }),
    userVotes: faker.number.int({ min: 0, max: 50 }),
    difficulty: faker.helpers.arrayElement<ArticleDifficulty>(['beginner', 'intermediate', 'advanced']),
    category: faker.helpers.arrayElement<ArticleCategory | null>([null, 'frontend', 'backend', 'ai_ml']),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * リアルなソースデータを生成
 */
export function mockSource(overrides: Partial<MockSource> = {}): MockSource {
  const selectedSource = faker.helpers.arrayElement(MOCK_SOURCES);
  const now = new Date(REFERENCE_DATE);
  
  return {
    id: overrides.id ?? faker.string.uuid(),
    name: selectedSource.name,
    type: faker.helpers.arrayElement<SourceType>(['rss', 'api', 'scraping']),
    url: selectedSource.url,
    enabled: true,
    createdAt: faker.date.past({ refDate: REFERENCE_DATE }),
    updatedAt: now,
    ...overrides,
  };
}

/**
 * リアルなタグデータを生成
 */
export function mockTag(overrides: Partial<MockTag> = {}): MockTag {
  return {
    id: overrides.id ?? faker.string.uuid(),
    name: faker.helpers.arrayElement(TECH_TAGS).toLowerCase(),
    category: faker.helpers.arrayElement<TagCategory>(['language', 'framework', 'tool', 'platform', 'database']),
    ...overrides,
  };
}

/**
 * リアルなユーザーデータを生成
 */
export function mockUser(overrides: Partial<MockUser> = {}): MockUser {
  const now = new Date(REFERENCE_DATE);
  
  return {
    id: overrides.id ?? faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    password: 'hashed_password_' + faker.string.alphanumeric(32),
    emailVerified: faker.datatype.boolean() ? faker.date.past({ refDate: REFERENCE_DATE }) : null,
    image: faker.datatype.boolean() ? faker.image.avatar() : null,
    createdAt: faker.date.past({ refDate: REFERENCE_DATE }),
    updatedAt: now,
    ...overrides,
  };
}

/**
 * セッションのモックデータを生成
 */
export function mockSession(overrides: Partial<{ user: Partial<MockUser>; expires: string }> = {}) {
  return {
    user: mockUser(overrides.user || {}),
    expires: overrides.expires || faker.date.future().toISOString(),
  };
}

/**
 * リレーション付き記事データを生成
 */
export function mockArticleWithRelations(overrides: Partial<{
  article?: Partial<MockArticle>;
  source?: Partial<MockSource>;
  tags?: Partial<MockTag>[];
}> = {}): MockArticleWithRelations {
  const source = mockSource(overrides.source ?? {});
  const article = mockArticle({ 
    ...overrides.article, 
    sourceId: source.id 
  });
  const tags = overrides.tags?.map(t => mockTag(t)) ?? [
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
  overrides: Partial<MockFavorite> = {}
): MockFavorite {
  const finalUserId = userId || faker.string.uuid();
  const finalArticleId = articleId || faker.string.uuid();
  
  return {
    id: `${finalUserId}_${finalArticleId}`,
    userId: finalUserId,
    articleId: finalArticleId,
    createdAt: faker.date.recent(),
    ...overrides,
  };
}

/**
 * 記事ビューのリアルなモックデータを生成
 */
export function mockArticleView(
  userId?: string,
  articleId?: string,
  overrides: Partial<MockArticleView> = {}
): MockArticleView {
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
  };
}