#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanDetailedSummary() {
  const articleId = 'cme161hh3000wte0t7lyr8lk9';
  
  console.log('🧹 詳細要約をクリーンアップ\n');
  
  try {
    // 現在の記事を取得
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        detailedSummary: true
      }
    });
    
    if (!article || !article.detailedSummary) {
      console.log('記事が見つからないか、詳細要約がありません');
      return;
    }
    
    console.log(`処理中: ${article.title}\n`);
    
    console.log('現在の詳細要約:');
    console.log(article.detailedSummary);
    console.log();
    
    // 詳細要約をクリーンアップ
    let cleanedDetailedSummary = article.detailedSummary;
    
    // Markdown記法を除去
    cleanedDetailedSummary = cleanedDetailedSummary.replace(/\*\*/g, '');
    
    // 各行を処理
    const lines = cleanedDetailedSummary.split('\n');
    const cleanedLines = lines.map(line => {
      if (line.trim().startsWith('・')) {
        // 「・要約:」で始まる行から「要約:」を除去
        let cleaned = line;
        cleaned = cleaned.replace(/^・\s*要約[:：]\s*/, '・');
        // 残ったMarkdown記法も除去
        cleaned = cleaned.replace(/\*\*/g, '');
        return cleaned;
      }
      return line;
    });
    
    cleanedDetailedSummary = cleanedLines.join('\n');
    
    console.log('クリーンアップ後の詳細要約:');
    console.log(cleanedDetailedSummary);
    console.log();
    
    // データベースを更新
    await prisma.article.update({
      where: { id: articleId },
      data: {
        detailedSummary: cleanedDetailedSummary,
        updatedAt: new Date()
      }
    });
    
    console.log('✅ データベースを更新しました');
    
    // キャッシュの確認
    console.log('\n📦 キャッシュについて:');
    console.log('- Next.jsのキャッシュ: ブラウザでハードリロード（Ctrl+Shift+R）が必要');
    console.log('- サーバーサイドキャッシュ: サーバー再起動が必要な場合があります');
    console.log('- Redisキャッシュ: 存在する場合は別途クリアが必要');
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanDetailedSummary().catch(console.error);