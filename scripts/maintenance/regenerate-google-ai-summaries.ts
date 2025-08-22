/**
 * Google AI Blog 要約再生成スクリプト
 * エンリッチメントされたGoogle AI Blog記事の要約を再生成
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();
const summaryService = new UnifiedSummaryService();

async function regenerateSummaries() {
  console.log('=== Google AI Blog要約再生成 ===');
  
  try {
    // エンリッチメントされたGoogle AI Blog記事を取得
    const articles = await prisma.article.findMany({
      where: {
        source: {
          name: 'Google AI Blog'
        },
        // コンテンツが充実している記事のみ対象
        content: {
          not: null
        },
        OR: [
          // 要約がない
          { summary: null },
          // 詳細要約がない
          { detailedSummary: null },
          // 旧バージョンの要約（summaryVersion < 7）
          { summaryVersion: { lt: 7 } },
          // 要約が短すぎる
          { detailedSummary: { contains: '__SKIP' } }
        ]
      },
      include: {
        source: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });
    
    console.log(`要約再生成が必要な記事: ${articles.length}件`);
    
    if (articles.length === 0) {
      console.log('再生成対象の記事がありません。');
      return;
    }
    
    let successCount = 0;
    let failedCount = 0;
    
    for (const article of articles) {
      try {
        console.log(`\n生成中: ${article.title}`);
        console.log(`コンテンツ長: ${article.content?.length || 0}文字`);
        
        if (!article.content || article.content.length < 500) {
          console.log('⚠️ コンテンツが不十分のためスキップ');
          failedCount++;
          continue;
        }
        
        // 要約生成（統一フォーマット、summaryVersion: 7）
        const result = await summaryService.generate(
          article.title,
          article.content,
          undefined,
          {
            sourceName: 'Google AI Blog',
            url: article.url
          }
        );
        
        if (result) {
          // データベース更新
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              summaryVersion: 7,  // 最新バージョン
              articleType: 'unified'
            }
          });
          
          console.log('✅ 要約生成成功');
          console.log(`  一覧要約: ${result.summary.length}文字`);
          console.log(`  詳細要約: ${result.detailedSummary.length}文字`);
          
          // 詳細要約の最初の3行を表示
          const detailLines = result.detailedSummary.split('\n').slice(0, 3);
          detailLines.forEach(line => {
            console.log(`  ${line.substring(0, 60)}${line.length > 60 ? '...' : ''}`);
          });
          
          successCount++;
        } else {
          console.log('❌ 要約生成失敗');
          failedCount++;
        }
        
        // Rate limit対策（Gemini API）
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        console.error(`エラー (記事ID: ${article.id}):`, error);
        failedCount++;
        
        // Rate limitエラーの場合は長めに待機
        if (error instanceof Error && (error.message.includes('429') || error.message.includes('503'))) {
          console.log('⏳ Rate limit検出、60秒待機...');
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
      }
    }
    
    console.log('\n=== 要約再生成完了 ===');
    console.log(`成功: ${successCount}件`);
    console.log(`失敗: ${failedCount}件`);
    
    // 再生成後の統計
    if (successCount > 0) {
      const updatedArticles = await prisma.article.findMany({
        where: {
          source: {
            name: 'Google AI Blog'
          },
          summaryVersion: 7
        }
      });
      
      console.log(`\nsummaryVersion 7の記事: ${updatedArticles.length}件`);
      
      const avgDetailedSummaryLength = updatedArticles
        .filter(a => a.detailedSummary)
        .reduce((sum, a) => sum + (a.detailedSummary?.length || 0), 0) / updatedArticles.length;
      
      console.log(`平均詳細要約長: ${Math.round(avgDetailedSummaryLength)}文字`);
    }
    
  } catch (error) {
    console.error('要約再生成失敗:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
regenerateSummaries().catch(console.error);