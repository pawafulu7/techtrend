#!/usr/bin/env npx tsx
/**
 * はてなブックマークフェッチャーのエンリッチメント機能詳細テスト
 */

import { PrismaClient } from '@prisma/client';
import { HatenaExtendedFetcher } from '../lib/fetchers/hatena-extended';

const prisma = new PrismaClient();

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  details?: any;
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  try {
    // はてなブックマークのソースを取得
    const source = await prisma.source.findFirst({
      where: { name: 'はてなブックマーク' }
    });

    if (!source) {
      results.push({
        testName: 'ソース取得',
        passed: false,
        message: 'はてなブックマークのソースが見つかりません'
      });
      return results;
    }

    // テスト1: フェッチャーのインスタンス作成
    console.error('テスト1: フェッチャーのインスタンス作成...');
    try {
      const fetcher = new HatenaExtendedFetcher(source);
      results.push({
        testName: 'フェッチャーインスタンス作成',
        passed: true,
        message: 'フェッチャーが正常に作成されました'
      });
    } catch (error) {
      results.push({
        testName: 'フェッチャーインスタンス作成',
        passed: false,
        message: `エラー: ${error}`
      });
      return results;
    }

    // テスト2: 記事の取得とエンリッチメント
    console.error('テスト2: 記事の取得とエンリッチメント...');
    const fetcher = new HatenaExtendedFetcher(source);
    const startTime = Date.now();
    const result = await fetcher.fetch();
    const endTime = Date.now();
    const executionTime = endTime - startTime;

    results.push({
      testName: '記事取得',
      passed: result.articles.length > 0,
      message: `${result.articles.length}件の記事を取得 (実行時間: ${executionTime}ms)`,
      details: {
        articleCount: result.articles.length,
        errorCount: result.errors.length,
        executionTimeMs: executionTime
      }
    });

    // テスト3: エンリッチメントの効果測定
    console.error('テスト3: エンリッチメントの効果測定...');
    const enrichmentStats = {
      totalArticles: result.articles.length,
      enrichedArticles: 0,
      averageContentExpansion: 0,
      maxContentExpansion: 0,
      articlesWithThumbnail: 0
    };

    const contentExpansions: number[] = [];
    
    for (const article of result.articles) {
      const contentLength = article.content?.length || 0;
      
      // 一般的なRSS抜粋の長さ（300文字）より長い場合はエンリッチメント成功とみなす
      if (contentLength > 300) {
        enrichmentStats.enrichedArticles++;
        // 拡張率の推定（元の長さを200文字と仮定）
        const expansion = contentLength / 200;
        contentExpansions.push(expansion);
        enrichmentStats.maxContentExpansion = Math.max(enrichmentStats.maxContentExpansion, expansion);
      }
      
      if (article.thumbnail) {
        enrichmentStats.articlesWithThumbnail++;
      }
    }

    if (contentExpansions.length > 0) {
      enrichmentStats.averageContentExpansion = 
        contentExpansions.reduce((a, b) => a + b, 0) / contentExpansions.length;
    }

    results.push({
      testName: 'エンリッチメント効果',
      passed: enrichmentStats.enrichedArticles > 0,
      message: `${enrichmentStats.enrichedArticles}/${enrichmentStats.totalArticles}件でエンリッチメント成功`,
      details: enrichmentStats
    });

    // テスト4: コンテンツ品質チェック
    console.error('テスト4: コンテンツ品質チェック...');
    const qualityCheck = {
      articlesWithContent: 0,
      articlesWithLongContent: 0, // 1000文字以上
      articlesWithVeryLongContent: 0, // 3000文字以上
      shortestContent: Infinity,
      longestContent: 0
    };

    for (const article of result.articles) {
      const contentLength = article.content?.length || 0;
      if (contentLength > 0) {
        qualityCheck.articlesWithContent++;
        if (contentLength >= 1000) qualityCheck.articlesWithLongContent++;
        if (contentLength >= 3000) qualityCheck.articlesWithVeryLongContent++;
        qualityCheck.shortestContent = Math.min(qualityCheck.shortestContent, contentLength);
        qualityCheck.longestContent = Math.max(qualityCheck.longestContent, contentLength);
      }
    }

    results.push({
      testName: 'コンテンツ品質',
      passed: qualityCheck.articlesWithLongContent > 0,
      message: `${qualityCheck.articlesWithLongContent}件が1000文字以上のコンテンツを持つ`,
      details: qualityCheck
    });

    // テスト5: エラーハンドリング
    console.error('テスト5: エラーハンドリング...');
    const errorHandling = {
      totalErrors: result.errors.length,
      criticalErrors: 0,
      recoveredFromErrors: result.articles.length > 0 && result.errors.length > 0
    };

    results.push({
      testName: 'エラーハンドリング',
      passed: errorHandling.totalErrors === 0 || errorHandling.recoveredFromErrors,
      message: errorHandling.totalErrors === 0 
        ? 'エラーなし' 
        : `${errorHandling.totalErrors}件のエラーが発生したが処理継続`,
      details: errorHandling
    });

    // テスト6: 具体的な記事のサンプル確認
    console.error('テスト6: 具体的な記事のサンプル確認...');
    const sampleArticles = result.articles.slice(0, 3).map(article => ({
      title: article.title.substring(0, 50) + '...',
      contentLength: article.content?.length || 0,
      hasThumbnail: !!article.thumbnail,
      bookmarks: article.bookmarks
    }));

    results.push({
      testName: 'サンプル記事確認',
      passed: true,
      message: `上位${sampleArticles.length}件の記事を確認`,
      details: sampleArticles
    });

  } catch (error) {
    results.push({
      testName: '全体テスト',
      passed: false,
      message: `テスト実行中にエラーが発生: ${error}`
    });
  }

  return results;
}

async function main() {
  console.error('='.repeat(60));
  console.error('はてなブックマークエンリッチメント機能詳細テスト');
  console.error('='.repeat(60));
  console.error();

  const results = await runTests();
  
  console.error('\n' + '='.repeat(60));
  console.error('テスト結果サマリー');
  console.error('='.repeat(60));
  
  let passedCount = 0;
  let failedCount = 0;
  
  for (const result of results) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.error(`\n${status}: ${result.testName}`);
    console.error(`  ${result.message}`);
    
    if (result.details) {
      console.error('  詳細:');
      console.error('  ', JSON.stringify(result.details, null, 2).split('\n').join('\n    '));
    }
    
    if (result.passed) {
      passedCount++;
    } else {
      failedCount++;
    }
  }
  
  console.error('\n' + '='.repeat(60));
  console.error(`総合結果: ${passedCount}/${results.length} テスト成功`);
  
  if (failedCount === 0) {
    console.error('🎉 すべてのテストが成功しました！');
  } else {
    console.error(`⚠️  ${failedCount}件のテストが失敗しました`);
  }
  console.error('='.repeat(60));
  
  await prisma.$disconnect();
  
  // Exit code based on test results
  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch(console.error);