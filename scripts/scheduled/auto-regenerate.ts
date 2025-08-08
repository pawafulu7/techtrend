#!/usr/bin/env node

/**
 * 低品質な要約を自動検出して再生成
 * PM2スケジューラーで定期実行（推奨: 1日1回）
 */

import { PrismaClient } from '@prisma/client';
import { GeminiClient } from '@/lib/ai/gemini';
import { calculateSummaryScore, needsRegeneration } from '@/lib/utils/quality-scorer';
import { optimizeContentForSummary } from '@/lib/utils/content-extractor';

const prisma = new PrismaClient();

// 環境変数チェック
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY環境変数が設定されていません');
  process.exit(1);
}

const geminiClient = new GeminiClient(process.env.GEMINI_API_KEY);

async function main() {
  console.log('🔄 自動再生成プロセスを開始します...');
  console.log(`実行時刻: ${new Date().toISOString()}\n`);

  try {
    // Step 1: 低品質な要約を検出
    const lowQualityArticles = await detectLowQualityArticles();
    
    if (lowQualityArticles.length === 0) {
      console.log('✅ 再生成が必要な記事はありませんでした。');
      return;
    }

    console.log(`\n📝 ${lowQualityArticles.length}件の記事を再生成します...\n`);

    // Step 2: 記事を再生成
    const results = await regenerateArticles(lowQualityArticles);

    // Step 3: 結果レポート
    await generateReport(results);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 低品質な要約を検出
 */
async function detectLowQualityArticles(): Promise<Array<{
  id: string;
  title: string;
  content: string | null;
  summary: string;
  score: number;
  issues: string[];
}>> {
  console.log('🔍 低品質な要約を検出中...');

  // 過去7日間の記事を対象
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const articles = await prisma.article.findMany({
    where: {
      publishedAt: { gte: sevenDaysAgo },
      summary: { not: null },
      // 既に再生成されていない記事（summaryVersion < 2）
      OR: [
        { summaryVersion: null },
        { summaryVersion: { lt: 2 } },
      ],
    },
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
    },
    take: 50, // 一度に処理する最大数
    orderBy: { publishedAt: 'desc' },
  });

  const lowQualityArticles = [];

  for (const article of articles) {
    if (!article.summary) continue;

    const tags = article.tags.map(t => t.tag.name);
    const score = calculateSummaryScore(article.summary, { tags });

    // 再生成が必要な記事を選別
    if (needsRegeneration(score) || score.totalScore < 60) {
      lowQualityArticles.push({
        id: article.id,
        title: article.title,
        content: article.content,
        summary: article.summary,
        score: score.totalScore,
        issues: score.issues,
      });
    }
  }

  console.log(`  検査記事数: ${articles.length}件`);
  console.log(`  低品質記事: ${lowQualityArticles.length}件`);

  return lowQualityArticles;
}

/**
 * 記事を再生成
 */
async function regenerateArticles(articles: Array<{
  id: string;
  title: string;
  content: string | null;
  summary: string;
  score: number;
  issues: string[];
}>): Promise<Array<{
  id: string;
  title: string;
  oldScore: number;
  newScore: number;
  success: boolean;
  error?: string;
}>> {
  const results = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.log(`[${i + 1}/${articles.length}] ${article.title.substring(0, 50)}...`);
    console.log(`  旧スコア: ${article.score}点`);
    console.log(`  問題: ${article.issues.slice(0, 3).join(', ')}`);

    try {
      // コンテンツを最適化
      const optimizedContent = article.content 
        ? optimizeContentForSummary(article.content).content
        : '';

      if (!optimizedContent) {
        console.warn('  ⚠️ コンテンツが空のためスキップ');
        results.push({
          id: article.id,
          title: article.title,
          oldScore: article.score,
          newScore: article.score,
          success: false,
          error: 'コンテンツが空',
        });
        continue;
      }

      // 要約を再生成（最大2回リトライ）
      const { summary, tags } = await geminiClient.generateSummaryWithTags(
        article.title,
        optimizedContent,
        2 // maxRetries
      );

      // 新しい要約のスコアを計算
      const newScore = calculateSummaryScore(summary, { tags });
      console.log(`  新スコア: ${newScore.totalScore}点`);

      // 改善された場合のみ更新
      if (newScore.totalScore > article.score) {
        // 既存のタグを取得
        const existingTags = await prisma.articleTag.findMany({
          where: { articleId: article.id },
          include: { tag: true },
        });
        const existingTagNames = existingTags.map(t => t.tag.name);

        // 新しいタグと既存のタグをマージ（重複を除く）
        const mergedTags = [...new Set([...existingTagNames, ...tags])];

        // データベースを更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary,
            summaryVersion: 2, // 自動再生成バージョン
            updatedAt: new Date(),
          },
        });

        // タグを更新
        for (const tagName of tags) {
          if (!existingTagNames.includes(tagName)) {
            // タグが存在しない場合は作成
            const tag = await prisma.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { name: tagName },
            });

            // 記事とタグの関連を作成
            await prisma.articleTag.create({
              data: {
                articleId: article.id,
                tagId: tag.id,
              },
            });
          }
        }

        console.log(`  ✅ 更新成功（+${newScore.totalScore - article.score}点改善）`);
        results.push({
          id: article.id,
          title: article.title,
          oldScore: article.score,
          newScore: newScore.totalScore,
          success: true,
        });
      } else {
        console.log(`  ⚠️ スコアが改善されなかったためスキップ`);
        results.push({
          id: article.id,
          title: article.title,
          oldScore: article.score,
          newScore: newScore.totalScore,
          success: false,
          error: 'スコア改善なし',
        });
      }

      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`  ❌ エラー: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        id: article.id,
        title: article.title,
        oldScore: article.score,
        newScore: article.score,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      // エラー時も次の記事を処理するため続行
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  return results;
}

/**
 * 実行結果のレポート生成
 */
async function generateReport(results: Array<{
  id: string;
  title: string;
  oldScore: number;
  newScore: number;
  success: boolean;
  error?: string;
}>) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 自動再生成レポート');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`
処理結果:
  総処理数: ${results.length}件
  成功: ${successful.length}件
  失敗: ${failed.length}件
