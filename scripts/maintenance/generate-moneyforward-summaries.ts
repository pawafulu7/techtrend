#!/usr/bin/env tsx
import { createPrismaClient } from '@/lib/prisma/create-client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

async function generateMoneyForwardSummaries() {
  const prisma = createPrismaClient();
  const summaryService = new UnifiedSummaryService();
  
  console.error("=== マネーフォワード記事の要約生成 ===");
  
  try {
    // 要約が未生成のマネーフォワード記事を取得
    const articles = await prisma.article.findMany({
      where: {
        url: { contains: 'moneyforward-dev.jp' },
        summary: null
      }
    });
    
    console.error(`要約が必要な記事: ${articles.length}件`);
    
    for (const article of articles) {
      console.error(`\n処理中: ${article.title}`);
      
      try {
        // 要約生成
        const result = await summaryService.generate(
          article.title,
          article.content || ''
        );
        const { summary, detailedSummary } = result;
        
        // データベースを更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary,
            detailedSummary,
            summaryVersion: 7,
            articleType: 'unified'
          }
        });
        
        console.error(`✅ 要約生成成功`);
        console.error(`  一覧要約: ${summary.substring(0, 50)}...`);
        if (article.title.includes('SECCON')) {
          console.error(`  🎯 SECCON記事の要約が生成されました！`);
        }
        
        // Rate Limit対策
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        console.error(`❌ エラー:`, error);
      }
    }
    
    // 最終確認
    const completed = await prisma.article.count({
      where: {
        url: { contains: 'moneyforward-dev.jp' },
        summary: { not: null }
      }
    });
    
    console.error(`\n=== 完了 ===`);
    console.error(`要約済みのマネーフォワード記事: ${completed}件`);
    
  } catch (error) {
    console.error("エラー:", error);
  } finally {
    await prisma.$disconnect();
  }
}

generateMoneyForwardSummaries().catch(console.error);