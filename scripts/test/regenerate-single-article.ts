#!/usr/bin/env npx tsx
/**
 * 特定の記事の要約を再生成
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();

async function regenerateArticle(articleId: string) {
  console.error('========================================');
  console.error('記事の要約再生成');
  console.error('========================================\n');

  try {
    // 記事の取得
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        content: true,
        url: true,
        sourceId: true,
        summaryVersion: true,
        detailedSummary: true,
        summary: true
      }
    });

    if (!article) {
      console.error('❌ 記事が見つかりません');
      return;
    }

    console.error('【記事情報】');
    console.error(`ID: ${article.id}`);
    console.error(`タイトル: ${article.title}`);
    console.error(`文字数: ${article.content?.length || 0}文字`);
    console.error(`現在のsummaryVersion: ${article.summaryVersion}`);
    console.error();

    console.error('【現在の要約】');
    console.error(`一覧要約: ${article.summary?.length || 0}文字`);
    console.error(`詳細要約: ${article.detailedSummary?.length || 0}文字`);
    console.error();

    // 要約再生成
    console.error('【要約再生成中...】');
    const service = new UnifiedSummaryService();
    
    const result = await service.generate(
      article.title,
      article.content || '',
      undefined,
      { sourceName: article.sourceId, url: article.url }
    );

    console.error('✅ 生成完了');
    console.error(`summaryVersion: ${result.summaryVersion}`);
    console.error(`品質スコア: ${result.qualityScore}`);
    console.error();

    console.error('【新しい要約】');
    console.error(`一覧要約: ${result.summary.length}文字`);
    console.error(`詳細要約: ${result.detailedSummary.length}文字`);
    console.error();

    console.error('【新しい一覧要約】');
    console.error('----------------------------------------');
    console.error(result.summary);
    console.error('----------------------------------------\n');

    console.error('【新しい詳細要約】');
    console.error('----------------------------------------');
    console.error(result.detailedSummary);
    console.error('----------------------------------------\n');

    // データベース更新
    console.error('【データベース更新中...】');
    await prisma.article.update({
      where: { id: article.id },
      data: {
        summary: result.summary,
        detailedSummary: result.detailedSummary,
        summaryVersion: result.summaryVersion,
        articleType: result.articleType,
        qualityScore: result.qualityScore
      }
    });

    console.error('✅ データベース更新完了');
    console.error();

    console.error('【更新内容】');
    console.error(`summaryVersion: ${article.summaryVersion} → ${result.summaryVersion}`);
    console.error(`一覧要約: ${article.summary?.length || 0}文字 → ${result.summary.length}文字`);
    console.error(`詳細要約: ${article.detailedSummary?.length || 0}文字 → ${result.detailedSummary.length}文字`);

  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
const articleId = process.argv[2] || 'cmdq3y8fd0001te564aqst93r';
regenerateArticle(articleId);