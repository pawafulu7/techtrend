/**
 * Google AI Blog Content Enrichment Script
 * Google AI Blogの記事コンテンツを完全版で取得・更新
 */

import { PrismaClient } from '@prisma/client';
import { GoogleAIEnricher } from '../../lib/enrichers/google-ai';

const prisma = new PrismaClient();
const enricher = new GoogleAIEnricher();

async function enrichGoogleAIContent() {
  console.log('=== Google AI Blog Content Enrichment ===');
  
  try {
    // Google AI Blogの記事を取得
    const articles = await prisma.article.findMany({
      where: {
        source: {
          name: 'Google AI Blog'
        }
      },
      include: {
        source: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });
    
    console.log(`Found ${articles.length} Google AI Blog articles`);
    
    let enrichedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    
    for (const article of articles) {
      try {
        // コンテンツが既に十分な長さがある場合はスキップ
        if (article.content && article.content.length > 5000) {
          console.log(`[SKIP] Article already has sufficient content (${article.content.length} chars): ${article.title}`);
          skippedCount++;
          continue;
        }
        
        console.log(`\nEnriching: ${article.title}`);
        console.log(`Current content length: ${article.content?.length || 0} chars`);
        console.log(`URL: ${article.url}`);
        
        // URLがエンリッチャーで処理可能か確認
        if (!enricher.canHandle(article.url)) {
          console.log(`[SKIP] URL not handled by enricher: ${article.url}`);
          skippedCount++;
          continue;
        }
        
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
            if (enrichedData.thumbnail) {
              console.log(`   Thumbnail: ${enrichedData.thumbnail}`);
            }
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
    
    // エンリッチメント後の統計
    if (enrichedCount > 0) {
      const updatedArticles = await prisma.article.findMany({
        where: {
          source: {
            name: 'Google AI Blog'
          },
          content: {
            not: null
          }
        }
      });
      
      const avgContentLength = updatedArticles.reduce((sum, a) => sum + (a.content?.length || 0), 0) / updatedArticles.length;
      console.log(`\nAverage content length after enrichment: ${Math.round(avgContentLength)} characters`);
    }
    
  } catch (error) {
    console.error('Enrichment failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
enrichGoogleAIContent().catch(console.error);