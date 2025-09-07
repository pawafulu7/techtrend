import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// シード付き疑似乱数生成器
class SeededRandom {
  private seed: number;
  
  constructor(seed: number = 12345) {
    this.seed = seed;
  }
  
  next(): number {
    // Park-Miller PRNG
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

const random = new SeededRandom(12345); // 固定シードで初期化

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5433/techtrend_test'
    }
  }
});

async function main() {
  // テストデータベースの安全確認
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5433/techtrend_test';
  
  // テストDBであることを確認（本番DBへの誤実行を防ぐ）
  if (!dbUrl.includes('test') && !dbUrl.includes('5433')) {
    console.error('🚨 ERROR: This seed script is only for test databases!');
    console.error('Database URL must contain "test" or use port 5433');
    console.error('Current URL:', dbUrl.replace(/:[^:@]+@/, ':****@')); // パスワードを隠す
    process.exit(1);
  }
  
  console.log('✅ Test database confirmed, proceeding with seed...</');
  
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
  const sources = [];
  
  // 固定IDソース（E2Eテストで使用されるID）
  sources.push(await prisma.source.upsert({
    where: { id: 'cmdq3nww70003tegxm78oydnb' },
    update: {
      name: 'Dev.to',
      type: 'API',
      url: 'https://dev.to/api/articles',
      enabled: true
    },
    create: {
      id: 'cmdq3nww70003tegxm78oydnb',
      name: 'Dev.to',
      type: 'API',
      url: 'https://dev.to/api/articles',
      enabled: true
    }
  }));
  
  sources.push(await prisma.source.upsert({
    where: { id: 'cmdq3nwwk0005tegxdjv21wae' },
    update: {
      name: 'Think IT',
      type: 'RSS',
      url: 'https://thinkit.co.jp/rss.xml',
      enabled: true
    },
    create: {
      id: 'cmdq3nwwk0005tegxdjv21wae',
      name: 'Think IT',
      type: 'RSS',
      url: 'https://thinkit.co.jp/rss.xml',
      enabled: true
    }
  }));
  
  // その他のソース（カテゴリ定義と一致するIDで作成）
  // 海外ソース
  sources.push(await prisma.source.upsert({
    where: { id: 'cmdq3nwwz0008tegx2eu8cozq' },
    update: {
      name: 'Stack Overflow Blog',
      type: 'RSS',
      url: 'https://stackoverflow.blog/feed/',
      enabled: true
    },
    create: {
      id: 'cmdq3nwwz0008tegx2eu8cozq',
      name: 'Stack Overflow Blog',
      type: 'RSS',
      url: 'https://stackoverflow.blog/feed/',
      enabled: true
    }
  }));

  // 国内情報サイト
  sources.push(await prisma.source.upsert({
    where: { id: 'cmdq3nwwp0006tegxz53w9zva' },
    update: {
      name: 'Zenn',
      type: 'RSS',
      url: 'https://zenn.dev/feed',
      enabled: true
    },
    create: {
      id: 'cmdq3nwwp0006tegxz53w9zva',
      name: 'Zenn',
      type: 'RSS',
      url: 'https://zenn.dev/feed',
      enabled: true
    }
  }));

  sources.push(await prisma.source.upsert({
    where: { id: 'cmdq3nww60000tegxi8ruki95' },
    update: {
      name: 'はてなブックマーク',
      type: 'RSS',
      url: 'https://b.hatena.ne.jp/hotentry/it.rss',
      enabled: true
    },
    create: {
      id: 'cmdq3nww60000tegxi8ruki95',
      name: 'はてなブックマーク',
      type: 'RSS',
      url: 'https://b.hatena.ne.jp/hotentry/it.rss',
      enabled: true
    }
  }));

  sources.push(await prisma.source.upsert({
    where: { id: 'cmdq3nwwf0004tegxuxj97z1k' },
    update: {
      name: 'InfoQ Japan',
      type: 'RSS',
      url: 'https://www.infoq.com/jp/feed/',
      enabled: true
    },
    create: {
      id: 'cmdq3nwwf0004tegxuxj97z1k',
      name: 'InfoQ Japan',
      type: 'RSS',
      url: 'https://www.infoq.com/jp/feed/',
      enabled: true
    }
  }));

  sources.push(await prisma.source.upsert({
    where: { id: 'cmdq3nwwu0007tegxcstlc8zt' },
    update: {
      name: 'Publickey',
      type: 'RSS',
      url: 'https://www.publickey1.jp/atom.xml',
      enabled: true
    },
    create: {
      id: 'cmdq3nwwu0007tegxcstlc8zt',
      name: 'Publickey',
      type: 'RSS',
      url: 'https://www.publickey1.jp/atom.xml',
      enabled: true
    }
  }));

  // 企業ブログ
  sources.push(await prisma.source.upsert({
    where: { id: 'mercari_tech_blog' },
    update: {
      name: 'Mercari Engineering',
      type: 'RSS',
      url: 'https://engineering.mercari.com/blog/feed.xml/',
      enabled: true
    },
    create: {
      id: 'mercari_tech_blog',
      name: 'Mercari Engineering',
      type: 'RSS',
      url: 'https://engineering.mercari.com/blog/feed.xml/',
      enabled: true
    }
  }));

  // プレゼンテーション
  sources.push(await prisma.source.upsert({
    where: { id: 'speakerdeck_8a450c43f9418ff6' },
    update: {
      name: 'Speaker Deck',
      type: 'SCRAPER',
      url: 'https://speakerdeck.com',
      enabled: true
    },
    create: {
      id: 'speakerdeck_8a450c43f9418ff6',
      name: 'Speaker Deck',
      type: 'SCRAPER',
      url: 'https://speakerdeck.com',
      enabled: true
    }
  }));

  // 他のソースは必要に応じて追加可能
  
  return sources;
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
    
    // AI関連のnullカテゴリータグ（E2Eテスト用）
    { name: 'Claude Code', category: null },
    { name: 'GitHub Copilot', category: null },
    { name: 'AI開発', category: null },
    { name: 'コード生成', category: null },
    { name: 'プロンプトエンジニアリング', category: null },
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
  const TOTAL_ARTICLES = 50; // E2Eテストのパフォーマンスを考慮して50件に削減

  // Phase 3: TypeScript記事を確実に作成（最初の10件）
  const typeScriptTag = tags.find(t => t.name === 'TypeScript');
  const reactTag = tags.find(t => t.name === 'React');
  const nextjsTag = tags.find(t => t.name === 'Next.js');
  
  for (let i = 0; i < 10; i++) {
    const publishedAt = new Date(
      oneMonthAgo.getTime() + random.next() * (now.getTime() - oneMonthAgo.getTime())
    );
    
    const relatedTags = [typeScriptTag, reactTag, nextjsTag].filter(Boolean);
    const additionalTags = [...tags]
      .filter(t => !['TypeScript', 'React', 'Next.js'].includes(t.name))
      .sort(() => 0.5 - random.next())
      .slice(0, 2);
    
    const articleTags = [...relatedTags, ...additionalTags];
    
    const article = await prisma.article.create({
      data: {
        title: `TypeScript ${i + 1}: 最新機能と実装パターン`,
        url: `https://example.com/articles/typescript-${i + 1}`,
        summary: `TypeScriptの新機能について詳しく解説。型システムの改善点と実装パターンを紹介。TypeScriptを使った開発の効率化について説明します。`,
        detailedSummary: `## TypeScript最新機能\n\n### 主要な改善点\n- 型推論の強化\n- パフォーマンスの向上\n- 新しい構文の追加\n\n### TypeScriptの実装パターン\n- ジェネリクス活用法\n- 型ガード実装\n- ユーティリティ型の使い方`,
        thumbnail: `https://picsum.photos/seed/typescript-${i}/800/400`,
        content: `# TypeScript記事${i + 1}の本文\n\nTypeScriptの詳細な技術解説。TypeScriptを使用した実装例とベストプラクティス。`,
        publishedAt,
        sourceId: sources[i % sources.length].id, // ソース別に均等配分
        bookmarks: random.nextInt(0, 99),
        qualityScore: 70 + random.next() * 30, // 高品質スコア
        userVotes: random.nextInt(0, 49),
        difficulty: 'intermediate',
        articleType: 'unified',
        summaryVersion: 7,
        tags: {
          connect: articleTags.map(tag => ({ id: tag.id })),
        },
      },
      include: {
        source: true,
        tags: true,
      },
    });
    
    articles.push(article);
  }

  // 残りの記事を各ソースに均等配分（Phase 2）
  const remainingArticles = TOTAL_ARTICLES - 10;
  const articlesPerSource = Math.floor(remainingArticles / sources.length);
  const extraArticles = remainingArticles % sources.length;
  
  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
    const source = sources[sourceIndex];
    // 最初のソースに余りの記事を追加
    const articlesToCreate = sourceIndex === 0 
      ? articlesPerSource + extraArticles 
      : articlesPerSource;
    
    for (let j = 0; j < articlesToCreate; j++) {
      const i = articles.length;
      const publishedAt = new Date(
        oneMonthAgo.getTime() + random.next() * (now.getTime() - oneMonthAgo.getTime())
      );
      
      const randomTagCount = random.nextInt(1, 5);
      const randomTags = [...tags]
        .sort(() => 0.5 - random.next())
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
          sourceId: source.id, // ソース別に均等配分
          bookmarks: random.nextInt(0, 99),
          qualityScore: random.next() * 100,
          userVotes: random.nextInt(0, 49),
          difficulty: ['beginner', 'intermediate', 'advanced'][random.nextInt(0, 2)],
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
