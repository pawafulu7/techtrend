/**
 * Stack Overflow Blog残りの問題記事を修正
 * 主に要約が25文字の記事を処理
 */

import { PrismaClient } from '@prisma/client';
import { StackOverflowEnricher } from '../../lib/enrichers/stackoverflow';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();
const enricher = new StackOverflowEnricher();
const summaryService = new UnifiedSummaryService();

async function main() {
  try {
    console.error('=== Stack Overflow Blog残りの問題記事を修正 ===\n');
    
    // 要約が25文字の記事を優先的に取得
    const articles = await prisma.article.findMany({
      where: {
        source: {
          name: 'Stack Overflow Blog'
        },
        detailedSummary: {
          equals: '__SKIP_DETAILED_SUMMARY__'
        }
      },
      include: {
        source: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });
    
    console.error(`要約25文字の記事: ${articles.length}件\n`);
    
    if (articles.length === 0) {
      console.error('処理対象の記事がありません');
      return;
    }
    
    let enrichSuccess = 0;
    let summarySuccess = 0;
    let failedIds: string[] = [];
    
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      console.error(`[${i + 1}/${articles.length}] ${article.title.substring(0, 60)}...`);
      
      let content = article.content || '';
      const contentLen = content.length;
      console.error(`  現在のコンテンツ: ${contentLen}文字`);
      
      // 1. コンテンツが不足している場合はエンリッチメント
      if (contentLen < 500) {
        try {
          console.error(`  エンリッチメント実行中...`);
          const enrichedData = await enricher.enrich(article.url);
          
          if (enrichedData?.content && enrichedData.content.length > 300) {
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
            console.error(`  ⚠️ エンリッチ失敗またはコンテンツ不足`);
            failedIds.push(article.id);
            continue;
          }
        } catch (error) {
          console.error(`  ❌ エンリッチエラー:`, error instanceof Error ? error.message : error);
          failedIds.push(article.id);
          continue;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // 2. 要約生成（コンテンツが十分な場合）
      if (content && content.length >= 300) {
        try {
          console.error(`  要約生成実行中...`);
          
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
              
              console.error(`  ✅ 要約生成成功: ${result.detailedSummary.length}文字, ${sectionCount}セクション`);
              summarySuccess++;
            } else {
              console.error(`  ⚠️ セクション形式でない要約が生成されました`);
              failedIds.push(article.id);
            }
          } else {
            console.error(`  ❌ 要約生成失敗`);
            failedIds.push(article.id);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`  ❌ 要約生成エラー:`, errorMsg);
          failedIds.push(article.id);
          
          if (errorMsg.includes('503') || errorMsg.includes('429')) {
            console.error('  ⏳ Rate limit検出。60秒待機...');
            await new Promise(resolve => setTimeout(resolve, 60000));
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        console.error(`  ⚠️ コンテンツ不足のため要約生成をスキップ`);
        failedIds.push(article.id);
      }
      
      // 10件ごとに進捗報告
      if ((i + 1) % 10 === 0) {
        console.error(`\n--- 進捗: ${i + 1}/${articles.length}件完了 ---`);
        console.error(`エンリッチ成功: ${enrichSuccess}, 要約成功: ${summarySuccess}, 失敗: ${failedIds.length}\n`);
      }
    }
    
    console.error('\n=== 処理完了 ===');
    console.error(`エンリッチメント成功: ${enrichSuccess}件`);
    console.error(`要約生成成功: ${summarySuccess}件`);
    console.error(`処理失敗: ${failedIds.length}件`);
    
    if (failedIds.length > 0) {
      console.error('\n処理失敗した記事ID:');
      failedIds.forEach(id => console.error(`  - ${id}`));
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);