#!/usr/bin/env tsx

/**
 * テストデータベースのセットアップスクリプト
 * PostgreSQLテストDBにスキーマとテストデータを投入する
 */

import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

// テストDB接続設定
const TEST_DATABASE_URL = 'postgresql://postgres@localhost:5433/techtrend_test';

// 環境変数を上書き
process.env.DATABASE_URL = TEST_DATABASE_URL;

// PrismaClientを初期化（明示的にURLを指定）
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: TEST_DATABASE_URL
    }
  }
});

async function setupTestDatabase() {
  // 環境チェック
  if (process.env.NODE_ENV !== 'test' && !process.env.FORCE_TEST_SETUP) {
    console.error('ERROR: This script should only run in test environment');
    console.error('Set NODE_ENV=test or FORCE_TEST_SETUP=true to continue');
    process.exit(1);
  }

  if (!TEST_DATABASE_URL.includes('test')) {
    console.error('ERROR: DATABASE_URL must point to test database');
    console.error('URL must contain "test" in database name');
    process.exit(1);
  }

  try {
    console.error('Setting up test database...');
    console.error('Database URL:', TEST_DATABASE_URL);
    console.error('Environment:', process.env.NODE_ENV || 'development');
    
    // 接続テスト
    console.error('Testing connection...');
    await prisma.$connect();
    console.error('Connected successfully!');
    
    // テスト環境でのみデータクリア
    if (process.env.NODE_ENV === 'test' || process.env.FORCE_TEST_SETUP) {
      console.error('Clearing existing data...');
      await prisma.articleView.deleteMany();
      await prisma.favorite.deleteMany();
      await prisma.article.deleteMany();
      await prisma.tag.deleteMany();
      await prisma.source.deleteMany();
      await prisma.account.deleteMany();
      await prisma.verificationToken.deleteMany();
      await prisma.user.deleteMany();
    } else {
      console.error('Safety check failed: Not in test environment');
      process.exit(1);
    }
    
    // ソース作成
    console.error('Creating sources...');
    const sources = await Promise.all([
      prisma.source.create({
        data: { name: 'Dev.to', type: 'API', url: 'https://dev.to/api/articles', enabled: true }
      }),
      prisma.source.create({
        data: { name: 'Qiita', type: 'API', url: 'https://qiita.com/api/v2/items', enabled: true }
      }),
      prisma.source.create({
        data: { name: 'Zenn', type: 'RSS', url: 'https://zenn.dev/feed', enabled: true }
      }),
      prisma.source.create({
        data: { name: 'はてなブックマーク', type: 'RSS', url: 'https://b.hatena.ne.jp/hotentry/it.rss', enabled: true }
      }),
      prisma.source.create({
        data: { name: 'Publickey', type: 'RSS', url: 'https://www.publickey1.jp/atom.xml', enabled: true }
      }),
    ]);
    console.error(`Created ${sources.length} sources`);
    
    // タグ作成
    console.error('Creating tags...');
    const tagData = [
      { name: 'JavaScript', category: 'language' },
      { name: 'TypeScript', category: 'language' },
      { name: 'Python', category: 'language' },
      { name: 'React', category: 'framework' },
      { name: 'Next.js', category: 'framework' },
      { name: 'Docker', category: 'tool' },
      { name: 'AWS', category: 'tool' },
      { name: 'Google', category: 'corporate' },
      { name: 'Microsoft', category: 'corporate' },
      { name: 'DeNA', category: 'corporate' },
      { name: 'LINEヤフー', category: 'corporate' },
      { name: 'AI', category: 'concept' },
      { name: '機械学習', category: 'concept' },
      { name: 'DevOps', category: 'concept' },
      { name: 'チュートリアル', category: null },
      { name: '初心者向け', category: null },
      { name: 'ベストプラクティス', category: null },
    ];
    
    const tags = await Promise.all(
      tagData.map(data => 
        prisma.tag.create({
          data: {
            ...data,
            count: Math.floor(Math.random() * 50) + 1
          }
        })
      )
    );
    console.error(`Created ${tags.length} tags`);
    
    // 記事作成
    console.error('Creating articles...');
    const articles = [];
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    for (let i = 0; i < 50; i++) {
      const publishedAt = new Date(
        oneMonthAgo.getTime() + Math.random() * (now.getTime() - oneMonthAgo.getTime())
      );
      
      const randomSource = sources[Math.floor(Math.random() * sources.length)];
      const randomTagCount = Math.floor(Math.random() * 3) + 1;
      const randomTags = [...tags]
        .sort(() => 0.5 - Math.random())
        .slice(0, randomTagCount);
      
      const article = await prisma.article.create({
        data: {
          title: `テスト記事 ${i + 1}: ${randomTags[0]?.name || 'Tech'}の最新動向`,
          url: `https://example.com/articles/test-${i + 1}`,
          summary: `これはテスト記事${i + 1}の要約です。${randomTags.map(t => t.name).join('、')}に関する内容を含んでいます。`,
          detailedSummary: `テスト記事${i + 1}の詳細要約\\n\\n主要なポイント:\\n- ${randomTags[0]?.name || 'Tech'}の基本概念\\n- 実装方法`,
          thumbnail: `https://picsum.photos/seed/${i}/800/400`,
          publishedAt,
          sourceId: randomSource.id,
          bookmarks: Math.floor(Math.random() * 100),
          qualityScore: Math.random() * 100,
          userVotes: Math.floor(Math.random() * 50),
          difficulty: ['beginner', 'intermediate', 'advanced'][Math.floor(Math.random() * 3)],
          articleType: 'unified',
          summaryVersion: 7,
          tags: {
            connect: randomTags.map(tag => ({ id: tag.id }))
          }
        }
      });
      
      articles.push(article);
    }
    
    console.error(`Created ${articles.length} articles`);
    console.error('Test database setup completed successfully!');
    
  } catch (error) {
    console.error('Error setting up test database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
setupTestDatabase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });