import { factory, primaryKey } from '@mswjs/data';
import { faker } from '@faker-js/faker';

// Create a mock database
export const db = factory({
  article: {
    id: primaryKey(() => faker.string.uuid()),
    title: () => faker.lorem.sentence(),
    url: () => faker.internet.url(),
    summary: () => {
      // Generate summary between 90-130 characters as required
      let summary = '';
      while (summary.length < 90) {
        summary += faker.lorem.sentence() + ' ';
      }
      return summary.substring(0, 120) + '。';
    },
    content: () => faker.lorem.paragraphs(3),
    publishedAt: () => faker.date.recent(),
    sourceId: () => faker.helpers.arrayElement(['qiita', 'zenn', 'devto', 'hatena']),
    thumbnail: () => faker.helpers.maybe(() => faker.image.url(), { probability: 0.5 }),
    qualityScore: () => faker.number.int({ min: 60, max: 100 }),
    summaryVersion: () => 5,
    articleType: () => 'unified',
    createdAt: () => faker.date.recent(),
    updatedAt: () => faker.date.recent(),
  },
  
  source: {
    id: primaryKey(() => faker.string.uuid()),
    name: () => faker.company.name(),
    type: () => faker.helpers.arrayElement(['rss', 'api', 'scraper']),
    url: () => faker.internet.url(),
    feedUrl: () => faker.helpers.maybe(() => faker.internet.url(), { probability: 0.7 }),
    enabled: () => true,
    createdAt: () => faker.date.past(),
    updatedAt: () => faker.date.recent(),
  },
  
  tag: {
    id: primaryKey(() => faker.string.uuid()),
    name: () => faker.helpers.arrayElement([
      'React', 'TypeScript', 'JavaScript', 'Vue', 'Next.js',
      'Node.js', 'Python', 'Go', 'Rust', 'Docker',
      'Kubernetes', 'AWS', 'DevOps', 'CI/CD', 'Testing'
    ]),
    createdAt: () => faker.date.past(),
    updatedAt: () => faker.date.recent(),
  },
});

// Seed initial data
export function seedDatabase() {
  // Create sources
  const sources = [
    db.source.create({
      id: 'qiita',
      name: 'Qiita',
      type: 'rss',
      url: 'https://qiita.com',
      enabled: true,
    }),
    db.source.create({
      id: 'zenn',
      name: 'Zenn',
      type: 'rss',
      url: 'https://zenn.dev',
      enabled: true,
    }),
    db.source.create({
      id: 'devto',
      name: 'Dev.to',
      type: 'api',
      url: 'https://dev.to',
      enabled: true,
    }),
  ];
  
  // Create tags
  const tags = [
    db.tag.create({ id: '1', name: 'React' }),
    db.tag.create({ id: '2', name: 'TypeScript' }),
    db.tag.create({ id: '3', name: 'JavaScript' }),
    db.tag.create({ id: '4', name: 'Vue' }),
    db.tag.create({ id: '5', name: 'Next.js' }),
  ];
  
  // Create articles
  for (let i = 0; i < 20; i++) {
    db.article.create({
      sourceId: faker.helpers.arrayElement(sources).id,
    });
  }
  
  return { sources, tags };
}