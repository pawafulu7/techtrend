#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function simpleCleanup() {
  console.log('🧹 プレフィックスとMarkdownの単純クリーンアップ\n');
  
  try {
    // すべての記事を取得
    const allArticles = await prisma.article.findMany({
      select: {
        id: true,
        summary: true,
        detailedSummary: true
      }
    });
    
    console.log(`全記事数: ${allArticles.length}件\n`);
    
    let cleanupCount = 0;
    let processedCount = 0;
    
    for (const article of allArticles) {
      processedCount++;
      
      if (processedCount % 100 === 0) {
        console.log(`処理中: ${processedCount}/${allArticles.length} (${Math.round(processedCount/allArticles.length*100)}%)`);
      }
      
      let needsUpdate = false;
      let cleanedSummary = article.summary || '';
      let cleanedDetailedSummary = article.detailedSummary || '';
      
      // 一覧要約のクリーンアップ
      if (cleanedSummary) {
        const originalSummary = cleanedSummary;
        
        // プレフィックスとMarkdownを除去
        cleanedSummary = cleanedSummary
          .replace(/^\s*要約[:：]\s*/gi, '')
          .replace(/^\s*\*\*要約\*\*[:：]?\s*/gi, '')
          .replace(/^\s*Summary[:：]\s*/gi, '')
          .replace(/^\s*##\s+要約\s*/gi, '')
          .replace(/^\s*##\s*/g, '')
          .replace(/\*\*/g, '')
          .replace(/```/g, '')
          .replace(/`/g, '')
          .trim();
        
        if (originalSummary !== cleanedSummary) {
          needsUpdate = true;
        }
      }
      
      // 詳細要約のクリーンアップ
      if (cleanedDetailedSummary) {
        const originalDetailed = cleanedDetailedSummary;
        
        // Markdownを除去
        cleanedDetailedSummary = cleanedDetailedSummary
          .replace(/\*\*/g, '')
          .replace(/##\s*/g, '')
          .replace(/```/g, '')
          .trim();
        
        // 各行のプレフィックスも確認
        const lines = cleanedDetailedSummary.split('\n');
        const cleanedLines = lines.map(line => {
          if (line.trim().startsWith('・')) {
            return line.replace(/^・\s*\*\*/, '・').replace(/\*\*/g, '');
          }
          return line;
        });
        cleanedDetailedSummary = cleanedLines.join('\n');
        
        if (originalDetailed !== cleanedDetailedSummary) {
          needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        try {
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: cleanedSummary,
              detailedSummary: cleanedDetailedSummary,
              updatedAt: new Date()
            }
          });
          cleanupCount++;
          
          if (cleanupCount % 10 === 0) {
            console.log(`  ✅ ${cleanupCount}件クリーンアップ完了`);
          }
        } catch (error) {
          console.error(`  ❌ エラー (${article.id}): ${error}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 クリーンアップ完了');
    console.log(`✅ 修正した記事: ${cleanupCount}件`);
    console.log(`📊 修正率: ${(cleanupCount / allArticles.length * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

simpleCleanup().catch(console.error);