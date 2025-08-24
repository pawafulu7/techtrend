#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { AIService } from '../lib/ai/ai-service';

const prisma = new PrismaClient();

async function regenerateRecentInvalid() {
  console.error('🔍 最近の問題のある記事を再生成中...\n');
  
  try {
    const aiService = AIService.fromEnv();
    
    // 最近の問題のある記事を取得
    const recentArticles = await prisma.article.findMany({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24時間以内
        }
      },
      select: {
        id: true,
        title: true,
        content: true,
        summary: true,
        detailedSummary: true,
        publishedAt: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });
    
    let processedCount = 0;
    let successCount = 0;
    
    for (const article of recentArticles) {
      const lines = article.detailedSummary?.split('\n').filter(l => l.trim()) || [];
      const bulletPoints = lines.filter(l => l.trim().startsWith('・'));
      const summaryInDetailed = article.detailedSummary?.includes(article.summary || '') || false;
      
      // 問題がある記事のみ処理
      if (bulletPoints.length < 6 || summaryInDetailed) {
        processedCount++;
        console.error(`\n処理中 #${processedCount}: ${article.id}`);
        console.error(`タイトル: ${article.title?.substring(0, 60)}...`);
        console.error(`現在の項目数: ${bulletPoints.length}`);
        
        if (!article.content) {
          console.error('⚠️ コンテンツがないためスキップ');
          continue;
        }
        
        try {
          // 詳細要約を再生成
          console.error('🔄 詳細要約を再生成中...');
          const result = await aiService.generateDetailedSummary(
            article.title || '',
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
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              tags: {
                set: tagConnections
              },
              updatedAt: new Date()
            }
          });
          
          // 新しい詳細要約の項目数を確認
          const newLines = result.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
          console.error(`✅ 再生成完了 - 新しい項目数: ${newLines.length}`);
          
          if (newLines.length === 6) {
            successCount++;
          }
          
        } catch (error) {
          console.error(`❌ エラー: ${error}`);
        }
        
        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.error('\n' + '='.repeat(60));
    console.error('再生成完了');
    console.error(`処理した記事: ${processedCount}件`);
    console.error(`成功（6項目）: ${successCount}件`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

regenerateRecentInvalid().catch(console.error);