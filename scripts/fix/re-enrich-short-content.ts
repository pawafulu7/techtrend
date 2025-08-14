#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { ContentEnricherFactory } from '../../lib/enrichers';

const prisma = new PrismaClient();

async function reEnrichShortContent() {
  console.log('=== Re-enriching Short Content ===\n');
  
  try {
    // 2000文字未満のコンテンツを持つ記事を取得（主に企業技術ブログ）
    const shortArticles = await prisma.article.findMany({
      where: {
        AND: [
          { content: { not: null } },
          { url: { contains: 'moneyforward-dev.jp' } }  // まずマネーフォワードに焦点
        ]
      },
      orderBy: { publishedAt: 'desc' }
    });
    
    // コンテンツが短い記事をフィルタ
    const articlesToEnrich = shortArticles.filter(article => 
      article.content && article.content.length < 2000
    );
    
    console.log(`Found ${articlesToEnrich.length} articles with short content\n`);
    
    if (articlesToEnrich.length === 0) {
      console.log('No articles need enrichment');
      return;
    }
    
    const enricherFactory = new ContentEnricherFactory();
    let successCount = 0;
    let failCount = 0;
    let improvedCount = 0;
    
    for (const article of articlesToEnrich) {
      console.log(`\nProcessing: ${article.title.substring(0, 50)}...`);
      console.log(`  Current content: ${article.content?.length || 0} chars`);
      
      const enricher = enricherFactory.getEnricher(article.url);
      if (!enricher) {
        console.log(`  No enricher available for this URL`);
        failCount++;
        continue;
      }
      
      try {
        const enrichedData = await enricher.enrich(article.url);
        
        if (enrichedData && enrichedData.content) {
          const newLength = enrichedData.content.length;
          const oldLength = article.content?.length || 0;
          
          if (newLength > oldLength) {
            // コンテンツを更新
            await prisma.article.update({
              where: { id: article.id },
              data: { 
                content: enrichedData.content,
                thumbnail: enrichedData.thumbnail || article.thumbnail
              }
            });
            
            console.log(`  ✓ Content updated: ${oldLength} -> ${newLength} chars (+${newLength - oldLength})`);
            successCount++;
            improvedCount++;
            
            // 詳細要約がスキップされていた場合はログに記録
            if (article.detailedSummary === '__SKIP_DETAILED_SUMMARY__') {
              console.log(`  ! This article needs summary regeneration (currently skipped)`);
            }
          } else {
            console.log(`  - No improvement in content length`);
            successCount++;
          }
        } else {
          console.log(`  ✗ Enrichment returned no content`);
          failCount++;
        }
        
      } catch (error) {
        console.error(`  ✗ Enrichment failed:`, error instanceof Error ? error.message : error);
        failCount++;
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 結果サマリー
    console.log('\n\n=== ENRICHMENT SUMMARY ===');
    console.log(`Total articles processed: ${articlesToEnrich.length}`);
    console.log(`Successfully enriched: ${successCount}`);
    console.log(`Content improved: ${improvedCount}`);
    console.log(`Failed: ${failCount}`);
    
    // 詳細要約が必要な記事の確認
    const needsSummaryRegeneration = await prisma.article.count({
      where: {
        AND: [
          { url: { contains: 'moneyforward-dev.jp' } },
          { detailedSummary: '__SKIP_DETAILED_SUMMARY__' }
        ]
      }
    });
    
    if (needsSummaryRegeneration > 0) {
      console.log(`\n⚠️  ${needsSummaryRegeneration} articles need summary regeneration`);
      console.log('Run the summary generation script to create detailed summaries for these articles.');
    }
    
  } catch (error) {
    console.error('Error during re-enrichment:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
reEnrichShortContent().catch(console.error);