/**
 * Google Developers Blog Enrichment Test Script
 * エンリッチメント機能のテスト実行（5件）
 */

import { PrismaClient } from '@prisma/client';
import { GoogleDevEnricher } from '../../lib/enrichers/google-dev';

const prisma = new PrismaClient();
const enricher = new GoogleDevEnricher();

async function testEnrichment() {
  console.log('=== Google Developers Blog Enrichment Test (5 articles) ===');
  
  try {
    // Google Developers Blogの最新5記事を取得
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
      },
      take: 5
    });
    
    console.log(`Testing with ${articles.length} articles`);
    
    for (const article of articles) {
      console.log(`\n--- ${article.title} ---`);
      console.log(`Current content length: ${article.content?.length || 0} chars`);
      
      try {
        const enrichedData = await enricher.enrich(article.url);
        
        if (enrichedData && enrichedData.content) {
          console.log(`Enriched content length: ${enrichedData.content.length} chars`);
          console.log(`Improvement: ${enrichedData.content.length - (article.content?.length || 0)} chars`);
          console.log(`Thumbnail: ${enrichedData.thumbnail ? 'Found' : 'Not found'}`);
        } else {
          console.log('Enrichment failed or returned no content');
        }
      } catch (error) {
        console.error(`Error enriching: ${error}`);
      }
      
      // Rate limit対策
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
  } catch (error) {
    console.error('Script error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testEnrichment().catch(console.error);