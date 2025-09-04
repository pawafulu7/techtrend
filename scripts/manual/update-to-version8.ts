#!/usr/bin/env -S npx tsx
// 特定記事を最新のVersion 8形式で再生成するスクリプト

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();

async function updateToVersion8(articleId: string) {
  try {
    // 記事を取得
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { source: true }
    });

    if (!article) {
      console.error(`記事が見つかりません: ${articleId}`);
      process.exit(1);
    }

    console.log('記事情報:');
    console.log(`  タイトル: ${article.title}`);
    console.log(`  ソース: ${article.source.name}`);
    console.log(`  現在のsummaryVersion: ${article.summaryVersion}`);
    console.log(`  articleType: ${article.articleType}`);
    console.log('');

    if (article.summaryVersion === 8) {
      console.log('すでにVersion 8形式です。');
      return;
    }

    console.log('現在の詳細要約（旧形式）:');
    // 200文字を超える場合のみ省略記号を追加
    const currentPreview = article.detailedSummary && article.detailedSummary.length > 200
      ? article.detailedSummary.substring(0, 200) + '...'
      : article.detailedSummary || '';
    console.log(currentPreview);
    console.log('');

    // コンテンツ確認
    if (!article.content) {
      console.error('コンテンツがありません。要約を生成できません。');
      process.exit(1);
    }

    console.log(`コンテンツ長: ${article.content.length}文字`);
    console.log('');

    // UnifiedSummaryServiceを使用して再生成
    const summaryService = new UnifiedSummaryService();
    console.log('Version 8形式で要約を再生成中...');
    
    const result = await summaryService.generate(
      article.title,
      article.content,
      undefined,
      { sourceName: article.source.name, url: article.url }
    );

    // resultは直接UnifiedSummaryResultを返すため、successプロパティはない
    if (!result.summary) {
      console.error('要約生成に失敗しました');
      process.exit(1);
    }

    console.log('\n生成完了:');
    console.log(`  summaryVersion: ${result.summaryVersion}`);
    console.log(`  articleType: ${result.articleType}`);
    console.log(`  品質スコア: ${result.qualityScore}`);
    console.log('');

    console.log('新しい一覧要約:');
    console.log(result.summary);
    console.log('');

    console.log('新しい詳細要約（Version 8形式）:');
    // 詳細要約の最初の3項目を表示
    const lines = result.detailedSummary?.split('\n').slice(0, 3);
    lines?.forEach(line => {
      // 長い行は100文字で切って省略記号を追加
      const displayText = line.length > 100
        ? line.substring(0, 100) + '...'
        : line;
      console.log(displayText);
    });
    // 4項目以上ある場合のみ省略記号を表示
    if (result.detailedSummary && result.detailedSummary.split('\n').length > 3) {
      console.log('...');
    }
    console.log('');

    // データベース更新
    const updated = await prisma.article.update({
      where: { id: articleId },
      data: {
        summary: result.summary,
        detailedSummary: result.detailedSummary,
        summaryVersion: result.summaryVersion,
        articleType: result.articleType,
        qualityScore: result.qualityScore
      }
    });

    console.log('データベースを更新しました。');
    console.log(`  新しいsummaryVersion: ${updated.summaryVersion}`);
    console.log(`  新しいarticleType: ${updated.articleType}`);
    console.log(`  新しい品質スコア: ${updated.qualityScore}`);

  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// コマンドライン引数から記事IDを取得
const articleId = process.argv[2];

if (!articleId) {
  console.error('使用方法: npx tsx scripts/manual/update-to-version8.ts <記事ID>');
  console.error('例: npx tsx scripts/manual/update-to-version8.ts cmf54faqd000rtexct6yftujk');
  process.exit(1);
}

updateToVersion8(articleId);