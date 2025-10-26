import { SummaryManager } from '@/lib/services/summary-manager';
import { getPrismaClient } from '@/lib/cli/utils/database';

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

    // 統計情報の表示
    const stats = manager.getStats();
    console.error('\n📈 API統計:');
    console.error(`   総試行回数: ${stats.attempts}`);
    console.error(`   成功: ${stats.successes}`);
    console.error(`   失敗: ${stats.failures}`);
    console.error(`   503エラー: ${stats.overloadErrors}`);

    if (result.errors > 0) {
      process.exitCode = 1;
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
  main();
}

// エクスポート（scheduler-v2.tsから呼び出せるように）
export { main };
