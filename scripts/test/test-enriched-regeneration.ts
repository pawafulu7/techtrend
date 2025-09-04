/**
 * エンリッチメント済み記事再生成のテストスクリプト
 * 統合スクリプトの動作確認用
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// テスト対象ソース
const TEST_SOURCES = [
  'Stack Overflow Blog',
  'Corporate Tech Blog',
  'Cloudflare Blog',
];

async function testEnrichedArticles() {
  console.log('=== エンリッチメント済み記事のテスト ===');
  console.log('');
  
  try {
    for (const sourceName of TEST_SOURCES) {
      console.log(`\n[${sourceName}]`);
      
      // 記事を取得
      const articles = await prisma.article.findMany({
        where: {
          source: {
            name: sourceName
          }
        },
        select: {
          id: true,
          title: true,
          content: true,
          summary: true,
          detailedSummary: true,
          summaryVersion: true,
          publishedAt: true,
        },
        orderBy: {
          publishedAt: 'desc'
        },
        take: 10 // 最新10件
      });
      
      // 統計情報
      const totalArticles = articles.length;
      const enrichedArticles = articles.filter(a => a.content && a.content.length >= 2000);
      const needRegeneration = enrichedArticles.filter(a => !a.summaryVersion || a.summaryVersion < 8);
      
      console.log(`  総記事数: ${totalArticles}`);
      console.log(`  エンリッチメント済み: ${enrichedArticles.length}`);
      console.log(`  再生成対象: ${needRegeneration.length}`);
      
      // サンプル表示
      if (enrichedArticles.length > 0) {
        console.log('\n  サンプル（最新のエンリッチメント済み記事）:');
        const sample = enrichedArticles[0];
        console.log(`    ID: ${sample.id}`);
        console.log(`    タイトル: ${sample.title.substring(0, 50)}...`);
        console.log(`    コンテンツ長: ${sample.content?.length || 0}文字`);
        console.log(`    要約長: ${sample.summary?.length || 0}文字`);
        console.log(`    詳細要約長: ${sample.detailedSummary?.length || 0}文字`);
        console.log(`    バージョン: ${sample.summaryVersion || 'なし'}`);
      }
    }
    
    // 全体統計
    console.log('\n=== 全体統計 ===');
    
    const allStats = await prisma.$queryRaw<any[]>`
      SELECT 
        s.name as source_name,
        COUNT(a.id) as total,
        COUNT(CASE WHEN LENGTH(a.content) >= 2000 THEN 1 END) as enriched,
        COUNT(CASE WHEN LENGTH(a.content) >= 2000 AND (a."summaryVersion" IS NULL OR a."summaryVersion" < 8) THEN 1 END) as need_regeneration
      FROM "Article" a
      JOIN "Source" s ON a."sourceId" = s.id
      WHERE s.name IN (
        'Stack Overflow Blog',
        'Corporate Tech Blog',
        'Cloudflare Blog',
        'GitHub Blog',
        'Hacker News',
        'Medium Engineering'
      )
      GROUP BY s.name
      ORDER BY need_regeneration DESC
    `;
    
    console.log('\nソース別再生成必要数:');
    console.log('ソース名                      | 全記事 | エンリッチ済 | 要再生成 |');
    console.log('------------------------------|--------|-------------|----------|');
    
    let totalNeedRegeneration = 0;
    for (const stat of allStats) {
      console.log(
        `${stat.source_name.padEnd(29)} | ${String(stat.total).padStart(6)} | ` +
        `${String(stat.enriched).padStart(11)} | ${String(stat.need_regeneration).padStart(8)} |`
      );
      totalNeedRegeneration += parseInt(stat.need_regeneration);
    }
    
    console.log('------------------------------|--------|-------------|----------|');
    console.log(`合計再生成対象: ${totalNeedRegeneration}件`);
    
    // コマンド例を表示
    console.log('\n=== 実行コマンド例 ===');
    console.log('\n# ドライラン（対象確認のみ）:');
    console.log('npx tsx scripts/maintenance/regenerate-all-enriched-summaries.ts --dry-run');
    
    console.log('\n# Stack Overflow Blogのみテスト（5件）:');
    console.log('npx tsx scripts/maintenance/regenerate-all-enriched-summaries.ts --sources "Stack Overflow Blog" --test-mode');
    
    console.log('\n# 全ソーステストモード（各5件）:');
    console.log('npx tsx scripts/maintenance/regenerate-all-enriched-summaries.ts --test-mode --verbose');
    
    console.log('\n# 本番実行（全件）:');
    console.log('npx tsx scripts/maintenance/regenerate-all-enriched-summaries.ts --force');
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
testEnrichedArticles().catch(console.error);