#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';
import { ExtendedArticle } from '../types/common';
import { generateSummaryAndTags } from '../lib/ai/gemini-handler';

const prisma = new PrismaClient();

async function fixBrokenSummaries() {
  console.error('壊れた要約を修正します...\n');

  // 問題のある記事を取得
  const brokenArticles = await prisma.article.findMany({
    where: {
      OR: [
        { id: 'cme5t8yu20005tesyofemyb3c' },
        { id: 'cme5t9fyg0009tesytxt4xpd1' },
        { id: 'cme5t9fzd000btesy4s1qzgk0' },
        { id: 'cme5t9fx80007tesycb04cog4' },
        { id: 'cme5t9hia0001tesskh6ewcd7' }
      ]
    },
    include: {
      source: true
    }
  });

  console.error(`対象記事: ${brokenArticles.length}件\n`);

  for (const article of brokenArticles) {
    console.error(`処理中: ${article.title.substring(0, 50)}...`);
    console.error(`  現在の要約: ${article.summary?.substring(0, 100)}...`);
    
    try {
      // 要約を再生成
      const content = article.content || '';
      const result = await generateSummaryAndTags(article.title, content);
      
      // データベースを更新
      await prisma.article.update({
        where: { id: article.id },
        data: {
          summary: result.summary,
          detailedSummary: result.detailedSummary,
          summaryVersion: 5,
          articleType: 'unified'
        }
      });
      
      console.error(`  ✅ 新しい要約: ${result.summary.substring(0, 100)}...`);
      console.error(`  文字数: ${result.summary.length}文字\n`);
      
      // API負荷軽減
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`  ❌ エラー: ${error}\n`);
    }
  }
  
  console.error('完了しました！');
}

fixBrokenSummaries()
  .catch(console.error)
  .finally(() => prisma.$disconnect());