#!/usr/bin/env npx tsx

/**
 * 特定の記事の要約を再生成するスクリプト
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();
const summaryService = new UnifiedSummaryService();

async function regenerateSpecificArticle(articleId: string) {
  console.log(`記事ID: ${articleId} の要約を再生成します...`);

  try {
    // 記事を取得
    const article = await prisma.article.findUnique({
      where: { id: articleId }
    });

    if (!article) {
      console.error(`記事が見つかりません: ${articleId}`);
      return;
    }

    console.log(`タイトル: ${article.title}`);
    console.log(`本文文字数: ${article.content.length}`);

    // 現在の項目数を計算
    const currentItemCount = article.detailedSummary
      ? (article.detailedSummary.match(/・/g) || []).length
      : 0;
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

    // データベースを更新
    await prisma.article.update({
      where: { id: articleId },
      data: {
        summary: result.summary,
        detailedSummary: result.detailedSummary,
        summaryVersion: result.summaryVersion,
        articleType: result.articleType,
        qualityScore: result.qualityScore,
        updatedAt: new Date()
      }
    });

    // 新しい項目数を計算
    const newItemCount = (result.detailedSummary.match(/・/g) || []).length;
    console.log(`✅ 再生成完了 (項目数: ${currentItemCount} → ${newItemCount})`);
    console.log(`品質スコア: ${result.qualityScore}`);

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
const articleId = process.argv[2] || 'cmfonlsw8004ote8u9m0n8npi';
regenerateSpecificArticle(articleId);