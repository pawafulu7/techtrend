#!/usr/bin/env -S npx tsx
// 特定記事を最新のVersion 8形式で再生成するスクリプト

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import { 
  validateGenerationResult, 
  safeSubstring, 
  normalizeLineBreaks,
  preparePrismaUpdateData 
} from '../utils/version8-validation';

const prisma = new PrismaClient();

async function updateToVersion8(articleId: string): Promise<number> {
  try {
    // 記事を取得
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { source: true }
    });

    if (!article) {
      console.error(`記事が見つかりません: ${articleId}`);
      return 1;
    }

    console.log('記事情報:');
    console.log(`  タイトル: ${article.title}`);
    console.log(`  ソース: ${article.source?.name ?? '（不明）'}`);
    console.log(`  現在のsummaryVersion: ${article.summaryVersion}`);
    console.log(`  articleType: ${article.articleType}`);
    console.log('');

    if (article.summaryVersion === 8) {
      console.log('すでにVersion 8形式です。');
      return 0;
    }

    console.log('現在の詳細要約（旧形式）:');
    // 共通関数を使用したUnicode安全な文字列処理
    if (article.detailedSummary) {
      const currentPreview = safeSubstring(article.detailedSummary, 200);
      console.log(currentPreview);
    } else {
      console.log('（なし）');
    }
    console.log('');

    // コンテンツ確認
    if (!article.content) {
      console.error('コンテンツがありません。要約を生成できません。');
      return 1;
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
      { sourceName: article.source?.name ?? '不明', url: article.url }
    );

    // 生成結果の総合的な検証
    const validation = validateGenerationResult(result);
    if (!validation.isValid) {
      console.error('要約生成結果に問題があります:');
      validation.errors.forEach(error => console.error(`  - ${error}`));
      return 1;
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
    // 詳細要約の最初の3項目を表示（共通関数使用）
    const normalizedDetail = normalizeLineBreaks(result.detailedSummary || '');
    const lines = normalizedDetail.split('\n').slice(0, 3);
    lines.forEach(line => {
      const displayText = safeSubstring(line, 100);
      console.log(displayText);
    });
    // 4項目以上ある場合のみ省略記号を表示
    if (normalizedDetail.split('\n').length > 3) {
      console.log('...');
    }
    console.log('');

    // データベース更新（安全な更新データを準備）
    const updateData = preparePrismaUpdateData({
      summary: result.summary,
      detailedSummary: result.detailedSummary,
      summaryVersion: result.summaryVersion,
      articleType: result.articleType,
      qualityScore: result.qualityScore
    });
    
    const updated = await prisma.article.update({
      where: { id: articleId },
      data: updateData
    });

    console.log('データベースを更新しました。');
    console.log(`  新しいsummaryVersion: ${updated.summaryVersion}`);
    console.log(`  新しいarticleType: ${updated.articleType}`);
    console.log(`  新しい品質スコア: ${updated.qualityScore}`);
    
    return 0; // 成功

  } catch (error) {
    console.error('エラーが発生しました:', error);
    return 1;
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

// 実行とexit codeの設定
updateToVersion8(articleId).then(exitCode => {
  process.exit(exitCode);
});