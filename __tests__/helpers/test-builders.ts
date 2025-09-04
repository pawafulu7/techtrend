/**
 * テスト用ビルダーパターンの実装
 * テストデータを簡単に作成するためのヘルパー
 */

import { Article, Source, Tag, User } from '@prisma/client';

/**
 * 記事ビルダー
 */
export class ArticleBuilder {
  private article: Partial<Article & { source: Source; tags: Tag[] }> = {
    id: 'test-article-1',
    title: 'Default Test Article',
    summary: 'This is a default test article summary for testing purposes.',
    url: 'https://example.com/article',
    publishedAt: new Date('2025-01-01T10:00:00Z'),
    qualityScore: 80,
    sourceId: 'test-source',
    bookmarks: 0,
    userVotes: 0,
    difficulty: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    detailedSummary: null,
    content: null,
    thumbnail: null,
    viewCount: 0,
    summaryVersion: 7,
    articleType: 'unified',
    source: {
      id: 'test-source',
      name: 'Test Source',
      type: 'rss',
      url: 'https://test-source.com',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    tags: [],
  };

  withId(id: string): ArticleBuilder {
    this.article.id = id;
    return this;
  }

  withTitle(title: string): ArticleBuilder {
    this.article.title = title;
    return this;
  }

  withSummary(summary: string): ArticleBuilder {
    this.article.summary = summary;
    return this;
  }

  withDetailedSummary(detailedSummary: string): ArticleBuilder {
    this.article.detailedSummary = detailedSummary;
    return this;
  }

  withUrl(url: string): ArticleBuilder {
    this.article.url = url;
    return this;
  }

  withPublishedAt(date: Date | string): ArticleBuilder {
    this.article.publishedAt = typeof date === 'string' ? new Date(date) : date;
    return this;
  }

  withQualityScore(score: number): ArticleBuilder {
    this.article.qualityScore = score;
    return this;
  }

  withSource(source: Partial<Source>): ArticleBuilder {
    this.article.source = {
      id: source.id || 'test-source',
      name: source.name || 'Test Source',
      type: source.type || 'rss',
      url: source.url || 'https://test-source.com',
      enabled: source.enabled !== undefined ? source.enabled : true,
      createdAt: source.createdAt || new Date(),
      updatedAt: source.updatedAt || new Date(),
    };
    this.article.sourceId = this.article.source.id;
    return this;
  }

  withTags(tags: Array<Partial<Tag>>): ArticleBuilder {
    this.article.tags = tags.map((tag, index) => ({
      id: tag.id || `tag-${index}`,
      name: tag.name || `Tag ${index}`,
      category: tag.category || null,
      createdAt: tag.createdAt || new Date(),
      updatedAt: tag.updatedAt || new Date(),
    }));
    return this;
  }

  withBookmarks(count: number): ArticleBuilder {
    this.article.bookmarks = count;
    return this;
  }

  withUserVotes(count: number): ArticleBuilder {
    this.article.userVotes = count;
    return this;
  }

  withViewCount(count: number): ArticleBuilder {
    this.article.viewCount = count;
    return this;
  }

  build(): Article & { source: Source; tags: Tag[] } {
    return this.article as Article & { source: Source; tags: Tag[] };
  }
}

/**
 * ユーザービルダー
 */
export class UserBuilder {
  private user: Partial<User> = {
    id: 'test-user-1',
    email: 'test@example.com',
    name: 'Test User',
    emailVerified: null,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  withId(id: string): UserBuilder {
    this.user.id = id;
    return this;
  }

  withEmail(email: string): UserBuilder {
    this.user.email = email;
    return this;
  }

  withName(name: string | null): UserBuilder {
    this.user.name = name;
    return this;
  }

  withImage(image: string | null): UserBuilder {
    this.user.image = image;
    return this;
  }

  withEmailVerified(date: Date | null): UserBuilder {
    this.user.emailVerified = date;
    return this;
  }

  build(): User {
    return this.user as User;
  }
}

/**
 * ソースビルダー
 */
export class SourceBuilder {
  private source: Partial<Source> = {
    id: 'test-source',
    name: 'Test Source',
    type: 'rss',
    url: 'https://test-source.com',
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  withId(id: string): SourceBuilder {
    this.source.id = id;
    return this;
  }

  withName(name: string): SourceBuilder {
    this.source.name = name;
    return this;
  }

  withType(type: 'rss' | 'api' | 'scraper'): SourceBuilder {
    this.source.type = type;
    return this;
  }

  withUrl(url: string): SourceBuilder {
    this.source.url = url;
    return this;
  }

  withEnabled(enabled: boolean): SourceBuilder {
    this.source.enabled = enabled;
    return this;
  }

  build(): Source {
    return this.source as Source;
  }
}

/**
 * タグビルダー
 */
export class TagBuilder {
  private tag: Partial<Tag> = {
    id: 'test-tag',
    name: 'Test Tag',
    category: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  withId(id: string): TagBuilder {
    this.tag.id = id;
    return this;
  }

  withName(name: string): TagBuilder {
    this.tag.name = name;
    return this;
  }

  build(): Tag {
    return this.tag as Tag;
  }
}

/**
 * テストフィクスチャ
 */
export class TestFixtures {
  static createArticles(count: number): Array<Article & { source: Source; tags: Tag[] }> {
    return Array.from({ length: count }, (_, i) =>
      new ArticleBuilder()
        .withId(`article-${i + 1}`)
        .withTitle(`Test Article ${i + 1}`)
        .withSummary(`Summary for article ${i + 1}`)
        .withPublishedAt(new Date(Date.now() - i * 86400000)) // 1日ずつ過去の日付
        .withQualityScore(70 + (i % 31)) // 70-100の決定的なスコア
        .withSource({
          id: `source-${(i % 3) + 1}`,
          name: ['Qiita', 'Zenn', 'Dev.to'][i % 3],
        })
        .withTags([
          { name: ['React', 'TypeScript', 'Node.js'][i % 3] },
          { name: 'Testing' },
        ])
        .build()
    );
  }

  static createSources(count: number): Source[] {
    const sourceTypes: Array<'rss' | 'api' | 'scraper'> = ['rss', 'api', 'scraper'];
    return Array.from({ length: count }, (_, i) =>
      new SourceBuilder()
        .withId(`source-${i + 1}`)
        .withName(`Test Source ${i + 1}`)
        .withType(sourceTypes[i % 3])
        .withUrl(`https://source-${i + 1}.com`)
        .build()
    );
  }

  static createUsers(count: number): User[] {
    return Array.from({ length: count }, (_, i) =>
      new UserBuilder()
        .withId(`user-${i + 1}`)
        .withEmail(`user${i + 1}@example.com`)
        .withName(`User ${i + 1}`)
        .build()
    );
  }

  static createTags(names: string[]): Tag[] {
    return names.map((name, i) =>
      new TagBuilder()
        .withId(`tag-${i + 1}`)
        .withName(name)
        .build()
    );
  }
}

// デフォルトエクスポート
export default {
  ArticleBuilder,
  UserBuilder,
  SourceBuilder,
  TagBuilder,
  TestFixtures,
};