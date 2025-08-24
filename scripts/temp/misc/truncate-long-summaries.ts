#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function truncateLongSummaries() {
  console.error('📝 長すぎる要約（200文字超）を物理的に短縮します\n');
  console.error('=' .repeat(60));
  console.error('方針: 200文字で切り詰め、自然な位置で終了させる\n');
  
  try {
    // 200文字を超える要約を持つ記事を取得
    const longArticles = await prisma.article.findMany({
      where: {
        summary: {
          not: null
        }
      },
      select: {
        id: true,
        title: true,
        summary: true,
        source: { select: { name: true } }
      }
    });
    
    // 200文字超をフィルタリング
    const articlesToFix = longArticles.filter(a => {
      if (!a.summary) return false;
      return a.summary.length > 200;
    });
    
    console.error(`対象記事数: ${articlesToFix.length}件\n`);
    
    let successCount = 0;
    const results: any[] = [];
    
    for (let i = 0; i < articlesToFix.length; i++) {
      const article = articlesToFix[i];
      
      if (i % 50 === 0 && i > 0) {
        console.error(`\n📊 進捗: ${i}/${articlesToFix.length} (${Math.round(i/articlesToFix.length*100)}%)\n`);
      }
      
      const originalSummary = article.summary || '';
      let newSummary = originalSummary;
      
      // 200文字で切る
      if (originalSummary.length > 200) {
        // まず200文字で切る
        newSummary = originalSummary.substring(0, 200);
        
        // 自然な区切りを探す（句点、読点、スペースなど）
        const lastPeriod = newSummary.lastIndexOf('。');
        const lastComma = newSummary.lastIndexOf('、');
        const lastSpace = newSummary.lastIndexOf(' ');
        
        // 最も近い自然な区切り位置を探す（ただし150文字以上）
        let cutPosition = 200;
        
        if (lastPeriod > 150) {
          cutPosition = lastPeriod + 1; // 句点を含める
        } else if (lastComma > 170) {
          cutPosition = lastComma;
          newSummary = originalSummary.substring(0, cutPosition) + '。'; // 読点を句点に置き換え
        } else if (lastSpace > 180) {
          cutPosition = lastSpace;
          newSummary = originalSummary.substring(0, cutPosition) + '。';
        } else {
          // 適切な区切りがない場合は195文字で切って「...」を追加
          newSummary = originalSummary.substring(0, 195) + '...';
        }
        
        // 不自然な終わり方の修正
        newSummary = newSummary
          .replace(/、。$/, '。')
          .replace(/、\.\.\.$/, '...')
          .replace(/[、,]\s*$/, '。')
          .trim();
      }
      
      // 変更があった場合のみ更新
      if (newSummary !== originalSummary) {
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: newSummary,
            updatedAt: new Date()
          }
        });
        
        console.error(`[${i + 1}/${articlesToFix.length}] ${article.id}: ${originalSummary.length}文字 → ${newSummary.length}文字`);
        successCount++;
        
        results.push({
          id: article.id,
          title: article.title,
          oldLength: originalSummary.length,
          newLength: newSummary.length,
          oldSummary: originalSummary,
          newSummary: newSummary
        });
      }
    }
    
    // 結果サマリー
    console.error('\n' + '='.repeat(60));
    console.error('📊 処理結果サマリー\n');
    console.error(`✅ 修正: ${successCount}件`);
    console.error(`⏭️ スキップ: ${articlesToFix.length - successCount}件`);
    
    if (results.length > 0) {
      const avgOldLength = results.reduce((sum, r) => sum + r.oldLength, 0) / results.length;
      const avgNewLength = results.reduce((sum, r) => sum + r.newLength, 0) / results.length;
      console.error(`\n📏 平均文字数の変化:`);
      console.error(`  変更前: ${avgOldLength.toFixed(1)}文字`);
      console.error(`  変更後: ${avgNewLength.toFixed(1)}文字`);
      console.error(`  削減率: ${((1 - avgNewLength / avgOldLength) * 100).toFixed(1)}%`);
    }
    
    // 結果をファイルに保存
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const resultFile = `truncate-long-summaries-result-${timestamp}.json`;
    const fs = require('fs');
    fs.writeFileSync(resultFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalProcessed: articlesToFix.length,
      successCount,
      results
    }, null, 2));
    
    console.error(`\n📁 詳細な結果を ${resultFile} に保存しました`);
    
  } catch (error) {
    console.error('エラー:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// メイン実行
truncateLongSummaries().catch(console.error);