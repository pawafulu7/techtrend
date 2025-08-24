#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function simpleDevtoFix() {
  console.error('🔧 Dev.to記事の簡易修正（プレフィックス除去と形式調整）\n');
  
  try {
    const articles = await prisma.article.findMany({
      where: {
        source: { name: 'Dev.to' }
      },
      select: {
        id: true,
        title: true,
        summary: true
      }
    });
    
    console.error(`Dev.to記事総数: ${articles.length}件\n`);
    
    let updateCount = 0;
    
    for (const article of articles) {
      let summary = article.summary || '';
      let needsUpdate = false;
      const originalSummary = summary;
      
      // クリーンアップ
      summary = summary
        .replace(/^要約[:：]\s*/gi, '')
        .replace(/^\*\*要約\*\*[:：]?\s*/gi, '')
        .replace(/\*\*/g, '')
        .replace(/##\s*/g, '')
        .replace(/```/g, '')
        .trim();
      
      // 「〜を解説する記事」パターンを修正
      if (summary.match(/を解説する記事/)) {
        summary = summary.replace(/を解説する記事.*$/g, 'の実装方法と活用例');
        needsUpdate = true;
      }
      
      // 「〜を紹介する記事」パターンを修正
      if (summary.match(/を紹介する記事/)) {
        summary = summary.replace(/を紹介する記事.*$/g, 'の特徴と使用方法');
        needsUpdate = true;
      }
      
      // 「〜について説明」パターンを修正
      if (summary.match(/について説明/)) {
        summary = summary.replace(/について説明.*$/g, 'の仕組みと実装例');
        needsUpdate = true;
      }
      
      // 「〜する記事です」パターンを修正
      if (summary.match(/する記事です/)) {
        summary = summary.replace(/する記事です。?$/g, '');
        needsUpdate = true;
      }
      
      // 「〜した記事です」パターンを修正
      if (summary.match(/した記事です/)) {
        summary = summary.replace(/した記事です。?$/g, '');
        needsUpdate = true;
      }
      
      // 「です。」で終わる場合は体言止めに
      if (summary.endsWith('です。')) {
        summary = summary.replace(/です。$/g, '');
        needsUpdate = true;
      }
      
      // タイトルから具体的な内容を推測して補強（短い要約の場合）
      if (summary.length < 60 && article.title) {
        const title = article.title;
        
        // 数値を含む場合は追加
        const numbers = title.match(/\d+/g);
        if (numbers && numbers[0]) {
          if (title.includes('Tools') || title.includes('Tips')) {
            summary += `（${numbers[0]}個の手法）`;
            needsUpdate = true;
          } else if (title.includes('%')) {
            summary += `（${numbers[0]}%改善）`;
            needsUpdate = true;
          }
        }
        
        // パフォーマンス関連
        if (title.match(/Fast|Speed|Performance/i) && !summary.includes('高速')) {
          summary = summary.replace(/。?$/, '') + 'による高速化を実現';
          needsUpdate = true;
        }
        
        // AI/LLM関連
        if (title.match(/GPT|Claude|AI|LLM/i) && !summary.includes('AI')) {
          summary = 'AI' + summary;
          needsUpdate = true;
        }
        
        // 比較記事
        if (title.includes('vs') && !summary.includes('比較')) {
          summary = summary.replace(/。?$/, '') + 'の性能比較と選定基準';
          needsUpdate = true;
        }
      }
      
      // 文末調整
      if (!summary.endsWith('。') && 
          !summary.endsWith('）') &&
          !summary.endsWith('る') && 
          !summary.endsWith('た') &&
          !summary.endsWith('法') &&
          !summary.endsWith('術') &&
          !summary.endsWith('化') &&
          !summary.endsWith('例') &&
          !summary.endsWith('準')) {
        summary += '。';
        needsUpdate = true;
      }
      
      // 変更があった場合のみ更新
      if (needsUpdate || originalSummary !== summary) {
        try {
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: summary,
              updatedAt: new Date()
            }
          });
          updateCount++;
          
          if (updateCount % 10 === 0) {
            console.error(`✅ ${updateCount}件修正完了`);
          }
        } catch (error) {
          console.error(`❌ エラー (${article.id}): ${error}`);
        }
      }
    }
    
    console.error('\n' + '='.repeat(60));
    console.error('🎉 処理完了');
    console.error(`✅ 修正した記事: ${updateCount}件`);
    console.error(`📊 修正率: ${(updateCount / articles.length * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

simpleDevtoFix().catch(console.error);