#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();

async function regenerateSummariesForEnriched() {
  console.log('=== Regenerating Summaries for Enriched Articles ===\n');
  
  try {
    // 詳細要約がスキップされている記事を取得
    const articlesNeedingSummary = await prisma.article.findMany({
      where: {
        AND: [
          { url: { contains: 'moneyforward-dev.jp' } },
          { detailedSummary: '__SKIP_DETAILED_SUMMARY__' }
        ]
      },
      orderBy: { publishedAt: 'desc' }
    });
    
    console.log(`Found ${articlesNeedingSummary.length} articles needing summary regeneration\n`);
    
    if (articlesNeedingSummary.length === 0) {
      console.log('No articles need summary regeneration');
      return;
    }
    
    const summaryService = new UnifiedSummaryService();
    let successCount = 0;
    let failCount = 0;
    
    for (const article of articlesNeedingSummary) {
      console.log(`\nProcessing: ${article.title.substring(0, 50)}...`);
      console.log(`  Content length: ${article.content?.length || 0} chars`);
      
      if (!article.content || article.content.length < 100) {
        console.log(`  ✗ Content too short or missing, skipping`);
        failCount++;
        continue;
      }
      
      try {
        // 要約を生成
        console.log(`  Generating unified summary...`);
        const result = await summaryService.generate(
          article.title,
          article.content,
          undefined,
          { sourceName: 'Money Forward', url: article.url }
        );
        
        // データベースを更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: result.summary,
            detailedSummary: result.detailedSummary,
            summaryVersion: result.summaryVersion,
            articleType: result.articleType
          }
        });
        
        console.log(`  ✓ Summary regenerated successfully`);
        console.log(`    - Summary: ${result.summary.length} chars`);
        console.log(`    - Detailed: ${result.detailedSummary === '__SKIP_DETAILED_SUMMARY__' ? 'SKIPPED' : result.detailedSummary.length + ' chars'}`);
        console.log(`    - Version: ${result.summaryVersion}`);
        successCount++;
        
      } catch (error) {
        console.error(`  ✗ Summary generation failed:`, error instanceof Error ? error.message : error);
        failCount++;
      }
      
      // API レート制限対策
      console.log(`  Waiting 5 seconds for API rate limit...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // 結果サマリー
    console.log('\n\n=== SUMMARY REGENERATION RESULTS ===');
    console.log(`Total articles processed: ${articlesNeedingSummary.length}`);
    console.log(`Successfully regenerated: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    
    // 最終確認
    const remainingSkipped = await prisma.article.count({
      where: {
        AND: [
          { url: { contains: 'moneyforward-dev.jp' } },
          { detailedSummary: '__SKIP_DETAILED_SUMMARY__' }
        ]
      }
    });
    
    if (remainingSkipped === 0) {
      console.log('\n✅ All Money Forward articles now have proper summaries!');
    } else {
      console.log(`\n⚠️  ${remainingSkipped} articles still have skipped summaries`);
    }
    
  } catch (error) {
    console.error('Error during summary regeneration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
regenerateSummariesForEnriched().catch(console.error);