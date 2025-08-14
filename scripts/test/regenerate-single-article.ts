#!/usr/bin/env npx tsx
/**
 * 特定の記事の要約を再生成
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();

async function regenerateArticle(articleId: string) {
  console.log('========================================');
  console.log('記事の要約再生成');
  console.log('========================================\n');

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
      console.log('❌ 記事が見つかりません');
      return;
    }

    console.log('【記事情報】');
    console.log(`ID: ${article.id}`);
    console.log(`タイトル: ${article.title}`);
    console.log(`文字数: ${article.content?.length || 0}文字`);
    console.log(`現在のsummaryVersion: ${article.summaryVersion}`);
    console.log();

    console.log('【現在の要約】');
    console.log(`一覧要約: ${article.summary?.length || 0}文字`);
    console.log(`詳細要約: ${article.detailedSummary?.length || 0}文字`);
    console.log();

    // 要約再生成
    console.log('【要約再生成中...】');
    const service = new UnifiedSummaryService();
    
    const result = await service.generate(
      article.title,
      article.content || '',
      undefined,
      { sourceName: article.sourceId, url: article.url }
    );

    console.log('✅ 生成完了');
    console.log(`summaryVersion: ${result.summaryVersion}`);
    console.log(`品質スコア: ${result.qualityScore}`);
    console.log();

    console.log('【新しい要約】');
    console.log(`一覧要約: ${result.summary.length}文字`);
    console.log(`詳細要約: ${result.detailedSummary.length}文字`);
    console.log();

    console.log('【新しい一覧要約】');
    console.log('----------------------------------------');
    console.log(result.summary);
    console.log('----------------------------------------\n');

    console.log('【新しい詳細要約】');
    console.log('----------------------------------------');
    console.log(result.detailedSummary);
    console.log('----------------------------------------\n');

    // データベース更新
    console.log('【データベース更新中...】');
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

    console.log('✅ データベース更新完了');
    console.log();

    console.log('【更新内容】');
    console.log(`summaryVersion: ${article.summaryVersion} → ${result.summaryVersion}`);
    console.log(`一覧要約: ${article.summary?.length || 0}文字 → ${result.summary.length}文字`);
    console.log(`詳細要約: ${article.detailedSummary?.length || 0}文字 → ${result.detailedSummary.length}文字`);

  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
const articleId = process.argv[2] || 'cmdq3y8fd0001te564aqst93r';
regenerateArticle(articleId);