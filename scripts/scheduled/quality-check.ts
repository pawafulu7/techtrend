#!/usr/bin/env node

/**
 * 直近の記事要約を、要約生成と同じ判定（lib/ai/service/quality-checker.ts）で採点し、
 * 品質の分布と点の低い記事をログに出す。DB には書かない。
 * 作り直しは auto-regenerate-low-quality.ts（記事の品質スコアで選ぶ）が行う（#833）。
 * .github/workflows/scheduler-quality-auto.yml から実行
 */

import { prisma } from '@/lib/prisma';
import {
  SummaryQualityChecker,
  contentAnalysisForLength,
} from '@/lib/ai/service/quality-checker';
import { config } from '@/lib/config/env';
import { parseArgs } from 'util';
import type { ArticleWhereClause } from '../../types/database';
import { summarizeError } from '@/lib/utils/sanitize-error';

interface QualityCheckOptions {
  days?: number;
  sourceId?: string;
  limit?: number;
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
  -v, --verbose               Show detailed output
  -h, --help                  Show this help message

Examples:
  # Check last 7 days
  npx tsx scripts/scheduled/quality-check.ts

  # Check specific source with verbose output
  npx tsx scripts/scheduled/quality-check.ts -s SOURCE_ID -v
`);
    process.exit(0);
  }

  const options: QualityCheckOptions = {
    days: parseInt(values.days as string, 10),
    sourceId: values['source-id'] as string | undefined,
    limit: parseInt(values.limit as string, 10),
    verbose: values.verbose as boolean,
  };

  console.error('📊 記事要約の品質チェックを開始します...\n');
  console.error(`設定:
  - 対象期間: 過去${options.days}日間
  - 対象ソース: ${options.sourceId || 'すべて'}
  - 最大件数: ${options.limit}件
  - 詳細出力: ${options.verbose ? '有効' : '無効'}\n`);

  try {
    await checkQuality(options);
  } catch (error) {
    console.error('❌ エラーが発生しました:', summarizeError(error, { stack: true }));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

/** 問題の文面から数値を除いた種類（「一覧要約が短すぎる: 45文字（最小50文字）」→「一覧要約が短すぎる」） */
function issueKind(message: string): string {
  return message.split(/[:：]/)[0];
}

export async function checkQuality(options: QualityCheckOptions) {
  const { days = 7, sourceId, limit = 100, verbose = false } = options;

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
    select: {
      id: true,
      title: true,
      summary: true,
      detailedSummary: true,
      contentLength: true,
    },
  });

  if (articles.length === 0) {
    console.error('✅ チェック対象の記事が見つかりませんでした。');
    return;
  }

  console.error(`📝 ${articles.length}件の記事をチェックします...\n`);

  const checker = new SummaryQualityChecker();
  // 要約生成はこの点数以上の要約を採用する（unified-summary-service.ts の qualityThreshold）
  const passScore = config.quality.minScore();

  const scores: number[] = [];
  const lowQualityArticles = [];
  const issuesByType = new Map<string, number>();

  for (const article of articles) {
    if (!article.summary) continue;

    // 要約生成と同じ入力で採点する。生成時は本文の長さで短い記事の帯を選ぶ。
    // contentLength は CHAR_LENGTH(content) を保つ DB トリガーの列
    const result = checker.checkQuality(
      article.summary,
      article.detailedSummary ?? '',
      contentAnalysisForLength(article.contentLength ?? 0)
    );
    const messages = result.issues.map((issue) => issue.message);
    scores.push(result.score);

    if (result.score < passScore) {
      lowQualityArticles.push({
        id: article.id,
        title: article.title,
        score: result.score,
        issues: messages,
      });
    }

    // 問題タイプを集計
    for (const message of messages) {
      const kind = issueKind(message);
      issuesByType.set(kind, (issuesByType.get(kind) || 0) + 1);
    }

    if (verbose) {
      console.error(`[${result.score}点] ${article.title.substring(0, 50)}...`);
      if (messages.length > 0) {
        console.error(`  問題: ${messages.join(', ')}`);
      }
    }
  }

  // 統計情報を計算
  const total = scores.length;
  const stats = {
    averageScore: total > 0 ? Math.round(scores.reduce((sum, s) => sum + s, 0) / total) : 0,
    distribution: {
      excellent: scores.filter((s) => s >= 90).length,
      good: scores.filter((s) => s >= 70 && s < 90).length,
      fair: scores.filter((s) => s >= 50 && s < 70).length,
      poor: scores.filter((s) => s < 50).length,
    },
  };
  const percent = (count: number) => (total > 0 ? (count / total * 100).toFixed(1) : '0.0');

  // 結果を表示
  console.error('\n' + '='.repeat(60));
  console.error('📊 品質チェック結果サマリー');
  console.error('='.repeat(60));
  console.error(`
総合スコア: ${stats.averageScore}点

品質分布:
  優秀 (90点以上): ${stats.distribution.excellent}件 (${percent(stats.distribution.excellent)}%)
  良好 (70-89点):  ${stats.distribution.good}件 (${percent(stats.distribution.good)}%)
  可   (50-69点):  ${stats.distribution.fair}件 (${percent(stats.distribution.fair)}%)
  不良 (50点未満):  ${stats.distribution.poor}件 (${percent(stats.distribution.poor)}%)
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

  // 生成時の合格点に届かない記事のリスト
  if (lowQualityArticles.length > 0) {
    console.error(`\n⚠️  生成時の合格点（${passScore}点）未満の記事: ${lowQualityArticles.length}件\n`);

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

// メイン処理の実行（テストから checkQuality を読み込んだときはハンドラを登録しない）
if (require.main === module) {
  process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', summarizeError(error, { stack: true }));
    process.exit(1);
  });

  main().catch((error) => {
    console.error('Fatal error:', summarizeError(error, { stack: true }));
    process.exit(1);
  });
}
