#!/usr/bin/env tsx
/**
 * 低品質な要約を検出して一括再生成するスクリプト
 * 
 * 使用方法:
 * npm run regenerate:low-quality
 * 
 * オプション:
 * --limit <数値>  処理する記事数の上限を指定
 * --dry-run      実際の更新を行わずにシミュレーション実行
 * --score <数値>  品質スコアの閾値を指定（デフォルト: 70）
 */

import { PrismaClient, Article, Source } from '@prisma/client';
import {
  checkSummaryQuality,
  isQualityCheckEnabled,
  getMinQualityScore,
  generateQualityReport
} from '../../lib/utils/summary-quality-checker';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import { cacheInvalidator } from '../../lib/cache/cache-invalidator';

const prisma = new PrismaClient();

// コマンドライン引数の解析
const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1]) : undefined;
const isDryRun = args.includes('--dry-run');
const scoreIndex = args.indexOf('--score');
const qualityThreshold = scoreIndex !== -1 && args[scoreIndex + 1] ? parseInt(args[scoreIndex + 1]) : 70;

interface ArticleWithSource extends Article {
  source: Source;
}

interface LowQualityArticle {
  article: ArticleWithSource;
  score: number;
  issues: Array<{
    type: string;
    severity: string;
    message: string;
  }>;
}

interface RegenerationResult {
  id: string;
  title: string;
  beforeScore: number;
  afterScore: number;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  attempts: number;
}

interface Statistics {
  totalArticles: number;
  lowQualityCount: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  averageScoreBefore: number;
  averageScoreAfter: number;
  scoreImprovement: number;
  processingTime: number;
}

interface SummaryAndTags {
  summary: string;
  detailedSummary: string;
  tags: string[];
  articleType: string;
}

/**
 * 要約とタグを生成（UnifiedSummaryServiceを使用）
 */
async function generateSummaryAndTags(title: string, content: string, isRegeneration: boolean = false): Promise<SummaryAndTags> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const summaryService = new UnifiedSummaryService();

  try {
    const result = await summaryService.generate(title, content, {
      maxRetries: 3,
      minQualityScore: 70,
      retryDelay: 2000
    });

    return {
      summary: result.summary,
      detailedSummary: result.detailedSummary,
      tags: result.tags,
      articleType: result.articleType
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('SKIP_GENERATION')) {
      throw error;
    }
    throw new Error(`Failed to generate summary: ${error instanceof Error ? error.message : String(error)}`);
  }
}


/**
 * 低品質な要約を持つ記事を検出
 */
async function detectLowQualityArticles(): Promise<LowQualityArticle[]> {
  console.error('\n🔍 低品質な要約を検出中...');
  console.error(`   品質スコア閾値: ${qualityThreshold}点`);
  
  // 要約がある全記事を取得
  const articles = await prisma.article.findMany({
    where: {
      summary: { not: null }
    },
    include: {
      source: true
    },
    orderBy: {
      publishedAt: 'desc'
    },
    take: limit || undefined
  }) as ArticleWithSource[];
  
  console.error(`   検査対象記事数: ${articles.length}件`);
  
  const lowQualityArticles: LowQualityArticle[] = [];
  const scoreDistribution = {
    excellent: 0,  // 90-100
    good: 0,       // 80-89
    fair: 0,       // 70-79
    poor: 0        // < 70
  };
  
  for (const article of articles) {
    if (!article.summary) continue;
    
    const qualityCheck = checkSummaryQuality(
      article.summary,
      article.detailedSummary || ''
    );
    
    // スコア分布を記録
    if (qualityCheck.score >= 90) scoreDistribution.excellent++;
    else if (qualityCheck.score >= 80) scoreDistribution.good++;
    else if (qualityCheck.score >= 70) scoreDistribution.fair++;
    else scoreDistribution.poor++;
    
    // 閾値未満の記事を低品質として記録
    if (qualityCheck.score < qualityThreshold) {
      lowQualityArticles.push({
        article,
        score: qualityCheck.score,
        issues: qualityCheck.issues
      });
    }
  }
  
  // 検出結果サマリー
  console.error('\n📊 品質分布:');
  console.error(`   優秀 (90-100): ${scoreDistribution.excellent}件 (${Math.round(scoreDistribution.excellent / articles.length * 100)}%)`);
  console.error(`   良好 (80-89):  ${scoreDistribution.good}件 (${Math.round(scoreDistribution.good / articles.length * 100)}%)`);
  console.error(`   普通 (70-79):  ${scoreDistribution.fair}件 (${Math.round(scoreDistribution.fair / articles.length * 100)}%)`);
  console.error(`   要改善 (<70):  ${scoreDistribution.poor}件 (${Math.round(scoreDistribution.poor / articles.length * 100)}%)`);
  
  console.error(`\n✅ 低品質記事検出完了: ${lowQualityArticles.length}件`);
  
  return lowQualityArticles;
}

/**
 * 要約を再生成
 */
