#!/usr/bin/env npx tsx
/**
 * 様々な文字数の記事で詳細要約の比率をテスト
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import { parseSummary } from '../../lib/utils/summary-parser';

const prisma = new PrismaClient();

interface TestResult {
  contentRange: string;
  contentLength: number;
  title: string;
  summaryLength: number;
  detailedSummaryLength: number;
  itemCount: number;
  ratio: number; // 詳細要約/コンテンツの比率
}

async function testContentRatios() {
  console.error('========================================');
  console.error('コンテンツ量と詳細要約の比率テスト');
  console.error('========================================\n');

  const results: TestResult[] = [];

  // 各文字数範囲でサンプル記事を取得
  const ranges = [
    { label: '300文字以下', min: 0, max: 300 },
    { label: '301-800文字', min: 301, max: 800 },
    { label: '801-1500文字', min: 801, max: 1500 },
    { label: '1501-3000文字', min: 1501, max: 3000 },
    { label: '3001-5000文字', min: 3001, max: 5000 },
    { label: '5001-10000文字', min: 5001, max: 10000 },
    { label: '10000文字超', min: 10001, max: 999999 }
  ];

  for (const range of ranges) {
    try {
      // Prismaでは文字数での絞り込みが難しいので、SQLで直接取得
      const rawArticle = await prisma.$queryRaw<any[]>`
        SELECT id, title, content, url, sourceId 
        FROM Article 
        WHERE LENGTH(content) > ${range.min} 
          AND LENGTH(content) <= ${range.max}
        ORDER BY RANDOM()
        LIMIT 1
      `;

      if (!rawArticle || rawArticle.length === 0) {
        console.error(`⚠️ ${range.label}の記事が見つかりません`);
        continue;
      }

      const article = rawArticle[0];
      const contentLength = article.content?.length || 0;

      console.error(`\n【${range.label}】`);
      console.error(`タイトル: ${article.title.substring(0, 50)}...`);
      console.error(`コンテンツ: ${contentLength}文字`);
      console.error('生成中...');

      // 要約生成
      const service = new UnifiedSummaryService();
      const result = await service.generate(
        article.title,
        article.content || '',
        undefined,
        { sourceName: article.sourceId, url: article.url }
      );

      const sections = parseSummary(result.detailedSummary, { 
        summaryVersion: result.summaryVersion 
      });

      const ratio = (result.detailedSummary.length / contentLength) * 100;

      const testResult: TestResult = {
        contentRange: range.label,
        contentLength,
        title: article.title.substring(0, 50),
        summaryLength: result.summary.length,
        detailedSummaryLength: result.detailedSummary.length,
        itemCount: sections.length,
        ratio
      };

      results.push(testResult);

      console.error(`✅ 生成完了`);
      console.error(`  一覧要約: ${result.summary.length}文字`);
      console.error(`  詳細要約: ${result.detailedSummary.length}文字（${sections.length}項目）`);
      console.error(`  比率: ${ratio.toFixed(1)}%`);

      // Rate limit対策
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
      console.error(`❌ エラー: ${range.label}`, error);
    }
  }

  // 結果サマリー
  console.error('\n========================================');
  console.error('結果サマリー');
  console.error('========================================\n');

  console.error('【コンテンツ量と詳細要約の関係】');
  console.error('範囲\t\tコンテンツ\t詳細要約\t比率\t項目数');
  console.error('-----------------------------------------------------------');
  
  results.forEach(r => {
    const rangeLabel = r.contentRange.padEnd(15);
    const content = `${r.contentLength}文字`.padEnd(10);
    const detailed = `${r.detailedSummaryLength}文字`.padEnd(10);
    const ratio = `${r.ratio.toFixed(1)}%`.padEnd(8);
    const items = `${r.itemCount}個`;
    
    console.error(`${rangeLabel}\t${content}\t${detailed}\t${ratio}\t${items}`);
  });

  console.error('\n【プロンプトの目標値との比較】');
  results.forEach(r => {
    let targetMin = 0, targetMax = 0;
    
    if (r.contentLength >= 5000) {
      targetMin = 800;
      targetMax = 1500;
    } else if (r.contentLength >= 3000) {
      targetMin = 600;
      targetMax = 1000;
    } else if (r.contentLength >= 1000) {
      targetMin = 400;
      targetMax = 700;
    } else {
      targetMin = 300;
      targetMax = 500;
    }

    const inRange = r.detailedSummaryLength >= targetMin && r.detailedSummaryLength <= targetMax;
    const status = inRange ? '✅' : '⚠️';
    
    console.error(`${r.contentRange}: ${r.detailedSummaryLength}文字 (目標: ${targetMin}-${targetMax}文字) ${status}`);
  });

  console.error('\n【比率の分析】');
  const avgRatio = results.reduce((sum, r) => sum + r.ratio, 0) / results.length;
  console.error(`平均比率: ${avgRatio.toFixed(1)}%`);
  
  console.error('\n短い記事（1500文字以下）:');
  const shortArticles = results.filter(r => r.contentLength <= 1500);
  if (shortArticles.length > 0) {
    const shortAvg = shortArticles.reduce((sum, r) => sum + r.ratio, 0) / shortArticles.length;
    console.error(`  平均比率: ${shortAvg.toFixed(1)}%`);
  }

  console.error('\n中程度の記事（1501-5000文字）:');
  const mediumArticles = results.filter(r => r.contentLength > 1500 && r.contentLength <= 5000);
  if (mediumArticles.length > 0) {
    const medAvg = mediumArticles.reduce((sum, r) => sum + r.ratio, 0) / mediumArticles.length;
    console.error(`  平均比率: ${medAvg.toFixed(1)}%`);
  }

  console.error('\n長い記事（5000文字超）:');
  const longArticles = results.filter(r => r.contentLength > 5000);
  if (longArticles.length > 0) {
    const longAvg = longArticles.reduce((sum, r) => sum + r.ratio, 0) / longArticles.length;
    console.error(`  平均比率: ${longAvg.toFixed(1)}%`);
  }

  await prisma.$disconnect();
}

// 実行
testContentRatios();