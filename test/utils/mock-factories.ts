import type { Article, Tag, Source, User, ArticleView, Favorite } from '@prisma/client';

/**
 * テスト用のモックデータファクトリー
 * 一貫性のあるテストデータを生成するためのユーティリティ
 */

let articleIdCounter = 1;
let tagIdCounter = 1;
let sourceIdCounter = 1;
let userIdCounter = 1;

/**
 * 記事のモックデータを生成
 */
export function createMockArticle(overrides?: Partial<Article>): Article {
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
export function createMockTag(overrides?: Partial<Tag>): Tag {
  const id = tagIdCounter++;
  
  return {
    id: `tag-${id}`,
    name: `tag${id}`,
    displayName: `Tag ${id}`,
    category: 'technology',
    ...overrides,
  };
}

/**
 * ソースのモックデータを生成
 */
export function createMockSource(overrides?: Partial<Source>): Source {
  const id = sourceIdCounter++;
  
  return {
    id: `source-${id}`,
    name: `Test Source ${id}`,
    url: `https://source${id}.com`,
    feedUrl: `https://source${id}.com/feed`,
    isActive: true,
    lastFetchedAt: new Date(),
    description: `Description for test source ${id}`,
    category: 'tech',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * ユーザーのモックデータを生成
 */
export function createMockUser(overrides?: Partial<User>): User {
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
export function createMockArticleView(
  userId: string,
  articleId: string,
  overrides?: Partial<ArticleView>
): ArticleView {
  const now = new Date();
  
  return {
    id: `${userId}_${articleId}`,
    userId,
    articleId,
    viewedAt: now,
    isRead: false,
    readAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * お気に入りのモックデータを生成
 */
export function createMockFavorite(
  userId: string,
  articleId: string,
  overrides?: Partial<Favorite>
): Favorite {
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
export function createMockArticleWithRelations(overrides?: {
  article?: Partial<Article>;
  tags?: Partial<Tag>[];
  source?: Partial<Source>;
}) {
  const article = createMockArticle(overrides?.article);
  const source = createMockSource({ 
    id: article.sourceId,
    ...overrides?.source 
  });
  const tags = overrides?.tags?.map((tagOverride) => createMockTag(tagOverride)) || [
    createMockTag({ name: 'javascript', displayName: 'JavaScript' }),
    createMockTag({ name: 'react', displayName: 'React' }),
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