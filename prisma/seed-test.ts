import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5433/techtrend_test'
    }
  }
});

async function main() {
  
  // Clear existing data
  await prisma.article.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.source.deleteMany();
  await prisma.user.deleteMany();

  // Create sources
  const sources = await createSources();

  // Create tags
  const tags = await createTags();

  // Create test users
  const users = await createUsers();

  // Create articles with relationships
  const articles = await createArticles(sources, tags);

}

async function createSources() {
  const sourcesData = [
    { name: 'Dev.to', type: 'API', url: 'https://dev.to/api/articles', enabled: true },
    { name: 'Qiita', type: 'API', url: 'https://qiita.com/api/v2/items', enabled: true },
    { name: 'Zenn', type: 'RSS', url: 'https://zenn.dev/feed', enabled: true },
    { name: 'はてなブックマーク', type: 'RSS', url: 'https://b.hatena.ne.jp/hotentry/it.rss', enabled: true },
    { name: 'Publickey', type: 'RSS', url: 'https://www.publickey1.jp/atom.xml', enabled: true },
    { name: 'Stack Overflow Blog', type: 'RSS', url: 'https://stackoverflow.blog/feed/', enabled: true },
    { name: 'InfoQ Japan', type: 'RSS', url: 'https://www.infoq.com/jp/feed/', enabled: true },
    { name: 'Think IT', type: 'RSS', url: 'https://thinkit.co.jp/rss.xml', enabled: true },
    { name: 'Speaker Deck', type: 'SCRAPING', url: 'https://speakerdeck.com', enabled: true },
    { name: 'Corporate Tech Blog', type: 'RSS', url: 'https://techblog.example.com/feed', enabled: true },
  ];

  return Promise.all(
    sourcesData.map(data => prisma.source.create({ data }))
  );
}

async function createTags() {
  const categories = ['language', 'framework', 'tool', 'corporate', 'concept', null];
  const tagNames = [
    // Language tags
    { name: 'JavaScript', category: 'language' },
    { name: 'TypeScript', category: 'language' },
    { name: 'Python', category: 'language' },
    { name: 'Go', category: 'language' },
    { name: 'Rust', category: 'language' },
    { name: 'Java', category: 'language' },
    { name: 'Ruby', category: 'language' },
    { name: 'PHP', category: 'language' },
    { name: 'Swift', category: 'language' },
    { name: 'Kotlin', category: 'language' },
    
    // Framework tags
    { name: 'React', category: 'framework' },
    { name: 'Vue.js', category: 'framework' },
    { name: 'Next.js', category: 'framework' },
    { name: 'Angular', category: 'framework' },
    { name: 'Express', category: 'framework' },
    { name: 'Django', category: 'framework' },
    { name: 'Rails', category: 'framework' },
    { name: 'Spring', category: 'framework' },
    { name: 'Laravel', category: 'framework' },
    { name: 'FastAPI', category: 'framework' },
    
    // Tool tags
    { name: 'Docker', category: 'tool' },
    { name: 'Kubernetes', category: 'tool' },
    { name: 'Git', category: 'tool' },
    { name: 'GitHub', category: 'tool' },
    { name: 'AWS', category: 'tool' },
    { name: 'GCP', category: 'tool' },
    { name: 'Azure', category: 'tool' },
    { name: 'PostgreSQL', category: 'tool' },
    { name: 'MongoDB', category: 'tool' },
    { name: 'Redis', category: 'tool' },
    
    // Corporate tags
    { name: 'Google', category: 'corporate' },
    { name: 'Microsoft', category: 'corporate' },
    { name: 'Apple', category: 'corporate' },
    { name: 'Amazon', category: 'corporate' },
    { name: 'Meta', category: 'corporate' },
    { name: 'Netflix', category: 'corporate' },
    { name: 'Spotify', category: 'corporate' },
    { name: 'Uber', category: 'corporate' },
    { name: 'Airbnb', category: 'corporate' },
    { name: 'DeNA', category: 'corporate' },
    { name: 'LINEヤフー', category: 'corporate' },
    { name: 'サイバーエージェント', category: 'corporate' },
    { name: 'メルカリ', category: 'corporate' },
    { name: 'マネーフォワード', category: 'corporate' },
    
    // Concept tags
    { name: 'AI', category: 'concept' },
    { name: '機械学習', category: 'concept' },
    { name: 'DevOps', category: 'concept' },
    { name: 'CI/CD', category: 'concept' },
    { name: 'マイクロサービス', category: 'concept' },
    { name: 'セキュリティ', category: 'concept' },
    
    // Uncategorized tags
    { name: 'チュートリアル', category: null },
    { name: '初心者向け', category: null },
    { name: 'ベストプラクティス', category: null },
    { name: 'アーキテクチャ', category: null },
  ];

  return Promise.all(
    tagNames.map(({ name, category }) =>
      prisma.tag.create({
        data: {
          name,
          category,
        },
      })
    )
  );
}

