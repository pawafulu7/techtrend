/**
 * Google Developers Blog Content Enrichment Script
 * Google Developers Blogの記事コンテンツを完全版で取得・更新
 */

import { PrismaClient } from '@prisma/client';
import { GoogleDevEnricher } from '../../lib/enrichers/google-dev';

const prisma = new PrismaClient();
const enricher = new GoogleDevEnricher();

async function enrichGoogleDevContent() {
  console.log('=== Google Developers Blog Content Enrichment ===');
  
  try {
    // Google Developers Blogの記事を取得
    const articles = await prisma.article.findMany({
      where: {
        source: {
          name: 'Google Developers Blog'
        }
      },
      include: {
        source: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });
    
    console.log(`Found ${articles.length} Google Developers Blog articles`);
    
    let enrichedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    
    for (const article of articles) {
      try {
        // コンテンツが既に十分な長さがある場合はスキップ
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
          
          if (newLength > currentLength) {
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
enrichGoogleDevContent().catch(console.error);