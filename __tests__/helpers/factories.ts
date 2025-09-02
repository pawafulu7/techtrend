import { faker } from '@faker-js/faker';

/**
 * Factory functions for creating test data
 */

/**
 * Create a test article
 */
export function createTestArticle(overrides: Partial<any> = {}) {
  const title = faker.lorem.sentence();
  let summary = '';
  
  // Generate summary between 90-130 characters
  while (summary.length < 90) {
    summary += faker.lorem.sentence() + ' ';
  }
  summary = summary.substring(0, 120).trim() + '。';
  
  return {
    id: faker.string.uuid(),
    title,
    url: faker.internet.url(),
    summary,
    content: faker.lorem.paragraphs(3),
    publishedAt: faker.date.recent(),
    sourceId: faker.helpers.arrayElement(['qiita', 'zenn', 'devto', 'hatena']),
    thumbnail: faker.helpers.maybe(() => faker.image.url(), { probability: 0.5 }),
    bookmarks: faker.number.int({ min: 0, max: 100 }),
    userVotes: faker.number.int({ min: 0, max: 50 }),
    qualityScore: faker.number.int({ min: 60, max: 100 }),
    difficulty: faker.helpers.maybe(() => faker.helpers.arrayElement(['beginner', 'intermediate', 'advanced']), { probability: 0.3 }),
    detailedSummary: faker.helpers.maybe(() => faker.lorem.paragraph(), { probability: 0.3 }),
    summaryVersion: 5,
    articleType: 'unified',
    createdAt: faker.date.recent(),
    updatedAt: faker.date.recent(),
    ...overrides,
  };
}

/**
 * Create a test source
 */
export function createTestSource(overrides: Partial<any> = {}) {
  return {
    id: faker.string.uuid(),
    name: faker.company.name(),
    type: faker.helpers.arrayElement(['rss', 'api', 'scraping']),
    url: faker.internet.url(),
    enabled: true,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    ...overrides,
  };
}

/**
 * Create a test tag
 */
export function createTestTag(overrides: Partial<any> = {}) {
  return {
    id: faker.string.uuid(),
    name: faker.helpers.arrayElement([
      'React', 'TypeScript', 'JavaScript', 'Vue', 'Next.js',
      'Node.js', 'Python', 'Go', 'Rust', 'Docker',
      'Kubernetes', 'AWS', 'DevOps', 'CI/CD', 'Testing'
    ]),
    category: faker.helpers.maybe(() => faker.helpers.arrayElement(['tech', 'framework', 'language', 'tool']), { probability: 0.5 }),
    ...overrides,
  };
}

/**
 * Create test source stats
 */
export function createTestSourceStats(overrides: Partial<any> = {}) {
  return {
    sourceId: faker.string.uuid(),
    sourceName: faker.company.name(),
    totalArticles: faker.number.int({ min: 10, max: 500 }),
    avgQualityScore: faker.number.int({ min: 60, max: 100 }),
    popularTags: faker.helpers.arrayElements([
      'React', 'TypeScript', 'JavaScript', 'Vue', 'Next.js'
    ], 3),
    publishFrequency: faker.number.float({ min: 0.1, max: 2.0, fractionDigits: 1 }),
    lastPublished: faker.date.recent(),
    growthRate: faker.number.int({ min: -50, max: 100 }),
    category: faker.helpers.arrayElement(['community', 'company_blog', 'news_site', 'personal_blog', 'other']),
    ...overrides,
  };
}

/**
 * Create multiple test articles
 */
export function createTestArticles(count: number, overrides: Partial<any> = {}) {
  return Array.from({ length: count }, () => createTestArticle(overrides));
}

/**
 * Create multiple test sources
 */
export function createTestSources(count: number, overrides: Partial<any> = {}) {
  return Array.from({ length: count }, () => createTestSource(overrides));
}

/**
 * Create multiple test tags
 */
export function createTestTags(count: number, overrides: Partial<any> = {}) {
  return Array.from({ length: count }, () => createTestTag(overrides));
}

/**
 * Create an article with related data
 */
export function createTestArticleWithRelations(overrides: Partial<any> = {}) {
  const source = createTestSource();
  const tags = createTestTags(faker.number.int({ min: 1, max: 5 }));
  
  return {
    ...createTestArticle({ sourceId: source.id }),
    source,
    tags,
    ...overrides,
  };
}

/**
 * Create API success response
 */
export function createSuccessResponse<T>(data: T, extra: any = {}) {
  return {
    success: true,
    data,
    ...extra,
  };
}

/**
 * Create API error response
 */
export function createErrorResponse(message: string, status = 500) {
  return {
    success: false,
    error: message,
    status,
  };
}

/**
 * Create paginated response
 */
export function createPaginatedResponse<T>(
  items: T[],
  page = 1,
  limit = 20,
  total?: number
) {
  const actualTotal = total ?? items.length;
  
  return createSuccessResponse({
    items,
    total: actualTotal,
    page,
    limit,
    totalPages: Math.ceil(actualTotal / limit),
  });
}