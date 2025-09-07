import { PrismaClient, Source, Tag } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// シード付き疑似乱数生成器
class SeededRandom {
  private seed: number;
  
  constructor(seed: number = 12345) {
    // Park-Millerの定義域（1..2147483646）に正規化
    const m = 2147483647;
    this.seed = Math.trunc(seed) % m;
    if (this.seed <= 0) this.seed += (m - 1);
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

// Fisher-Yatesシャッフルアルゴリズム（決定的なシャッフル）
function shuffle<T>(arr: T[], rng: SeededRandom): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 環境変数E2E_SEEDがあれば使用、なければデフォルト値12345
const random = new SeededRandom(
  Number.isFinite(Number(process.env.E2E_SEED))
    ? Number(process.env.E2E_SEED)
    : 12345
);

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
  
  // テストDBであることを厳密に確認（本番DB誤実行防止）
  const url = new URL(dbUrl);
  const dbName = url.pathname.replace(/^\//, '');
  const hostOk = ['localhost', '127.0.0.1'].includes(url.hostname);
  // CI環境（GitHub Actions等）では5432ポート、ローカル開発環境では5433ポートを許可
  const isCI = process.env.CI === 'true';
  const portOk = isCI ? url.port === '5432' : url.port === '5433';
  // より厳密なテストDB名チェック（_testで終わる、またはtechtrend_testという名前）
  const nameOk = /(\_test\b|techtrend\_test)/i.test(dbName);
  const override = process.env.E2E_SEED_FORCE === '1';
  
  if (!(hostOk && portOk && nameOk) && !override) {
    const expectedPort = isCI ? '5432' : '5433';
    console.error(`🚨 ERROR: local test DB only (host=localhost, port=${expectedPort}, db name contains "test") or set E2E_SEED_FORCE=1.`);
    const masked = new URL(dbUrl);
    if (masked.password) masked.password = '****';
    console.error('Current URL:', masked.toString());
    console.error('CI environment:', isCI ? 'Yes' : 'No');
    process.exit(1);
  }
  
  console.log('✅ Test database confirmed. Proceeding with seed...');
  
  // Clear existing data (トランザクションで一括削除)
  await prisma.$transaction([
    prisma.article.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.source.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // Create sources
  const sources = await createSources();

  // Create tags
  const tags = await createTags();

  // Create test users
  await createUsers();

  // Create articles with relationships
  await createArticles(sources, tags);

}

// ヘルパー関数：ソースを作成または更新
async function ensureSource(id: string, name: string, type: 'RSS' | 'API' | 'SCRAPER', url: string) {
  return await prisma.source.upsert({
    where: { id },
    update: {
      name,
      type,
      url,
      enabled: true,
      // updatedAtは自動更新に任せる
    },
    create: {
      id,
      name,
      type,
      url,
      enabled: true
    }
  });
}

async function createSources() {
  const sources = [];
  
  // 固定IDソース（E2Eテストで使用されるID）
  sources.push(await ensureSource(
    'cmdq3nww70003tegxm78oydnb',
    'Dev.to',
    'API',
    'https://dev.to/api/articles'
  ));
  
  sources.push(await ensureSource(
    'cmdq3nwwk0005tegxdjv21wae',
    'Think IT',
    'RSS',
    'https://thinkit.co.jp/rss.xml'
  ));
  
  // その他のソース（カテゴリ定義と一致するIDで作成）
  // 海外ソース
  sources.push(await ensureSource(
    'cmdq3nwwz0008tegx2eu8cozq',
    'Stack Overflow Blog',
    'RSS',
    'https://stackoverflow.blog/feed/'
  ));

  // 国内情報サイト
  sources.push(await ensureSource(
    'cmdq3nwwp0006tegxz53w9zva',
    'Zenn',
    'RSS',
    'https://zenn.dev/feed'
  ));

  sources.push(await ensureSource(
    'cmdq3nww60000tegxi8ruki95',
    'はてなブックマーク',
    'RSS',
    'https://b.hatena.ne.jp/hotentry/it.rss'
  ));

  sources.push(await ensureSource(
    'cmdq3nwwf0004tegxuxj97z1k',
    'InfoQ Japan',
    'RSS',
    'https://www.infoq.com/jp/feed/'
  ));

  sources.push(await ensureSource(
    'cmdq3nwwu0007tegxcstlc8zt',
    'Publickey',
    'RSS',
    'https://www.publickey1.jp/atom.xml'
  ));

  // 企業ブログ
  sources.push(await ensureSource(
    'mercari_tech_blog',
    'Mercari Engineering',
    'RSS',
    'https://engineering.mercari.com/blog/feed.xml/'
  ));

  // プレゼンテーション
  sources.push(await ensureSource(
    'speakerdeck_8a450c43f9418ff6',
    'Speaker Deck',
    'SCRAPER',
    'https://speakerdeck.com'
  ));

  // 他のソースは必要に応じて追加可能
  
  return sources;
}

async function createTags() {
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

async function createArticles(sources: Source[], tags: Tag[]) {
  const articles = [];
  const now = new Date();
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  // 環境変数で記事数を設定可能に（デフォルトはPR目標値）
  const TOTAL_ARTICLES = parseInt(process.env.E2E_TOTAL_ARTICLES ?? '200', 10);
  const TS_ARTICLE_COUNT = parseInt(process.env.E2E_TS_ARTICLES ?? '20', 10);
  
  // バリデーション
  if (!Number.isFinite(TOTAL_ARTICLES) || !Number.isFinite(TS_ARTICLE_COUNT) || TOTAL_ARTICLES < TS_ARTICLE_COUNT) {
    throw new Error(`Invalid article counts: TOTAL_ARTICLES=${TOTAL_ARTICLES}, TS_ARTICLE_COUNT=${TS_ARTICLE_COUNT}`);
  }

  // Phase 3: TypeScript記事を確実に作成（最初の10件）
  const typeScriptTag = tags.find(t => t.name === 'TypeScript');
  const reactTag = tags.find(t => t.name === 'React');
  const nextjsTag = tags.find(t => t.name === 'Next.js');
  
  // 必須タグの存在チェック
  if (!typeScriptTag || !reactTag || !nextjsTag) {
    throw new Error('Required tags missing: TypeScript/React/Next.js');
  }
  
  for (let i = 0; i < TS_ARTICLE_COUNT; i++) {
    const publishedAt = new Date(
      oneMonthAgo.getTime() + random.next() * (now.getTime() - oneMonthAgo.getTime())
    );
    
    const relatedTags = [typeScriptTag, reactTag, nextjsTag].filter(Boolean);
    const additionalTags = shuffle(
      [...tags].filter(t => !['TypeScript', 'React', 'Next.js'].includes(t.name)),
      random
    ).slice(0, 2);
    
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
        qualityScore: random.nextInt(70, 100), // 高品質スコア（整数・100含む）
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
  const remainingArticles = TOTAL_ARTICLES - TS_ARTICLE_COUNT;
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
      const randomTags = shuffle([...tags], random).slice(0, randomTagCount);

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
          qualityScore: random.nextInt(0, 100), // 品質スコア（0-100の整数）
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
