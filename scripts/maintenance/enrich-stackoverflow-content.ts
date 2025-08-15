/**
 * Stack Overflow Blog Content Enrichment Script
 */

import { PrismaClient } from '@prisma/client';
import { StackOverflowEnricher } from '../../lib/enrichers/stackoverflow';

const prisma = new PrismaClient();
const enricher = new StackOverflowEnricher();

async function enrichStackOverflowContent() {
  console.log('=== Stack Overflow Blog Content Enrichment ===');
  
  try {
    // コンテンツが不足しているStack Overflow Blogの記事を取得
    const articles = await prisma.article.findMany({
      where: {
        source: {
          name: 'Stack Overflow Blog'
        }
      },
      include: {
        source: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });
    
    console.log(`Found ${articles.length} Stack Overflow Blog articles with insufficient content`);
    
    let enrichedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    
    for (const article of articles) {
      try {
        // 既に十分なコンテンツがある場合はスキップ
        if (article.content && article.content.length > 1000) {
          console.log(`[SKIP] Article already has sufficient content (${article.content.length} chars): ${article.title}`);
          skippedCount++;
          continue;
        }
        
        console.log(`\nEnriching: ${article.title}`);
        console.log(`Current content length: ${article.content?.length || 0} chars`);
        
        // エンリッチメント実行
        const enrichedData = await enricher.enrich(article.url);
        
        if (enrichedData && enrichedData.content) {
          // 内容が改善されている場合のみ更新
          const currentLength = article.content?.length || 0;
          const newLength = enrichedData.content.length;
          
          if (newLength > currentLength && newLength > 500) {
            await prisma.article.update({
              where: { id: article.id },
              data: {
                content: enrichedData.content,
                ...(enrichedData.thumbnail && { thumbnail: enrichedData.thumbnail })
              }
            });
            
            console.log(`✅ Enriched: ${currentLength} -> ${newLength} chars`);
            enrichedCount++;
          } else {
            console.log(`[SKIP] New content not better (${newLength} chars)`);
            skippedCount++;
          }
        } else {
          console.log(`❌ Failed to enrich content`);
          failedCount++;
        }
        
        // Rate limit対策
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`Error enriching article ${article.id}:`, error);
        failedCount++;
      }
    }
    
    console.log('\n=== Enrichment Summary ===');
    console.log(`Total articles: ${articles.length}`);
    console.log(`Enriched: ${enrichedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Failed: ${failedCount}`);
    
  } catch (error) {
    console.error('Enrichment failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
enrichStackOverflowContent().catch(console.error);