/**
 * Stack Overflow Blog記事の総合的な修正
 * 1. コンテンツのエンリッチメント
 * 2. 詳細要約の再生成
 */

import { PrismaClient } from '@prisma/client';
import { StackOverflowEnricher } from '../../lib/enrichers/stackoverflow';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();
const enricher = new StackOverflowEnricher();
const summaryService = new UnifiedSummaryService();

interface ArticleToFix {
  id: string;
  title: string;
  url: string;
  content: string | null;
  detailedSummary: string | null;
  needsEnrichment: boolean;
  needsSummary: boolean;
}

async function analyzeArticles(): Promise<ArticleToFix[]> {
  console.error('=== Stack Overflow Blog記事の分析 ===\n');
  
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
  
  const toFix: ArticleToFix[] = [];
  
  for (const article of articles) {
    const contentLen = article.content?.length || 0;
    const summaryLen = article.detailedSummary?.length || 0;
    const hasProperSections = article.detailedSummary?.includes('：') || article.detailedSummary?.includes(':');
    
    // エンリッチメントが必要: コンテンツが1000文字未満
    const needsEnrichment = contentLen < 1000;
    
    // 要約再生成が必要: 要約が不足またはセクション形式でない
    const needsSummary = summaryLen < 100 || !hasProperSections || 
                        (contentLen >= 5000 && summaryLen < 800) ||
                        (contentLen >= 3000 && summaryLen < 600);
    
    if (needsEnrichment || needsSummary) {
      toFix.push({
        id: article.id,
        title: article.title,
        url: article.url,
        content: article.content,
        detailedSummary: article.detailedSummary,
        needsEnrichment,
        needsSummary
      });
    }
  }
  
  return toFix;
}

async function enrichArticle(article: ArticleToFix): Promise<string | null> {
  try {
    console.error(`  エンリッチメント実行中...`);
    const enrichedData = await enricher.enrich(article.url);
    
    if (enrichedData?.content && enrichedData.content.length > 500) {
      await prisma.article.update({
        where: { id: article.id },
        data: {
          content: enrichedData.content,
          ...(enrichedData.thumbnail && { thumbnail: enrichedData.thumbnail })
        }
      });
      
      console.error(`  ✅ エンリッチ成功: ${article.content?.length || 0} → ${enrichedData.content.length}文字`);
      return enrichedData.content;
    } else {
      console.error(`  ⚠️ エンリッチ失敗またはコンテンツ不足`);
      return null;
    }
  } catch (error) {
    console.error(`  ❌ エンリッチエラー:`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function regenerateSummary(article: ArticleToFix, content: string): Promise<boolean> {
  try {
    console.error(`  要約再生成実行中...`);
    
    const result = await summaryService.generate(
      article.title,
      content,
      undefined,
      {
        sourceName: 'Stack Overflow Blog',
        url: article.url
      }
    );
    
    if (result && result.detailedSummary.length > 100) {
      // セクション形式の確認
      const hasProperSections = result.detailedSummary.includes('：') || result.detailedSummary.includes(':');
      
      if (hasProperSections) {
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: result.summary,
            detailedSummary: result.detailedSummary,
            summaryVersion: result.summaryVersion,
            articleType: result.articleType
          }
        });
        
        const sectionCount = result.detailedSummary.split('\n').filter(line => 
          line.includes('：') || line.includes(':')).length;
        
        console.error(`  ✅ 要約再生成成功: ${result.detailedSummary.length}文字, ${sectionCount}セクション`);
        return true;
      } else {
        console.error(`  ⚠️ セクション形式でない要約が生成されました`);
        return false;
      }
    } else {
      console.error(`  ❌ 要約生成失敗`);
      return false;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ 要約生成エラー:`, errorMsg);
    
    // Rate limitエラーの場合は長めに待機
    if (errorMsg.includes('503') || errorMsg.includes('429')) {
      console.error('  ⏳ Rate limit検出。60秒待機...');
      await new Promise(resolve => setTimeout(resolve, 60000));
    }
    
    return false;
  }
}

async function fixArticles(articles: ArticleToFix[]) {
  console.error(`\n=== ${articles.length}件の記事を修正 ===\n`);
  
  let enrichSuccess = 0;
  let enrichFailed = 0;
  let summarySuccess = 0;
  let summaryFailed = 0;
  
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.error(`\n[${i + 1}/${articles.length}] ${article.title.substring(0, 60)}...`);
    console.error(`  現在: コンテンツ ${article.content?.length || 0}文字, 要約 ${article.detailedSummary?.length || 0}文字`);
    console.error(`  必要: エンリッチ ${article.needsEnrichment ? '✓' : '×'}, 要約再生成 ${article.needsSummary ? '✓' : '×'}`);
    
    let content = article.content || '';
    
    // 1. エンリッチメントが必要な場合
    if (article.needsEnrichment) {
      const enrichedContent = await enrichArticle(article);
      if (enrichedContent) {
        content = enrichedContent;
        enrichSuccess++;
        // エンリッチ後は必ず要約再生成が必要
        article.needsSummary = true;
      } else {
        enrichFailed++;
        // エンリッチ失敗の場合、コンテンツが不足なら要約生成をスキップ
        if (!content || content.length < 500) {
          console.error(`  ⚠️ コンテンツ不足のため要約生成をスキップ`);
          continue;
        }
      }
      
      // Rate limit対策
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // 2. 要約再生成が必要な場合
    if (article.needsSummary && content && content.length >= 500) {
      const success = await regenerateSummary(article, content);
      if (success) {
        summarySuccess++;
      } else {
        summaryFailed++;
      }
      
      // Rate limit対策
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // 10件ごとに進捗報告
    if ((i + 1) % 10 === 0) {
      console.error(`\n--- 進捗: ${i + 1}/${articles.length}件完了 ---`);
      console.error(`エンリッチ: 成功 ${enrichSuccess}, 失敗 ${enrichFailed}`);
      console.error(`要約再生成: 成功 ${summarySuccess}, 失敗 ${summaryFailed}\n`);
    }
  }
  
  console.error('\n=== 処理完了 ===');
  console.error(`エンリッチメント: 成功 ${enrichSuccess}件, 失敗 ${enrichFailed}件`);
  console.error(`要約再生成: 成功 ${summarySuccess}件, 失敗 ${summaryFailed}件`);
}

async function main() {
  try {
    const articles = await analyzeArticles();
    
    const needsEnrichment = articles.filter(a => a.needsEnrichment);
    const needsSummary = articles.filter(a => a.needsSummary);
    
    console.error(`分析結果:`);
    console.error(`- エンリッチメントが必要: ${needsEnrichment.length}件`);
    console.error(`- 要約再生成が必要: ${needsSummary.length}件`);
    console.error(`- 修正が必要な記事: ${articles.length}件`);
    
    if (articles.length === 0) {
      console.error('\n修正が必要な記事はありません');
      return;
    }
    
    console.error('\n--- 修正が必要な記事（最初の10件） ---');
    articles.slice(0, 10).forEach((article, i) => {
      console.error(`${i + 1}. ${article.title.substring(0, 60)}...`);
      console.error(`   コンテンツ: ${article.content?.length || 0}文字 ${article.needsEnrichment ? '(要エンリッチ)' : ''}`);
      console.error(`   要約: ${article.detailedSummary?.length || 0}文字 ${article.needsSummary ? '(要再生成)' : ''}`);
    });
    
    // 実行確認
    console.error('\n処理を開始しますか？ (Ctrl+Cでキャンセル)');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await fixArticles(articles);
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);