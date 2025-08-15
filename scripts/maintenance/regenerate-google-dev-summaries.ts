/**
 * Google Developers Blog要約再生成スクリプト
 * エンリッチされたコンテンツから日本語要約を生成
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();
const summaryService = new UnifiedSummaryService();

async function regenerateSummaries() {
  console.log('=== Google Developers Blog要約再生成 ===');
  
  try {
    // 要約が不完全な記事を取得
    const articles = await prisma.article.findMany({
      where: {
        source: {
          name: 'Google Developers Blog'
        },
        OR: [
          { summary: null },
          { detailedSummary: null },
          { detailedSummary: '__SKIP_DETAILED_SUMMARY__' },
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
    
    let successCount = 0;
    let failedCount = 0;
    
    for (const article of articles) {
      try {
        console.log(`\n生成中: ${article.title}`);
        console.log(`コンテンツ長: ${article.content?.length || 0}文字`);
        
        if (!article.content || article.content.length < 100) {
          console.log('⚠️ コンテンツが不十分のためスキップ');
          failedCount++;
          continue;
        }
        
        // 要約生成（統一フォーマット）
        const result = await summaryService.generate(
          article.title,
          article.content
        );
        
        if (result) {
          // データベース更新
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              summaryVersion: 5,  // 統一フォーマットバージョン
              articleType: 'unified'
            }
          });
          
          console.log('✅ 要約生成成功');
          console.log(`  一覧要約: ${result.summary.length}文字`);
          console.log(`  詳細要約: ${result.detailedSummary.length}文字`);
          successCount++;
        } else {
          console.log('❌ 要約生成失敗');
          failedCount++;
        }
        
        // Rate limit対策（5秒待機）
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        console.error(`エラー (${article.id}):`, error);
        failedCount++;
        
        // Rate limitエラーの場合は長めに待機
        if (error instanceof Error && error.message.includes('429')) {
          console.log('⏳ Rate limit検出。60秒待機...');
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
      }
    }
    
    console.log('\n=== 要約再生成完了 ===');
    console.log(`成功: ${successCount}件`);
    console.log(`失敗: ${failedCount}件`);
    
  } catch (error) {
    console.error('要約再生成失敗:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
regenerateSummaries().catch(console.error);