async function regenerateSummaries(lowQualityArticles: LowQualityArticle[]): Promise<RegenerationResult[]> {
  console.error('\n♻️  要約の再生成を開始...');
  
  if (isDryRun) {
    console.error('   ⚠️  DRY-RUNモード: 実際の更新は行いません');
  }
  
  const results: RegenerationResult[] = [];
  const startTime = Date.now();
  
  for (let i = 0; i < lowQualityArticles.length; i++) {
    const { article, score: beforeScore, issues } = lowQualityArticles[i];
    
    console.error(`\n[${i + 1}/${lowQualityArticles.length}] 処理中: ${article.title.substring(0, 50)}...`);
    console.error(`   現在のスコア: ${beforeScore}点`);
    console.error(`   問題点: ${issues.map(i => i.type).join(', ')}`);
    
    const result: RegenerationResult = {
      id: article.id,
      title: article.title,
      beforeScore,
      afterScore: beforeScore,
      status: 'skipped',
      attempts: 0
    };
    
    try {
      const content = article.content || '';
      
      if (content.length < 300) {
        console.error('   ⚠️  コンテンツが短すぎるためスキップ（最低300文字必要）');
        result.status = 'skipped';
        result.error = 'コンテンツ不足';
        results.push(result);
        continue;
      }
      
      // 再生成試行（最大3回）
      const MAX_ATTEMPTS = 3;
      let regenerated = false;
      
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        result.attempts = attempt;
        console.error(`   再生成試行 ${attempt}/${MAX_ATTEMPTS}...`);
        
        try {
          // 要約とタグを生成（UnifiedSummaryServiceが内部で品質チェック済み）
          const generated = await generateSummaryAndTags(
            article.title,
            content,
            attempt > 1  // 2回目以降は再生成フラグを立てる
          );

          // UnifiedSummaryServiceが返すqualityScoreを使用
          const contentAnalysis = {
            contentLength: content.length,
            totalLength: content.length,
            isThinContent: content.length < 1000,
            recommendedMinLength: content.length < 1000 ? 60 : 100,
            recommendedMaxLength: content.length < 1000 ? 100 : 200
          };

          const newQualityCheck = checkSummaryQuality(
            generated.summary,
            generated.detailedSummary,
            contentAnalysis
          );

          result.afterScore = newQualityCheck.score;

          if (newQualityCheck.score >= qualityThreshold) {
            // 品質基準を満たした場合
            if (!isDryRun) {
              // データベース更新
              await prisma.article.update({
                where: { id: article.id },
                data: {
                  summary: generated.summary,
                  detailedSummary: generated.detailedSummary,
                  articleType: 'unified',
                  summaryVersion: 8,
                  summaryComputedAt: new Date()
                }
              });
              
              // タグの更新
              if (generated.tags.length > 0) {
                for (const tagName of generated.tags) {
                  const tag = await prisma.tag.upsert({
                    where: { name: tagName },
                    update: {},
                    create: { name: tagName }
                  });
                  
                  await prisma.article.update({
                    where: { id: article.id },
                    data: {
                      tags: {
                        connect: { id: tag.id }
                      }
                    }
                  });
                }
              }
            }
            
            console.error(`   ✅ 再生成成功! スコア: ${beforeScore} → ${result.afterScore}点`);
            result.status = 'success';
            regenerated = true;
            break;
          } else {
            console.error(`   ⚠️  品質基準未達: ${newQualityCheck.score}点`);
            if (attempt < MAX_ATTEMPTS) {
              await sleep(2000);  // API負荷軽減
            }
          }
        } catch (error) {
          console.error(`   ❌ エラー: ${error instanceof Error ? error.message : String(error)}`);
          result.error = error instanceof Error ? error.message : String(error);
          if (attempt < MAX_ATTEMPTS) {
            await sleep(5000);  // エラー時は長めに待機
          }
        }
      }
      
      if (!regenerated) {
        result.status = 'failed';
        console.error(`   ❌ 再生成失敗（${MAX_ATTEMPTS}回試行）`);
      }
      
    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);
      console.error(`   ❌ 処理エラー: ${result.error}`);
    }
    
    results.push(result);
    
    // API制限対策
    if (i < lowQualityArticles.length - 1) {
      await sleep(5000);  // 5秒待機
    }
    
    // 進捗表示
    const processed = i + 1;
    const successCount = results.filter(r => r.status === 'success').length;
    const percentage = Math.round(processed / lowQualityArticles.length * 100);
    console.error(`\n📈 進捗: ${processed}/${lowQualityArticles.length} (${percentage}%) | 成功: ${successCount}件`);
  }
  
  const processingTime = Math.round((Date.now() - startTime) / 1000);
  console.error(`\n✅ 再生成処理完了（処理時間: ${processingTime}秒）`);
  
  return results;
}

/**
 * 統計レポートを生成
 */
