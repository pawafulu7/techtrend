#!/usr/bin/env -S tsx

/**
 * 特定の記事の要約を再生成するスクリプト
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import { countDetailedItems, preparePrismaUpdateData } from '../utils/version8-validation';

const prisma = new PrismaClient();

async function regenerateSpecificArticle(articleId: string) {
  console.log(`記事ID: ${articleId} の要約を再生成します...`);

  try {
    // UnifiedSummaryServiceをtry内で生成（コンストラクタ例外対策）
    const summaryService = new UnifiedSummaryService();

    // 記事を取得
    const article = await prisma.article.findUnique({
      where: { id: articleId }
    });

    if (!article) {
      console.error(`記事が見つかりません: ${articleId}`);
      process.exitCode = 1;
      return;
    }

    console.log(`タイトル: ${article.title}`);
    console.log(`本文文字数: ${article.content.length}`);

    // 現在の項目数を計算（共通関数を使用）
    const currentItemCount = countDetailedItems(article.detailedSummary);
    console.log(`現在の項目数: ${currentItemCount}`);

    // 要約を再生成
    console.log('🤖 要約を再生成しています...');
    const result = await summaryService.generate(
      article.title,
      article.content,
      {
        maxRetries: 3,
        retryDelay: 5000,
        minQualityScore: 70
      }
    );

    // データベースを更新（preparePrismaUpdateDataを使用）
    await prisma.article.update({
      where: { id: articleId },
      data: {
        ...preparePrismaUpdateData({
          summary: result.summary,
          detailedSummary: result.detailedSummary,
          summaryVersion: result.summaryVersion,
          articleType: result.articleType,
          qualityScore: result.qualityScore
        }),
        updatedAt: new Date()
      }
    });

    // 新しい項目数を計算（共通関数を使用）
    const newItemCount = countDetailedItems(result.detailedSummary);
    console.log(`✅ 再生成完了 (項目数: ${currentItemCount} → ${newItemCount})`);
    console.log(`品質スコア: ${result.qualityScore}`);

  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
const articleId = process.argv[2];
if (!articleId) {
  console.error('使用方法: npx tsx scripts/fix/regenerate-specific-article.ts <articleId>');
  process.exit(1);
}
regenerateSpecificArticle(articleId);