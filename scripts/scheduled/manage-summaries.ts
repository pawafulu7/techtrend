import { SummaryManager } from '@/lib/services/summary/summary-manager';
import { getPrismaClient } from '@/lib/cli/utils/database';
import { createNotifierFromEnv } from '@/lib/notification';
import type { ArticleInfo } from '@/lib/notification/types';

interface Options {
  command: 'generate' | 'regenerate' | 'missing';
  source?: string;
  limit?: number;
  force?: boolean;
  batch?: number;
  days?: number;
}

// コマンドライン引数を解析
function parseArgs(args: string[]): Options {
  const options: Options = {
    command: args.length > 0 ? (args[0] as 'generate' | 'regenerate' | 'missing') : 'generate',
    limit: 50,
    batch: 10,
    days: 7
  };

  // 最初の引数をコマンドとして扱う
  if (args.length > 0) {
    args = args.slice(1); // コマンドを除去
  }

  // オプションの解析
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '-s':
      case '--source':
        if (nextArg) {
          options.source = nextArg;
          i++;
        }
        break;
      case '-l':
      case '--limit':
        if (nextArg && !isNaN(parseInt(nextArg))) {
          options.limit = parseInt(nextArg);
          i++;
        }
        break;
      case '-f':
      case '--force':
        options.force = true;
        break;
      case '-b':
      case '--batch':
        if (nextArg && !isNaN(parseInt(nextArg))) {
          options.batch = parseInt(nextArg);
          i++;
        }
        break;
      case '-d':
      case '--days':
        if (nextArg && !isNaN(parseInt(nextArg))) {
          options.days = parseInt(nextArg);
          i++;
        }
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

// ヘルプメッセージを表示
function printHelp() {
  console.error(`
要約生成の統合管理ツール

使用方法:
  npx tsx scripts/scheduled/manage-summaries.ts [コマンド] [オプション]

コマンド:
  generate    要約がない記事の要約を生成 (デフォルト)
  regenerate  既存の要約を再生成
  missing     要約が欠損している記事のみ処理

共通オプション:
  -s, --source <source>  特定のソースのみ処理
  -h, --help            ヘルプを表示

generateオプション:
  -l, --limit <limit>   処理数の上限 (デフォルト: 50)

regenerateオプション:
  -f, --force           強制的に再生成
  -b, --batch <size>    バッチサイズ (デフォルト: 10)

missingオプション:
  -d, --days <days>     過去N日間の記事のみ (デフォルト: 7)
`);
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // 重要: getPrismaClient()使用（設定・ログの一貫性）
  const prisma = getPrismaClient();

  try {
    // 安全なコマンドディスパッチ（CodexMCP指摘）
    const validCommands = ['generate', 'regenerate', 'missing'] as const;
    if (!validCommands.includes(options.command)) {
      console.error('不明なコマンド:', options.command);
      printHelp();
      process.exitCode = 1;
      return;
    }

    const manager = new SummaryManager(prisma);
    let result;

    // Record start time to identify newly processed articles
    const startTime = new Date();

    switch (options.command) {
      case 'generate':
        result = await manager.generateSummaries(options);
        break;
      case 'regenerate':
        result = await manager.regenerateSummaries(options);
        break;
      case 'missing':
        result = await manager.generateMissingSummaries(options);
        break;
    }

    // Send Slack notification for newly generated summaries (generate command only)
    // Assumption: summaryComputedAt is only updated by this script during execution.
    // If other processes update summaryComputedAt concurrently, notifications may include
    // unrelated articles. Currently this is safe as manage-summaries runs sequentially.
    if (options.command === 'generate' && result.generated > 0) {
      try {
        const notifier = createNotifierFromEnv();
        if (notifier) {
          // Fetch articles processed during this execution (summaryComputedAt >= startTime)
          const processedArticles = await prisma.article.findMany({
            where: {
              summaryComputedAt: { gte: startTime },
              summary: { not: null }
            },
            select: {
              title: true,
              translatedTitle: true,
              url: true,
              source: { select: { name: true } }
            }
          });

          // Sort by display title (translatedTitle ?? title) for consistent ordering
          processedArticles.sort((a, b) => {
            const titleA = a.translatedTitle || a.title;
            const titleB = b.translatedTitle || b.title;
            return titleA.localeCompare(titleB, 'ja');
          });

          if (processedArticles.length > 0) {
            const articlesForNotification: ArticleInfo[] = processedArticles.map(a => ({
              title: a.title,
              translatedTitle: a.translatedTitle,
              url: a.url,
              sourceName: a.source.name
            }));

            await notifier.send({
              newArticles: processedArticles.length,
              duplicates: 0,
              updated: 0,
              newArticleIds: [],
              articles: articlesForNotification,
              durationSeconds: Math.round((Date.now() - startTime.getTime()) / 1000)
            });
            console.error('[INFO] Slack notification sent successfully');
          }
        }
      } catch (error) {
        console.error(
          '[WARN] Slack notification failed:',
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // 統計情報の表示
    const stats = manager.getStats();
    console.error('\n📈 API統計:');
    console.error(`   総試行回数: ${stats.attempts}`);
    console.error(`   成功: ${stats.successes}`);
    console.error(`   失敗: ${stats.failures}`);
    console.error(`   503エラー: ${stats.overloadErrors}`);

    // 処理結果の表示
    console.error('\n📊 処理結果:');
    console.error(`   生成成功: ${result.generated}`);
    console.error(`   スキップ: ${result.skipped ?? 0} (content missing/too short)`);
    console.error(`   エラー: ${result.errors}`);

    // 実際に処理を試みた件数（スキップを除く）
    const processed = result.generated + result.errors;

    // 最小処理件数閾値（小サンプルでのfalse positive回避）
    const DEFAULT_MIN_PROCESSED = 5;
    const rawMinProcessed = process.env.MIN_PROCESSED_FOR_FAILURE;
    const parsedMin = Number.parseInt(rawMinProcessed ?? String(DEFAULT_MIN_PROCESSED), 10);
    const MIN_PROCESSED_FOR_FAILURE =
      Number.isFinite(parsedMin) && parsedMin >= 1 ? parsedMin : DEFAULT_MIN_PROCESSED;
    if (rawMinProcessed !== undefined && MIN_PROCESSED_FOR_FAILURE !== parsedMin) {
      console.error(`[WARN] Invalid MIN_PROCESSED_FOR_FAILURE='${rawMinProcessed}', falling back to ${DEFAULT_MIN_PROCESSED}`);
    }

    // 終了条件の判定
    if (processed === 0) {
      // 処理対象が0件の場合は成功終了（スキップのみなら正常）
      console.error('\n[INFO] No articles to process (all skipped). Exiting successfully.');
    } else if (processed >= MIN_PROCESSED_FOR_FAILURE && result.generated === 0) {
      // 十分なサンプル数があり、全て失敗した場合のみexit 1
      console.error(`\n[WARN] All ${processed} processed articles failed to generate summaries`);
      process.exitCode = 1;
    } else if (result.generated === 0) {
      // サンプル数が少なく全て失敗 → 警告のみ（false positive回避）
      console.error(`\n[WARN] All ${processed} processed articles failed (threshold: ${MIN_PROCESSED_FOR_FAILURE}, not failing job)`);
    } else if (result.errors > 0) {
      // 一部成功・一部失敗は警告のみ（正常終了）
      console.error(`\n[WARN] Partial success: ${result.generated} generated, ${result.errors} failed, ${result.skipped ?? 0} skipped`);
    }
  } catch (error) {
    console.error('実行エラー:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  main()
    .then(() => process.exit(process.exitCode || 0))
    .catch((error) => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

// エクスポート（scheduler-v2.tsから呼び出せるように）
export { main };
