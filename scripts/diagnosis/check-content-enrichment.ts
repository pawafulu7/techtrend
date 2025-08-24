#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import Parser from 'rss-parser';
import { ContentEnricherFactory } from '../../lib/enrichers';

const prisma = new PrismaClient();
const parser = new Parser();

interface DiagnosticResult {
  articleId: string;
  title: string;
  url: string;
  currentContentLength: number;
  rssContentLength: number;
  enrichedContentLength: number | null;
  enrichmentSuccess: boolean;
  enrichmentError?: string;
}

async function diagnoseContentEnrichment() {
  console.error('=== Content Enrichment Diagnostic Tool ===\n');
  
  try {
    // マネーフォワードの記事を取得
    const articles = await prisma.article.findMany({
      where: {
        url: { contains: 'moneyforward-dev.jp' }
      },
      orderBy: { publishedAt: 'desc' },
      take: 10
    });
    
    console.error(`Found ${articles.length} Money Forward articles\n`);
    
    // RSS フィードを取得
    console.error('Fetching RSS feed...');
    const feed = await parser.parseURL('https://moneyforward-dev.jp/feed');
    console.error(`RSS feed contains ${feed.items?.length || 0} items\n`);
    
    // ContentEnricherFactoryを初期化
    const enricherFactory = new ContentEnricherFactory();
    
    const results: DiagnosticResult[] = [];
    
    for (const article of articles) {
      console.error(`\n--- Diagnosing: ${article.title.substring(0, 50)}...`);
      
      // 現在のコンテンツ長
      const currentLength = article.content?.length || 0;
      console.error(`  Current content: ${currentLength} chars`);
      
      // RSSフィードから同じ記事を探す
      const rssItem = feed.items?.find(item => item.link === article.url);
      let rssLength = 0;
      if (rssItem) {
        const rssContent = rssItem.content || rssItem.contentSnippet || rssItem.description || '';
        rssLength = rssContent.length;
        console.error(`  RSS content: ${rssLength} chars`);
      } else {
        console.error(`  RSS content: Not found in feed`);
      }
      
      // ContentEnricherで取得を試みる
      let enrichedLength: number | null = null;
      let enrichmentSuccess = false;
      let enrichmentError: string | undefined;
      
      const enricher = enricherFactory.getEnricher(article.url);
      if (enricher) {
        try {
          console.error(`  Attempting enrichment...`);
          const enrichedData = await enricher.enrich(article.url);
          
          if (enrichedData && enrichedData.content) {
            enrichedLength = enrichedData.content.length;
            enrichmentSuccess = true;
            console.error(`  Enriched content: ${enrichedLength} chars ✓`);
            
            // 最初の200文字を表示（確認用）
            console.error(`  Preview: ${enrichedData.content.substring(0, 200)}...`);
          } else {
            console.error(`  Enrichment returned no content`);
            enrichmentError = 'No content returned';
          }
        } catch (error) {
          enrichmentError = error instanceof Error ? error.message : String(error);
          console.error(`  Enrichment failed: ${enrichmentError}`);
        }
      } else {
        console.error(`  No enricher available for this URL`);
        enrichmentError = 'No enricher available';
      }
      
      results.push({
        articleId: article.id,
        title: article.title,
        url: article.url,
        currentContentLength: currentLength,
        rssContentLength: rssLength,
        enrichedContentLength: enrichedLength,
        enrichmentSuccess,
        enrichmentError
      });
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 結果サマリー
    console.error('\n\n=== DIAGNOSTIC SUMMARY ===\n');
    console.error('Article Content Status:');
    console.error('------------------------');
    
    for (const result of results) {
      const status = result.enrichmentSuccess 
        ? `✓ Can be enriched to ${result.enrichedContentLength} chars`
        : `✗ Enrichment failed: ${result.enrichmentError}`;
      
      console.error(`\n${result.title.substring(0, 50)}...`);
      console.error(`  Current: ${result.currentContentLength} chars`);
      console.error(`  RSS: ${result.rssContentLength} chars`);
      console.error(`  Status: ${status}`);
    }
    
    // 統計
    const successCount = results.filter(r => r.enrichmentSuccess).length;
    const avgCurrentLength = results.reduce((sum, r) => sum + r.currentContentLength, 0) / results.length;
    const avgEnrichedLength = results
      .filter(r => r.enrichedContentLength !== null)
      .reduce((sum, r) => sum + (r.enrichedContentLength || 0), 0) / successCount || 0;
    
    console.error('\n=== STATISTICS ===');
    console.error(`Total articles analyzed: ${results.length}`);
    console.error(`Enrichment success rate: ${successCount}/${results.length} (${Math.round(successCount/results.length * 100)}%)`);
    console.error(`Average current content length: ${Math.round(avgCurrentLength)} chars`);
    if (successCount > 0) {
      console.error(`Average enriched content length: ${Math.round(avgEnrichedLength)} chars`);
      console.error(`Average improvement: ${Math.round(avgEnrichedLength - avgCurrentLength)} chars (+${Math.round((avgEnrichedLength/avgCurrentLength - 1) * 100)}%)`);
    }
    
    // 推奨事項
    console.error('\n=== RECOMMENDATIONS ===');
    if (successCount > 0) {
      console.error('✓ Content enrichment is working for most articles');
      console.error('✓ The issue is likely the 500-char condition in CorporateTechBlogFetcher');
      console.error('→ Recommendation: Change enrichment condition from "< 500" to "< 2000" chars');
    } else {
      console.error('✗ Content enrichment is failing for all articles');
      console.error('→ Check MoneyForwardContentEnricher selectors');
      console.error('→ Verify website structure hasn\'t changed');
    }
    
  } catch (error) {
    console.error('Diagnostic error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
diagnoseContentEnrichment().catch(console.error);