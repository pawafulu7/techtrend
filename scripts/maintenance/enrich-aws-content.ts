/**
 * AWS Content Enrichment Script for Scheduler
 * AWS記事のコンテンツを自動的にエンリッチメント
 */

import { PrismaClient } from '@prisma/client';
import { AWSEnricher } from '../../lib/enrichers/aws';

const prisma = new PrismaClient();
const enricher = new AWSEnricher();

async function enrichAWSContent() {
  console.error('=== AWS Content Enrichment ===');
  
  try {
    // 最近追加されたAWS記事を取得（2時間以内）
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    
    // テストモード: 引数に --test が含まれる場合は24時間以内の記事を対象
    const isTestMode = process.argv.includes('--test');
    const timeThreshold = isTestMode 
      ? new Date(Date.now() - 24 * 60 * 60 * 1000)  // テスト時: 24時間
      : twoHoursAgo;  // 通常時: 2時間
    
    const articles = await prisma.article.findMany({
      where: {
        source: {
          name: 'AWS'
        },
        createdAt: {
          gte: timeThreshold
        }
      },
      include: {
        source: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });
    
    if (articles.length === 0) {
      console.error('No new AWS articles to enrich');
      return;
    }
    
    console.error(`Found ${articles.length} new AWS articles to process`);
    
    let enrichedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    
    for (const article of articles) {
      try {
        // コンテンツが既に十分な長さがある場合はスキップ（5000文字以上）
        if (article.content && article.content.length > 5000) {
          console.error(`[SKIP] Already enriched (${article.content.length} chars): ${article.title?.substring(0, 50)}...`);
          skippedCount++;
          continue;
        }
        
        // What's Newなど短い記事は元々短いことが想定される
        const isWhatsNew = article.url.includes('/whats-new/');
        const minContentLength = isWhatsNew ? 1000 : 2000;
        
        // 既に最小限のコンテンツがある場合
        if (article.content && article.content.length > minContentLength) {
          console.error(`[SKIP] Has sufficient content (${article.content.length} chars): ${article.title?.substring(0, 50)}...`);
          skippedCount++;
          continue;
        }
        
        console.error(`\nEnriching: ${article.title?.substring(0, 80)}...`);
        console.error(`Current content: ${article.content?.length || 0} chars`);
        
        // エンリッチメント実行
        const enrichedData = await enricher.enrich(article.url);
        
        if (enrichedData && enrichedData.content) {
          const currentLength = article.content?.length || 0;
          const newLength = enrichedData.content.length;
          
          // 内容が20%以上改善されている場合のみ更新
          if (newLength > currentLength * 1.2 || currentLength < 500) {
            await prisma.article.update({
              where: { id: article.id },
              data: {
                content: enrichedData.content,
                ...(enrichedData.thumbnail && { thumbnail: enrichedData.thumbnail })
              }
            });
            
            console.error(`✅ Enriched: ${currentLength} -> ${newLength} chars (+${Math.round((newLength - currentLength) / currentLength * 100)}%)`);
            enrichedCount++;
          } else {
            console.error(`[SKIP] Minimal improvement (${currentLength} -> ${newLength} chars)`);
            skippedCount++;
          }
        } else {
          console.error(`❌ Failed to enrich content`);
          failedCount++;
        }
        
        // AWSのレート制限対策（1.5秒）
        await new Promise(resolve => setTimeout(resolve, 1500));
        
      } catch (error) {
        console.error(`❌ Error processing article: ${error instanceof Error ? error.message : String(error)}`);
        failedCount++;
      }
    }
    
    // 結果サマリー
    console.error('\n=== Enrichment Summary ===');
    console.error(`✅ Enriched: ${enrichedCount} articles`);
    console.error(`⏭️  Skipped: ${skippedCount} articles`);
    console.error(`❌ Failed: ${failedCount} articles`);
    
    // 全体の統計情報を出力（デバッグ用）
    if (enrichedCount > 0) {
      console.error('\n📊 AWS Articles Statistics:');
      console.error(`Total articles: ${await prisma.article.count({ where: { source: { name: 'AWS' } } })}`);
      
      // コンテンツ長の分布
      const lengthDistribution = await prisma.$queryRaw<Array<{ range: string, count: bigint }>>`
        SELECT 
          CASE 
            WHEN LENGTH(content) < 1000 THEN '< 1K'
            WHEN LENGTH(content) < 2000 THEN '1K-2K'
            WHEN LENGTH(content) < 5000 THEN '2K-5K'
            WHEN LENGTH(content) < 10000 THEN '5K-10K'
            ELSE '10K+'
          END as range,
          COUNT(*) as count
        FROM "Article"
        WHERE "sourceId" = (SELECT id FROM "Source" WHERE name = 'AWS')
        GROUP BY range
        ORDER BY range
      `;
      
      console.error('Content length distribution:');
      lengthDistribution.forEach(({ range, count }) => {
        console.error(`  ${range}: ${count} articles`);
      });
    }
    
  } catch (error) {
    console.error('❌ Enrichment error:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// スクリプト実行
enrichAWSContent().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});