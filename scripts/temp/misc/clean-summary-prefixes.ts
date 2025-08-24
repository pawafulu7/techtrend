#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanSummaryPrefixes() {
  console.error('🧹 要約のプレフィックスとMarkdown記法をクリーンアップ\n');
  
  try {
    // 問題のあるパターンを持つ記事を検索
    const articles = await prisma.article.findMany({
      where: {
        OR: [
          { summary: { startsWith: '要約:' } },
          { summary: { startsWith: '要約：' } },
          { summary: { startsWith: ' 要約:' } },
          { summary: { startsWith: ' 要約：' } },
          { summary: { contains: '**要約**' } },
          { summary: { contains: '**要約:**' } },
          { summary: { contains: '## ' } },
          { summary: { contains: '**' } }
        ]
      },
      select: {
        id: true,
        title: true,
        summary: true
      }
    });
    
    console.error(`対象記事: ${articles.length}件\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      
      console.error(`[${i + 1}/${articles.length}] 処理中: ${article.id}`);
      console.error(`  タイトル: ${article.title?.substring(0, 50)}...`);
      
      if (!article.summary) {
        console.error('  ⚠️ 要約が空のためスキップ');
        errorCount++;
        continue;
      }
      
      // 元の要約を表示
      console.error(`  元の要約: ${article.summary.substring(0, 60)}...`);
      
      // 要約をクリーンアップ
      let cleanedSummary = article.summary;
      
      // プレフィックスを除去
      cleanedSummary = cleanedSummary
        .replace(/^\s*要約[:：]\s*/i, '')  // 「要約:」「要約：」を除去（前後のスペース含む）
        .replace(/^\s*\*\*要約\*\*[:：]?\s*/i, '')  // 「**要約**」を除去
        .replace(/^\s*##\s*要約[:：]?\s*/i, '');  // 「## 要約」を除去
      
      // Markdown記法を除去
      cleanedSummary = cleanedSummary
        .replace(/\*\*/g, '')  // Bold記法を除去
        .replace(/##\s*/g, '')  // 見出し記法を除去
        .replace(/^\s+|\s+$/g, '');  // 前後の空白を除去
      
      // 文末に句点がない場合は追加
      if (cleanedSummary && !cleanedSummary.endsWith('。')) {
        cleanedSummary = cleanedSummary + '。';
      }
      
      console.error(`  修正後: ${cleanedSummary.substring(0, 60)}...`);
      
      try {
        // データベースを更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: cleanedSummary,
            updatedAt: new Date()
          }
        });
        
        console.error('  ✅ 更新完了');
        successCount++;
      } catch (error) {
        console.error(`  ❌ エラー: ${error}`);
        errorCount++;
      }
      
      console.error();
    }
    
    console.error('='.repeat(60));
    console.error('処理完了');
    console.error(`成功: ${successCount}件`);
    console.error(`エラー: ${errorCount}件`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanSummaryPrefixes().catch(console.error);