function generateStatisticsReport(
  totalArticles: number,
  lowQualityArticles: LowQualityArticle[],
  results: RegenerationResult[]
): Statistics {
  const successResults = results.filter(r => r.status === 'success');
  const failedResults = results.filter(r => r.status === 'failed');
  const skippedResults = results.filter(r => r.status === 'skipped');
  
  const averageScoreBefore = lowQualityArticles.reduce((sum, a) => sum + a.score, 0) / lowQualityArticles.length || 0;
  const averageScoreAfter = successResults.reduce((sum, r) => sum + r.afterScore, 0) / successResults.length || 0;
  
  return {
    totalArticles,
    lowQualityCount: lowQualityArticles.length,
    processedCount: results.length,
    successCount: successResults.length,
    failedCount: failedResults.length,
    skippedCount: skippedResults.length,
    averageScoreBefore: Math.round(averageScoreBefore),
    averageScoreAfter: Math.round(averageScoreAfter),
    scoreImprovement: Math.round(averageScoreAfter - averageScoreBefore),
    processingTime: 0  // 後で設定
  };
}

/**
 * レポートを出力
 */
function printReport(stats: Statistics, results: RegenerationResult[]) {
  console.error('\n' + '='.repeat(80));
  console.error('📊 再生成結果レポート');
  console.error('='.repeat(80));
  
  console.error('\n【処理概要】');
  console.error(`  検査記事総数: ${stats.totalArticles}件`);
  console.error(`  低品質記事数: ${stats.lowQualityCount}件 (${Math.round(stats.lowQualityCount / stats.totalArticles * 100)}%)`);
  console.error(`  処理対象数:   ${stats.processedCount}件`);
  
  console.error('\n【処理結果】');
  console.error(`  成功: ${stats.successCount}件 (${Math.round(stats.successCount / stats.processedCount * 100)}%)`);
  console.error(`  失敗: ${stats.failedCount}件 (${Math.round(stats.failedCount / stats.processedCount * 100)}%)`);
  console.error(`  スキップ: ${stats.skippedCount}件 (${Math.round(stats.skippedCount / stats.processedCount * 100)}%)`);
  
  console.error('\n【品質改善】');
  console.error(`  平均スコア（処理前）: ${stats.averageScoreBefore}点`);
  console.error(`  平均スコア（処理後）: ${stats.averageScoreAfter}点`);
  console.error(`  改善度: +${stats.scoreImprovement}点`);
  
  // 成功した記事の詳細
  const successResults = results.filter(r => r.status === 'success');
  if (successResults.length > 0) {
    console.error('\n【改善された記事（上位10件）】');
    successResults
      .sort((a, b) => (b.afterScore - b.beforeScore) - (a.afterScore - a.beforeScore))
      .slice(0, 10)
      .forEach((r, i) => {
        const improvement = r.afterScore - r.beforeScore;
        console.error(`  ${i + 1}. ${r.title.substring(0, 40)}...`);
        console.error(`     スコア: ${r.beforeScore} → ${r.afterScore} (+${improvement}点)`);
      });
  }
  
  // 失敗した記事の詳細
  const failedResults = results.filter(r => r.status === 'failed');
  if (failedResults.length > 0) {
    console.error('\n【再生成に失敗した記事】');
    failedResults.slice(0, 5).forEach((r, i) => {
      console.error(`  ${i + 1}. ${r.title.substring(0, 40)}...`);
      console.error(`     エラー: ${r.error}`);
    });
  }
  
  console.error('\n' + '='.repeat(80));
}

/**
 * スリープ関数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * メイン処理
 */
async function main() {
  console.error('🚀 低品質要約の一括再生成スクリプト');
  console.error('='.repeat(80));
  
  const startTime = Date.now();
  
  try {
    // 環境変数チェック
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY環境変数が設定されていません');
      process.exit(1);
    }
    
    // 設定表示
    console.error('\n⚙️  設定:');
    console.error(`   品質スコア閾値: ${qualityThreshold}点`);
    console.error(`   処理上限: ${limit ? `${limit}件` : '無制限'}`);
    console.error(`   実行モード: ${isDryRun ? 'DRY-RUN（シミュレーション）' : '本番実行'}`);
    
    // 低品質記事の検出
    const lowQualityArticles = await detectLowQualityArticles();
    
    if (lowQualityArticles.length === 0) {
      console.error('\n✨ 低品質な要約は見つかりませんでした');
      await prisma.$disconnect();
      return;
    }
    
    // 確認プロンプト（本番実行時のみ）
    if (!isDryRun && lowQualityArticles.length > 10) {
      console.error(`\n⚠️  ${lowQualityArticles.length}件の記事を再生成します。続行しますか？`);
      console.error('   処理を続行する場合は10秒お待ちください...');
      await sleep(10000);
    }
    
    // 要約の再生成
    const results = await regenerateSummaries(lowQualityArticles);
    
    // 統計情報の生成
    const stats = generateStatisticsReport(
      lowQualityArticles.length,
      lowQualityArticles,
      results
    );
    stats.processingTime = Math.round((Date.now() - startTime) / 1000);
    
    // レポート出力
    printReport(stats, results);
    
    // キャッシュ無効化（本番実行時のみ）
    if (!isDryRun && stats.successCount > 0) {
      console.error('\n🔄 キャッシュを無効化中...');
      await cacheInvalidator.onBulkImport();
      console.error('✅ キャッシュ無効化完了');
    }
    
    console.error(`\n⏱️  総処理時間: ${stats.processingTime}秒`);
    console.error('\n✨ 処理が完了しました');
    
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// メイン処理を実行
main().catch(console.error);