`);

  if (successful.length > 0) {
    const totalImprovement = successful.reduce(
      (sum, r) => sum + (r.newScore - r.oldScore),
      0
    );
    const avgImprovement = Math.round(totalImprovement / successful.length);

    console.log(`品質改善:
  平均スコア改善: +${avgImprovement}点
  最大改善: +${Math.max(...successful.map(r => r.newScore - r.oldScore))}点
`);

    console.log('成功した再生成:');
    successful
      .sort((a, b) => (b.newScore - b.oldScore) - (a.newScore - a.oldScore))
      .slice(0, 5)
      .forEach(r => {
        console.log(`  [+${r.newScore - r.oldScore}点] ${r.title.substring(0, 50)}...`);
      });
  }

  if (failed.length > 0) {
    console.log('\n失敗した再生成:');
    failed.slice(0, 5).forEach(r => {
      console.log(`  ${r.title.substring(0, 50)}...`);
      console.log(`    理由: ${r.error}`);
    });
  }

  // ログファイルに記録
  const logEntry = {
    timestamp: new Date().toISOString(),
    processed: results.length,
    successful: successful.length,
    failed: failed.length,
    avgImprovement: successful.length > 0 
      ? Math.round(successful.reduce((sum, r) => sum + (r.newScore - r.oldScore), 0) / successful.length)
      : 0,
  };

  const fs = await import('fs/promises');
  const logPath = 'auto-regenerate.log';
  
  try {
    await fs.appendFile(logPath, JSON.stringify(logEntry) + '\n');
    console.log(`\n📄 ログを記録しました: ${logPath}`);
  } catch (error) {
    console.warn('ログファイルへの記録に失敗しました:', error);
  }

  console.log('\n✅ 自動再生成プロセスが完了しました。');
}

// エラーハンドリング
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// メイン処理の実行
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}