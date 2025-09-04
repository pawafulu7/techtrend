#!/usr/bin/env -S npx tsx

import { PrismaClient } from '@prisma/client';
import { MoneyForwardContentEnricher } from '../../lib/enrichers/moneyforward';

const prisma = new PrismaClient();

async function updateMoneyForwardArticle(): Promise<boolean> {
  console.log('🔄 マネーフォワード記事の更新\n');

  const articleId = 'cmebj56760006texkokzz8exg';
  const url = 'https://moneyforward-dev.jp/entry/2025/07/31/130000';

  try {
    // 1. 現在の状態を確認
    const currentArticle = await prisma.article.findUnique({
      where: { id: articleId }
    });

    if (!currentArticle) {
      throw new Error('記事が見つかりません');
    }

    console.log('📊 現在の状態:');
    console.log(`  コンテンツ長: ${currentArticle.content?.length || 0}文字`);
    console.log(`  要約長: ${currentArticle.summary?.length || 0}文字`);
    console.log(`  詳細要約長: ${currentArticle.detailedSummary?.length || 0}文字\n`);

    // 2. エンリッチメント実行
    console.log('🔍 エンリッチメント実行中...');
    const enricher = new MoneyForwardContentEnricher();
    const enrichedData = await enricher.enrich(url);

    if (!enrichedData || !enrichedData.content) {
      throw new Error('エンリッチメント失敗');
    }

    console.log(`✅ エンリッチメント成功: ${enrichedData.content.length}文字取得\n`);

    // 3. データベース更新
    console.log('💾 データベースを更新中...');
    const updated = await prisma.article.update({
      where: { id: articleId },
      data: {
        content: enrichedData.content,
        thumbnail: enrichedData.thumbnail || currentArticle.thumbnail
      }
    });

    console.log('✅ 更新完了:');
    console.log(`  新コンテンツ長: ${updated.content?.length || 0}文字`);
    console.log(`  サムネイル: ${updated.thumbnail ? '✅' : '❌'}\n`);

    // 4. 要約の再生成が必要
    console.log('📝 要約の再生成が必要です。');
    console.log('   以下のコマンドを実行してください:');
    console.log(`   npx tsx scripts/manual/regenerate-single-article.ts ${articleId}`);
    
    return true;

  } catch (error) {
    console.error('❌ エラー:', error);
    process.exitCode = 1;
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

updateMoneyForwardArticle()
  .then((success) => {
    if (!success) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });