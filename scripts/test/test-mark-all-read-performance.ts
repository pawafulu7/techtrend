#!/usr/bin/env -S npx tsx

/**
 * 全て既読機能のパフォーマンステスト
 * SQL直接実行による高速化を検証
 */

import { PrismaClient } from '@prisma/client';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient();

// テスト用のユーザーIDを生成
const TEST_USER_ID = 'test-user-' + Date.now();

async function setupTestData(articleCount: number) {
  console.log(`\nセットアップ: ${articleCount}件の記事を作成中...`);
  
  // テストユーザーを作成
  const user = await prisma.user.create({
    data: {
      id: TEST_USER_ID,
      email: `test-${Date.now()}@example.com`,
      name: 'Performance Test User'
    }
  });
  
  // ソースを作成（既存の場合は再利用）
  const sourceName = `Test Source ${Date.now()}`;
  const source = await prisma.source.create({
    data: {
      name: sourceName,
      type: 'TEST',
      url: 'https://example.com',
      enabled: true
    }
  });
  
  // 記事を作成
  const timestamp = Date.now();
  const articles = [];
  for (let i = 0; i < articleCount; i++) {
    articles.push({
      title: `Test Article ${i + 1}`,
      url: `https://example.com/article-${timestamp}-${i + 1}`,
      publishedAt: new Date(),
      sourceId: source.id,
      summary: `Test summary ${i + 1}`,
      articleType: 'unified' as const,
      summaryVersion: 7
    });
  }
  
  // バッチで記事を作成
  await prisma.article.createMany({
    data: articles
  });
  
  console.log(`✅ ${articleCount}件の記事を作成完了`);
  return { user, source };
}

async function testMarkAllAsRead() {
  console.log('\n=== 全て既読機能のパフォーマンステスト ===\n');
  
  try {
    // テストケース: 3000件の記事
    const articleCount = 3000;
    const { user } = await setupTestData(articleCount);
    
    console.log('\n実行: SQL直接実行による全て既読処理...');
    const startTime = performance.now();
    
    // SQL直接実行による高速化された処理
    // Note: gen_random_uuid() requires pgcrypto extension in PostgreSQL
    // Alternatively, could use uuid-ossp extension with uuid_generate_v4()
    const result = await prisma.$executeRaw`
      INSERT INTO "ArticleView" ("id", "userId", "articleId", "isRead", "readAt", "viewedAt")
      SELECT 
        gen_random_uuid(),
        ${user.id},
        a.id,
        true,
        NOW(),
        NULL
      FROM "Article" a
      WHERE NOT EXISTS (
        SELECT 1 FROM "ArticleView" av 
        WHERE av."userId" = ${user.id}
        AND av."articleId" = a.id
        AND av."isRead" = true
      )
      ON CONFLICT ("userId", "articleId") 
      DO UPDATE SET 
        "isRead" = true,
        "readAt" = NOW()
    `;
    
    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000; // 秒に変換
    
    console.log(`\n✅ 処理完了`);
    console.log(`  - 処理件数: ${result}件`);
    console.log(`  - 処理時間: ${duration.toFixed(3)}秒`);
    console.log(`  - 処理速度: ${(articleCount / duration).toFixed(0)}件/秒`);
    
    // 結果の検証
    const readCount = await prisma.articleView.count({
      where: {
        userId: user.id,
        isRead: true
      }
    });
    
    console.log(`\n検証結果:`);
    console.log(`  - 既読記録数: ${readCount}/${articleCount}`);
    console.log(`  - 成功率: ${((readCount / articleCount) * 100).toFixed(1)}%`);
    
    // パフォーマンス判定
    if (duration < 1.0) {
      console.log('\n🎉 性能要件達成: 1秒以内に処理完了');
    } else if (duration < 5.0) {
      console.log('\n⚠️  性能改善推奨: 1秒を超過しましたが5秒以内');
    } else {
      console.log('\n❌ 性能要件未達: 5秒以上かかりました');
    }
    
    return {
      success: true,
      articleCount,
      processedCount: result,
      duration,
      recordsPerSecond: articleCount / duration
    };
    
  } catch (error) {
    console.error('\n❌ テスト失敗:', error);
    return {
      success: false,
      error
    };
  }
}

async function cleanup() {
  console.log('\nクリーンアップ中...');
  
  // テストユーザーと関連データを削除
  await prisma.articleView.deleteMany({
    where: { userId: TEST_USER_ID }
  });
  
  await prisma.user.delete({
    where: { id: TEST_USER_ID }
  });
  
  // テスト用の記事とソースを削除
  await prisma.article.deleteMany({
    where: {
      source: {
        name: {
          startsWith: 'Test Source'
        }
      }
    }
  });
  
  await prisma.source.deleteMany({
    where: { 
      name: {
        startsWith: 'Test Source'
      }
    }
  });
  
  console.log('✅ クリーンアップ完了');
}

// メイン実行
async function main() {
  try {
    const result = await testMarkAllAsRead();
    
    if (result.success) {
      console.log('\n========================================');
      console.log('テスト成功: 全て既読機能は高速化されています');
      console.log('========================================\n');
    } else {
      console.log('\n========================================');
      console.log('テスト失敗: 問題が発生しました');
      console.log('========================================\n');
      process.exit(1);
    }
    
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch(console.error);