async function createUsers() {
  // Hash password for test users
  const hashedPassword = await bcrypt.hash('TestPassword123', 10);
  
  const usersData = [
    {
      email: 'test@example.com',  // Main test user for E2E tests
      name: 'Test User',
      password: hashedPassword,
      emailVerified: new Date(),
    },
    {
      email: 'test1@example.com',
      name: 'Test User 1',
      password: hashedPassword,
      emailVerified: new Date(),
    },
    {
      email: 'test2@example.com',
      name: 'Test User 2',
      password: hashedPassword,
      emailVerified: new Date(),
    },
    {
      email: 'test3@example.com',
      name: 'Test User 3',
      emailVerified: null,
    },
  ];

  return Promise.all(
    usersData.map(data => prisma.user.create({ data }))
  );
}

async function createArticles(sources: any[], tags: any[]) {
  const articles = [];
  const now = new Date();
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (let i = 0; i < 100; i++) {
    const publishedAt = new Date(
      oneMonthAgo.getTime() + Math.random() * (now.getTime() - oneMonthAgo.getTime())
    );
    
    const randomSource = sources[Math.floor(Math.random() * sources.length)];
    const randomTagCount = Math.floor(Math.random() * 5) + 1;
    const randomTags = [...tags]
      .sort(() => 0.5 - Math.random())
      .slice(0, randomTagCount);

    const article = await prisma.article.create({
      data: {
        title: `テスト記事 ${i + 1}: ${randomTags[0]?.name || 'Tech'}の最新動向`,
        url: `https://example.com/articles/test-${i + 1}`,
        summary: `これはテスト記事${i + 1}の要約です。${randomTags.map(t => t.name).join('、')}に関する内容を含んでいます。最新の技術トレンドや実装方法について詳しく解説しています。`,
        detailedSummary: `## テスト記事${i + 1}の詳細要約\n\n### 主要なポイント\n- ${randomTags[0]?.name || 'Tech'}の基本概念\n- 実装方法とベストプラクティス\n- パフォーマンス最適化のテクニック\n\n### 技術スタック\n${randomTags.map(t => `- ${t.name}`).join('\n')}\n\n### まとめ\nこの記事では、最新の技術動向について包括的に解説しました。`,
        thumbnail: `https://picsum.photos/seed/${i}/800/400`,
        content: `# テスト記事${i + 1}の本文\n\nこれはテスト用の記事本文です。実際のコンテンツがここに入ります。`,
        publishedAt,
        sourceId: randomSource.id,
        bookmarks: Math.floor(Math.random() * 100),
        qualityScore: Math.random() * 100,
        userVotes: Math.floor(Math.random() * 50),
        difficulty: ['beginner', 'intermediate', 'advanced'][Math.floor(Math.random() * 3)],
        articleType: 'unified',
        summaryVersion: 7,
        tags: {
          connect: randomTags.map(tag => ({ id: tag.id })),
        },
      },
      include: {
        source: true,
        tags: true,
      },
    });

    articles.push(article);
  }

  return articles;
}

main()
  .catch((e) => {
    console.error('Prisma test seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
