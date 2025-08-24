/**
 * Gemma記事の要約再生成
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();
const summaryService = new UnifiedSummaryService();

async function regenerateGemmaArticle() {
  const articleId = 'cmec08ps6003cte8aw1qstaxl';
  
  try {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { source: true }
    });
    
    if (!article) {
      console.error('記事が見つかりません');
      return;
    }
    
    console.error('=== 記事情報 ===');
    console.error(`タイトル: ${article.title}`);
    console.error(`コンテンツ長: ${article.content?.length}文字`);
    console.error(`現在の詳細要約長: ${article.detailedSummary?.length}文字`);
    console.error(`現在の項目数: ${article.detailedSummary?.split('\n・').length}個`);
    
    console.error('\n=== 要約を再生成 ===');
    
    const result = await summaryService.generate(
      article.title,
      article.content || ''
    );
    
    if (result) {
      await prisma.article.update({
        where: { id: articleId },
        data: {
          summary: result.summary,
          detailedSummary: result.detailedSummary,
          summaryVersion: result.summaryVersion,
          articleType: result.articleType
        }
      });
      
      console.error('\n✅ 再生成完了');
      console.error(`新しい詳細要約長: ${result.detailedSummary.length}文字`);
      console.error(`新しい項目数: ${result.detailedSummary.split('\n・').length}個`);
      console.error('\n=== 新しい詳細要約 ===');
      console.error(result.detailedSummary);
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

regenerateGemmaArticle().catch(console.error);