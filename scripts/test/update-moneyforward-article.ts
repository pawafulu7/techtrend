#!/usr/bin/env -S npx tsx

import { PrismaClient } from '@prisma/client';
import { MoneyForwardContentEnricher } from '../../lib/enrichers/moneyforward';

const prisma = new PrismaClient();

async function updateMoneyForwardArticle() {
  console.error('🔄 マネーフォワード記事の更新\n');

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

    console.error('📊 現在の状態:');
    console.error(`  コンテンツ長: ${currentArticle.content?.length || 0}文字`);
    console.error(`  要約長: ${currentArticle.summary?.length || 0}文字`);
    console.error(`  詳細要約長: ${currentArticle.detailedSummary?.length || 0}文字\n`);

    // 2. エンリッチメント実行
    console.error('🔍 エンリッチメント実行中...');
    const enricher = new MoneyForwardContentEnricher();
    const enrichedData = await enricher.enrich(url);

    if (!enrichedData || !enrichedData.content) {
      throw new Error('エンリッチメント失敗');
    }

    console.error(`✅ エンリッチメント成功: ${enrichedData.content.length}文字取得\n`);

    // 3. データベース更新
    console.error('💾 データベースを更新中...');
    const updated = await prisma.article.update({
      where: { id: articleId },
      data: {
        content: enrichedData.content,
        thumbnail: enrichedData.thumbnail || currentArticle.thumbnail
      }
    });

    console.error('✅ 更新完了:');
    console.error(`  新コンテンツ長: ${updated.content?.length || 0}文字`);
    console.error(`  サムネイル: ${updated.thumbnail ? '✅' : '❌'}\n`);

    // 4. 要約の再生成が必要
    console.error('📝 要約の再生成が必要です。');
    console.error('   以下のコマンドを実行してください:');
    console.error(`   npx tsx scripts/manual/regenerate-single-article.ts ${articleId}`);

  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateMoneyForwardArticle();