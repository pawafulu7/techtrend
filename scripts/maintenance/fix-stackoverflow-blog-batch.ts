/**
 * Stack Overflow Blog記事の修正（バッチ処理版）
 * 小分けにして実行可能
 */

import { PrismaClient } from '@prisma/client';
import { StackOverflowEnricher } from '../../lib/enrichers/stackoverflow';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();
const enricher = new StackOverflowEnricher();
const summaryService = new UnifiedSummaryService();

// コマンドライン引数でバッチサイズを指定可能
const BATCH_SIZE = parseInt(process.argv[2] || '10');
const START_INDEX = parseInt(process.argv[3] || '0');

async function main() {
  try {
    console.error(`=== Stack Overflow Blog修正（バッチ ${START_INDEX}-${START_INDEX + BATCH_SIZE}） ===\n`);
    
    // 問題のある記事を取得
    const allArticles = await prisma.article.findMany({
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
    
    // フィルタリング
    const problemArticles = allArticles.filter(article => {
      const contentLen = article.content?.length || 0;
      const summaryLen = article.detailedSummary?.length || 0;
      const hasProperSections = article.detailedSummary?.includes('：') || article.detailedSummary?.includes(':');
      
      return !article.content || 
             !article.detailedSummary || 
             contentLen < 1000 ||
             summaryLen < 100 ||
             !hasProperSections;
    });
    
    // バッチ分割
    const articles = problemArticles.slice(START_INDEX, START_INDEX + BATCH_SIZE);
    
    console.error(`処理対象: ${articles.length}件\n`);
    
    if (articles.length === 0) {
      console.error('処理対象の記事がありません');
      return;
    }
    
    let enrichSuccess = 0;
    let summarySuccess = 0;
    
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      console.error(`[${i + 1}/${articles.length}] ${article.title.substring(0, 60)}...`);
      
      const contentLen = article.content?.length || 0;
      const summaryLen = article.detailedSummary?.length || 0;
      console.error(`  現在: コンテンツ ${contentLen}文字, 要約 ${summaryLen}文字`);
      
      let content = article.content || '';
      
      // 1. エンリッチメント（コンテンツが不足の場合）
      if (contentLen < 1000) {
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
            
            content = enrichedData.content;
            console.error(`  ✅ エンリッチ成功: ${contentLen} → ${enrichedData.content.length}文字`);
            enrichSuccess++;
          } else {
            console.error(`  ⚠️ エンリッチ失敗`);
          }
        } catch (error) {
          console.error(`  ❌ エンリッチエラー:`, error instanceof Error ? error.message : error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // 2. 要約再生成（コンテンツが十分な場合）
      if (content && content.length >= 500) {
        const hasProperSections = article.detailedSummary?.includes('：') || article.detailedSummary?.includes(':');
        const needsSummary = !article.detailedSummary || summaryLen < 100 || !hasProperSections ||
                            (content.length >= 5000 && summaryLen < 800) ||
                            (content.length >= 3000 && summaryLen < 600);
        
        if (needsSummary) {
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
              summarySuccess++;
            } else {
              console.error(`  ❌ 要約生成失敗`);
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`  ❌ 要約生成エラー:`, errorMsg);
            
            if (errorMsg.includes('503') || errorMsg.includes('429')) {
              console.error('  ⏳ Rate limit検出。60秒待機...');
              await new Promise(resolve => setTimeout(resolve, 60000));
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }
    
    console.error('\n=== バッチ処理完了 ===');
    console.error(`エンリッチメント成功: ${enrichSuccess}件`);
    console.error(`要約再生成成功: ${summarySuccess}件`);
    
    // 残りの件数を確認
    const remainingArticles = await prisma.article.findMany({
      where: {
        source: {
          name: 'Stack Overflow Blog'
        }
      }
    });
    
    const remaining = remainingArticles.filter(article => {
      const contentLen = article.content?.length || 0;
      const summaryLen = article.detailedSummary?.length || 0;
      const hasProperSections = article.detailedSummary?.includes('：') || article.detailedSummary?.includes(':');
      
      return !article.content || 
             !article.detailedSummary || 
             contentLen < 1000 ||
             summaryLen < 100 ||
             !hasProperSections;
    }).length;
    
    if (remaining > 0) {
      console.error(`\n残り ${remaining}件の記事が要修正です`);
      console.error(`次のバッチを実行: npx tsx scripts/maintenance/fix-stackoverflow-blog-batch.ts ${BATCH_SIZE} ${START_INDEX + BATCH_SIZE}`);
    } else {
      console.error('\nすべての記事が修正されました！');
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);