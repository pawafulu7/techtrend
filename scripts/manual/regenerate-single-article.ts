#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { AIService } from '@/lib/ai/ai-service';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';

const prisma = new PrismaClient();

async function regenerateSingleArticle() {
  const articleId = 'cme0xi6qn000gtesy98f795je';
  
  console.log('🔄 記事の詳細要約を再生成します');
  console.log('記事ID:', articleId);
  console.log('='.repeat(60));
  
  try {
    // 記事を取得
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: {
        source: true,
        tags: true
      }
    });

    if (!article) {
      console.error('❌ 記事が見つかりません');
      return;
    }

    console.log('📄 対象記事:');
    console.log(`  タイトル: ${article.title}`);
    console.log(`  ソース: ${article.source.name}`);
    console.log();
    
    console.log('【現在の詳細要約】');
    console.log(article.detailedSummary?.substring(0, 200) + '...');
    console.log();
    
    // AIサービスを使用して詳細要約を再生成
    console.log('📝 詳細要約を再生成中...');
    const aiService = AIService.fromEnv();
    
    const startTime = Date.now();
    const result = await aiService.generateDetailedSummary(
      article.title,
      article.content || article.title
    );
    const duration = Date.now() - startTime;
    
    console.log('✅ 再生成完了\n');
    console.log('【新しい詳細要約】');
    console.log(result.detailedSummary);
    console.log();
    
    // データベースを更新
    console.log('💾 データベースを更新中...');
    await prisma.article.update({
      where: { id: articleId },
      data: {
        summary: result.summary,
        detailedSummary: result.detailedSummary
      }
    });
    
    console.log('✅ データベース更新完了');
    
    // キャッシュをクリア
    console.log('🔄 キャッシュをクリア中...');
    await cacheInvalidator.onArticleUpdated(articleId);
    
    console.log('✅ キャッシュクリア完了');
    
    // 更新後の確認
    const updatedArticle = await prisma.article.findUnique({
      where: { id: articleId }
    });
    
    const bulletPoints = updatedArticle?.detailedSummary?.split('\n').filter(line => line.trim().startsWith('・')) || [];
    console.log(`\n✅ 更新後の項目数: ${bulletPoints.length}個`);
    
    console.log('\n' + '='.repeat(60));
    console.log(`処理時間: ${duration}ms`);
    console.log('✅ 再生成と更新が完了しました');
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
regenerateSingleArticle().catch(console.error);