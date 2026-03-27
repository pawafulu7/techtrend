#!/usr/bin/env node

/**
 * 記事要約の品質を定期的にチェックし、低品質な要約を検出
 * PM2スケジューラーで実行可能
 */

import { prisma } from '@/lib/prisma';
import { calculateSummaryScore, calculateAverageScore, needsRegeneration } from '@/lib/utils/quality-scorer';
import { parseArgs } from 'util';
import type { ArticleWhereClause } from '../../types/database';

interface QualityCheckOptions {
  days?: number;
  sourceId?: string;
  limit?: number;
  autoRegenerate?: boolean;
  verbose?: boolean;
}

async function main() {
  const { values } = parseArgs({
    options: {
      days: {
        type: 'string',
        short: 'd',
        default: '7',
      },
      'source-id': {
        type: 'string',
        short: 's',
      },
      limit: {
        type: 'string',
        short: 'l',
        default: '100',
      },
      'auto-regenerate': {
        type: 'boolean',
        short: 'r',
        default: false,
      },
      verbose: {
        type: 'boolean',
        short: 'v',
        default: false,
      },
      help: {
        type: 'boolean',
        short: 'h',
      },
    },
  });

  if (values.help) {
    console.error(`
Usage: quality-check.ts [options]

Options:
  -d, --days <number>         Check articles from last N days (default: 7)
  -s, --source-id <id>        Check specific source only
  -l, --limit <number>        Maximum articles to check (default: 100)
  -r, --auto-regenerate       Automatically mark low-quality for regeneration
  -v, --verbose               Show detailed output
  -h, --help                  Show this help message

Examples:
  # Check last 7 days
  npx tsx scripts/scheduled/quality-check.ts

  # Check specific source with verbose output
  npx tsx scripts/scheduled/quality-check.ts -s SOURCE_ID -v

  # Check and mark for regeneration
  npx tsx scripts/scheduled/quality-check.ts -r
`);
    process.exit(0);
  }

  const options: QualityCheckOptions = {
    days: parseInt(values.days as string, 10),
    sourceId: values['source-id'] as string | undefined,
    limit: parseInt(values.limit as string, 10),
    autoRegenerate: values['auto-regenerate'] as boolean,
    verbose: values.verbose as boolean,
  };

  console.error('📊 記事要約の品質チェックを開始します...\n');
  console.error(`設定:
  - 対象期間: 過去${options.days}日間
  - 対象ソース: ${options.sourceId || 'すべて'}
  - 最大件数: ${options.limit}件
  - 自動再生成マーク: ${options.autoRegenerate ? '有効' : '無効'}
  - 詳細出力: ${options.verbose ? '有効' : '無効'}\n`);

  try {
    await checkQuality(options);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function checkQuality(options: QualityCheckOptions) {
  const { days = 7, sourceId, limit = 100, autoRegenerate = false, verbose = false } = options;

  // 対象記事を取得
  const since = new Date();
  since.setDate(since.getDate() - days);

  const whereClause: ArticleWhereClause = {
    publishedAt: { gte: since },
    summary: { not: null },
  };

  if (sourceId) {
    whereClause.sourceId = sourceId;
  }

  const articles = await prisma.article.findMany({
    where: whereClause,
    take: limit,
    orderBy: { publishedAt: 'desc' },
    include: {
      source: true,
      tags: true,
    },
  });

  if (articles.length === 0) {
    console.error('✅ チェック対象の記事が見つかりませんでした。');
    return;
  }

  console.error(`📝 ${articles.length}件の記事をチェックします...\n`);

  // 品質スコアを計算
  const results = [];
  const lowQualityArticles = [];
  const issuesByType = new Map<string, number>();

  for (const article of articles) {
    if (!article.summary) continue;

    const tags = article.tags.map((t: any) => t.name);
    const score = calculateSummaryScore(article.summary, {
      targetLength: 120,
      isDetailed: false,
      tags,
    });

    results.push({
      articleId: article.id,
      title: article.title,
      source: article.source.name,
      score: score.totalScore,
      issues: score.issues,
      needsRegeneration: needsRegeneration(score),
    });

    // 問題のある記事を記録
    if (score.totalScore < 70) {
      lowQualityArticles.push({
        id: article.id,
        title: article.title,
        score: score.totalScore,
        issues: score.issues,
      });
    }

    // 問題タイプを集計
    for (const issue of score.issues) {
      issuesByType.set(issue, (issuesByType.get(issue) || 0) + 1);
    }

    if (verbose) {
      console.error(`[${score.totalScore}点] ${article.title.substring(0, 50)}...`);
      if (score.issues.length > 0) {
        console.error(`  問題: ${score.issues.join(', ')}`);
      }
    }
  }

  // 統計情報を計算
  const summariesForAverage = articles
    .filter(a => a.summary)
    .map(a => ({
      summary: a.summary!,
      tags: a.tags.map((t: any) => t.name),
      isDetailed: false,
    }));

  const stats = calculateAverageScore(summariesForAverage);

  // 結果を表示
  console.error('\n' + '='.repeat(60));
  console.error('📊 品質チェック結果サマリー');
  console.error('='.repeat(60));
  console.error(`
総合スコア: ${stats.averageScore}点

品質分布:
  優秀 (90点以上): ${stats.distribution.excellent}件 (${(stats.distribution.excellent / articles.length * 100).toFixed(1)}%)
  良好 (70-89点):  ${stats.distribution.good}件 (${(stats.distribution.good / articles.length * 100).toFixed(1)}%)
  可   (50-69点):  ${stats.distribution.fair}件 (${(stats.distribution.fair / articles.length * 100).toFixed(1)}%)
  不良 (50点未満):  ${stats.distribution.poor}件 (${(stats.distribution.poor / articles.length * 100).toFixed(1)}%)
`);

  // 問題タイプ別の集計を表示
  if (issuesByType.size > 0) {
    console.error('頻出する問題:');
    const sortedIssues = Array.from(issuesByType.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    for (const [issue, count] of sortedIssues) {
      console.error(`  - ${issue}: ${count}件`);
    }
  }

  // 低品質記事のリスト
  if (lowQualityArticles.length > 0) {
    console.error(`\n⚠️  低品質記事（70点未満）: ${lowQualityArticles.length}件\n`);
    
    const topWorst = lowQualityArticles
      .sort((a, b) => a.score - b.score)
      .slice(0, 10);

    for (const article of topWorst) {
      console.error(`[${article.score}点] ${article.title.substring(0, 60)}...`);
      console.error(`  ID: ${article.id}`);
      console.error(`  問題: ${article.issues.slice(0, 3).join(', ')}`);
      console.error('');
    }
  }

  // 再生成が必要な記事
  const needsRegenerationCount = results.filter(r => r.needsRegeneration).length;
  if (needsRegenerationCount > 0) {
    console.error(`\n🔄 再生成が必要な記事: ${needsRegenerationCount}件`);

    if (autoRegenerate) {
      console.error('\n再生成マークを付与しています...');
      
      const articleIds = results
        .filter(r => r.needsRegeneration)
        .map(r => r.articleId);

      // summaryVersionを0にリセットして再生成対象にする
      await prisma.article.updateMany({
        where: {
          id: { in: articleIds },
        },
        data: {
          summaryVersion: 0,
        },
      });

      console.error(`✅ ${articleIds.length}件の記事に再生成マークを付与しました。`);
      console.error('次回のregenerate-summaries.tsで自動的に再生成されます。');
    } else {
      console.error('再生成を実行するには、regenerate-summaries.tsを使用してください。');
      
      const articleIds = results
        .filter(r => r.needsRegeneration)
        .map(r => r.articleId)
        .slice(0, 5);
      
      console.error(`\n例:\nnpx tsx scripts/scheduled/regenerate-summaries.ts --ids ${articleIds.join(',')}`);
    }
  }

  // 推奨事項
  console.error('\n' + '='.repeat(60));
  console.error('💡 推奨事項');
  console.error('='.repeat(60));

  if (stats.averageScore >= 85) {
    console.error('✅ 全体的に高品質な要約が生成されています。');
  } else if (stats.averageScore >= 70) {
    console.error('⚠️  品質は良好ですが、改善の余地があります。');
    if (stats.distribution.poor > 0) {
      console.error('   低品質な要約の再生成を検討してください。');
    }
  } else {
    console.error('❌ 要約品質に問題があります。');
    console.error('   プロンプトの見直しや、AI設定の調整を検討してください。');
  }

  // 詳細レポートの保存オプション
  if (verbose && lowQualityArticles.length > 0) {
    const reportPath = `quality-report-${new Date().toISOString().split('T')[0]}.json`;
    const fs = await import('fs/promises');
    
    await fs.writeFile(
      reportPath,
      JSON.stringify({
        date: new Date().toISOString(),
        stats,
        lowQualityArticles,
        issuesByType: Object.fromEntries(issuesByType),
      }, null, 2)
    );
    
    console.error(`\n📄 詳細レポートを保存しました: ${reportPath}`);
  }
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