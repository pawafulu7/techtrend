#!/usr/bin/env -S tsx
/**
 * 複数の記事でプロンプトをテスト
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import { parseSummary } from '../../lib/utils/summary-parser';

const prisma = new PrismaClient();

// テスト対象記事
const TEST_ARTICLES = [
  'cmdq3y8fd0001te564aqst93r', // 9109文字 - MCP認証認可
  'cme6tpmpd0004tevewyr6zxp2', // 29404文字 - SQL vs NoSQL
  'cmdwn6jsn000bte53pxzd2g3m', // 28360文字 - Claude Code × serena
];

async function testArticles() {
  console.error('========================================');
  console.error('複数記事でのプロンプトテスト');
  console.error('========================================\n');

  const results = [];

  for (const articleId of TEST_ARTICLES) {
    try {
      const article = await prisma.article.findUnique({
        where: { id: articleId },
        select: {
          id: true,
          title: true,
          content: true,
          url: true,
          sourceId: true,
          source: {
            select: { name: true }
          }
        }
      });

      if (!article) {
        console.error(`❌ 記事が見つかりません: ${articleId}`);
        continue;
      }

      console.error(`\n【テスト ${TEST_ARTICLES.indexOf(articleId) + 1}/${TEST_ARTICLES.length}】`);
      console.error(`タイトル: ${article.title.substring(0, 50)}...`);
      console.error(`文字数: ${article.content?.length || 0}文字`);
      console.error('生成中...');

      const service = new UnifiedSummaryService();
      const result = await service.generate(
        article.title,
        article.content || '',
        undefined,
        { sourceName: article.source?.name ?? article.sourceId, url: article.url }
      );

      const sections = parseSummary(result.detailedSummary, { 
        summaryVersion: result.summaryVersion 
      });

      const articleResult = {
        id: article.id,
        title: article.title.substring(0, 50),
        contentLength: article.content?.length || 0,
        summaryLength: result.summary.length,
        detailedSummaryLength: result.detailedSummary.length,
        itemCount: sections.length,
        avgItemLength: Math.round(result.detailedSummary.length / sections.length),
        qualityScore: result.qualityScore
      };

      results.push(articleResult);

      console.error(`✅ 完了`);
      console.error(`  一覧要約: ${articleResult.summaryLength}文字`);
      console.error(`  詳細要約: ${articleResult.detailedSummaryLength}文字（${articleResult.itemCount}項目）`);
      console.error(`  項目平均: ${articleResult.avgItemLength}文字`);
      console.error(`  品質スコア: ${articleResult.qualityScore}`);

      // 項目の詳細
      console.error(`  項目内訳:`);
      sections.forEach((section, i) => {
        console.error(`    ${i+1}. ${section.title}: ${section.content.length}文字`);
      });

      // Rate limit対策
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
      console.error(`❌ エラー: ${error}`);
    }
  }

  // 結果サマリー
  console.error('\n========================================');
  console.error('結果サマリー');
  console.error('========================================\n');

  console.error('【記事ごとの結果】');
  results.forEach(r => {
    console.error(`${r.contentLength}文字 → 詳細${r.detailedSummaryLength}文字（${r.itemCount}項目、平均${r.avgItemLength}文字/項目）`);
  });

  // 目標との比較
  console.error('\n【目標との比較】');
  results.forEach(r => {
    let targetDetailedLength = 0;
    let targetItemCount = 0;
    let targetItemLength = 0;

    if (r.contentLength >= 5000) {
      targetDetailedLength = 1000; // 800-1200の中間
      targetItemCount = 5;
      targetItemLength = 200; // 150-250の中間
    } else if (r.contentLength >= 3000) {
      targetDetailedLength = 750; // 600-900の中間
      targetItemCount = 4;
      targetItemLength = 160; // 120-200の中間
    }

    console.error(`${r.contentLength}文字の記事:`);
    console.error(`  詳細要約: ${r.detailedSummaryLength}文字 / 目標${targetDetailedLength}文字 (${Math.round(r.detailedSummaryLength/targetDetailedLength*100)}%)`);
    console.error(`  項目数: ${r.itemCount}個 / 目標${targetItemCount}個以上`);
    console.error(`  項目平均: ${r.avgItemLength}文字 / 目標${targetItemLength}文字 (${Math.round(r.avgItemLength/targetItemLength*100)}%)`);
  });

  await prisma.$disconnect();
}

// 実行
testArticles();