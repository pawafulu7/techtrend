#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { AIService } from '../lib/ai/ai-service';

const prisma = new PrismaClient();

async function regenerateInvalidSummaries() {
  const articleIds = process.argv.slice(2);
  
  if (articleIds.length === 0) {
    console.log('使用方法: npx tsx scripts/regenerate-invalid-summaries.ts [記事ID...]');
    console.log('例: npx tsx scripts/regenerate-invalid-summaries.ts cme0xi58a0001tesym9pzd58e cme0xi59c0003tesy49bcp69r');
    process.exit(1);
  }
  
  console.log(`📝 ${articleIds.length}件の記事の詳細要約を再生成します\n`);
  
  try {
    const aiService = AIService.fromEnv();
    let successCount = 0;
    let errorCount = 0;
    
    for (const articleId of articleIds) {
      console.log(`\n処理中: ${articleId}`);
      console.log('-'.repeat(60));
      
      try {
        // 記事を取得
        const article = await prisma.article.findUnique({
          where: { id: articleId },
          select: {
            id: true,
            title: true,
            content: true,
            summary: true,
            detailedSummary: true,
            tags: true
          }
        });
        
        if (!article) {
          console.log(`❌ 記事が見つかりません: ${articleId}`);
          errorCount++;
          continue;
        }
        
        console.log(`タイトル: ${article.title}`);
        
        // 現在の詳細要約の項目数を確認
        const currentLines = article.detailedSummary?.split('\n').filter(l => l.trim().startsWith('・')) || [];
        console.log(`現在の項目数: ${currentLines.length}`);
        
        // contentが存在しない場合はスキップ
        if (!article.content) {
          console.log('⚠️ コンテンツがありません。スキップします。');
          continue;
        }
        
        // 詳細要約を再生成
        console.log('🔄 詳細要約を再生成中...');
        const result = await aiService.generateDetailedSummary(
          article.title,
          article.content
        );
        
        // タグを準備
        const tagConnections = await Promise.all(
          result.tags.map(async (tagName) => {
            const tag = await prisma.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { 
                name: tagName, 
                category: null 
              }
            });
            return { id: tag.id };
          })
        );
        
        // データベースを更新
        await prisma.article.update({
          where: { id: articleId },
          data: {
            summary: result.summary,
            detailedSummary: result.detailedSummary,
            tags: {
              set: tagConnections
            },
            updatedAt: new Date()
          }
        });
        
        // キャッシュをクリア（キャッシュサービスが利用可能な場合）
        // await cacheService.onArticleUpdated(articleId);
        
        // 新しい詳細要約の項目数を確認
        const newLines = result.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        console.log(`新しい項目数: ${newLines.length}`);
        
        // 品質チェック
        if (newLines.length === 6) {
          console.log('✅ 正常に6項目で再生成されました');
          successCount++;
        } else {
          console.log(`⚠️ 項目数が期待値と異なります: ${newLines.length}項目`);
          errorCount++;
        }
        
      } catch (error) {
        console.error(`❌ エラー (${articleId}):`, error);
        errorCount++;
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('再生成完了');
    console.log(`成功: ${successCount}件`);
    console.log(`エラー: ${errorCount}件`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

regenerateInvalidSummaries().catch(console.error);