#!/usr/bin/env npx tsx
/**
 * summaryVersion 7への移行スクリプト
 * 
 * 使用方法:
 * npx tsx scripts/migration/migrate-to-v7.ts [オプション]
 * 
 * オプション:
 * --dry-run        実際の更新を行わずにシミュレーション
 * --limit=N        処理件数を制限（デフォルト: 無制限）
 * --continue       前回の中断位置から再開
 * --source=NAME    特定ソースの記事のみ処理
 * --skip-backup    バックアップ確認をスキップ（非推奨）
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma = new PrismaClient();

// 設定
const BATCH_SIZE = 10; // 一度に処理する記事数
const DELAY_BETWEEN_BATCHES = 5000; // バッチ間の待機時間（ミリ秒）
const RATE_LIMIT_DELAY = 60000; // Rate Limit時の待機時間（ミリ秒）
const LONG_DELAY_INTERVAL = 100; // 長期待機を入れる間隔
const LONG_DELAY_TIME = 30000; // 長期待機時間（ミリ秒）
const PROGRESS_FILE = '.migration-v7-progress.json';
const LOG_FILE = `migration-v7-${new Date().toISOString().slice(0, 10)}.log`;

// コマンドライン引数解析
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    limit: 0,
    continue: false,
    sourceId: null as string | null,
    skipBackup: false
  };

  args.forEach(arg => {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1]);
    } else if (arg === '--continue') {
      options.continue = true;
    } else if (arg.startsWith('--source=')) {
      options.sourceId = arg.split('=')[1];
    } else if (arg === '--skip-backup') {
      options.skipBackup = true;
    }
  });

  return options;
}

// 進捗の保存と読み込み
interface Progress {
  lastProcessedId: string | null;
  processedCount: number;
  successCount: number;
  errorCount: number;
  startedAt: string;
  updatedAt: string;
}

function saveProgress(progress: Progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function loadProgress(): Progress | null {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return null;
}

// ログ出力
function log(message: string, level: 'INFO' | 'ERROR' | 'SUCCESS' = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  console.error(logMessage);
  
  // ファイルにも記録
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

// ユーザー確認
async function confirmAction(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

// バックアップ確認
async function checkBackup(skipBackup: boolean): Promise<boolean> {
  if (skipBackup) {
    log('⚠️  バックアップ確認をスキップしました', 'INFO');
    return true;
  }

  console.error('\n' + '='.repeat(60));
  console.error('⚠️  重要: データベースのバックアップを作成しましたか？');
  console.error('='.repeat(60));
  console.error('このスクリプトは既存の要約を上書きします。');
  console.error('バックアップコマンド: cp prisma/dev.db prisma/backup/dev_$(date +%Y%m%d_%H%M%S).db');
  console.error('='.repeat(60) + '\n');

  return await confirmAction('バックアップを作成済みですか？');
}

// メイン処理
async function main() {
  const options = parseArgs();
  
  log('='.repeat(60));
  log('summaryVersion 7 移行スクリプト開始');
  log(`オプション: ${JSON.stringify(options)}`);
  log('='.repeat(60));

  // バックアップ確認
  if (!options.dryRun && !await checkBackup(options.skipBackup)) {
    log('移行を中止しました。バックアップを作成してから再実行してください。', 'ERROR');
    process.exit(1);
  }

  // 進捗の読み込み
  let progress: Progress = options.continue && loadProgress() || {
    lastProcessedId: null,
    processedCount: 0,
    successCount: 0,
    errorCount: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (options.continue && progress.lastProcessedId) {
    log(`前回の進捗から再開: ${progress.processedCount}件処理済み`);
  }

  // 対象記事の取得
  const whereClause: any = {
    summaryVersion: { lt: 7 }
  };

  if (options.sourceId) {
    whereClause.sourceId = options.sourceId;
  }

  if (progress.lastProcessedId) {
    whereClause.id = { gt: progress.lastProcessedId };
  }

  // 総件数の取得
  const totalCount = await prisma.article.count({ where: { summaryVersion: { lt: 7 }, ...(options.sourceId ? { sourceId: options.sourceId } : {}) } });
  log(`移行対象: ${totalCount}件`);

  if (totalCount === 0) {
    log('移行対象の記事がありません', 'SUCCESS');
    return;
  }

  // 確認
  if (!options.dryRun) {
    const proceed = await confirmAction(`${totalCount}件の記事を移行します。続行しますか？`);
    if (!proceed) {
      log('移行を中止しました', 'INFO');
      return;
    }
  }

  // UnifiedSummaryServiceの初期化
  const summaryService = new UnifiedSummaryService();

  // バッチ処理
  let processedInSession = 0;
  const targetCount = options.limit || totalCount;

  while (processedInSession < targetCount) {
    const articles = await prisma.article.findMany({
      where: whereClause,
      orderBy: { id: 'asc' },
      take: Math.min(BATCH_SIZE, targetCount - processedInSession),
      select: {
        id: true,
        title: true,
        content: true,
        url: true,
        sourceId: true,
        summary: true,
        detailedSummary: true,
        summaryVersion: true
      }
    });

    if (articles.length === 0) {
      break;
    }

    log(`バッチ処理開始: ${articles.length}件`);

    for (const article of articles) {
      try {
        log(`処理中 [${progress.processedCount + 1}/${totalCount}]: ${article.title.substring(0, 50)}...`);

        if (!options.dryRun) {
          // 要約生成
          const result = await summaryService.generate(
            article.title,
            article.content || '',
            undefined,
            { sourceName: article.sourceId, url: article.url }
          );

          // データベース更新
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              summaryVersion: result.summaryVersion,
              articleType: result.articleType,
              qualityScore: result.qualityScore
              // tagsはリレーションなので別途処理が必要（今回は更新しない）
            }
          });

          log(`✅ 成功: ID=${article.id}, v${article.summaryVersion}→v${result.summaryVersion}`, 'SUCCESS');
          progress.successCount++;
        } else {
          log(`[DRY-RUN] 更新予定: ID=${article.id}`, 'INFO');
        }

      } catch (error: any) {
        log(`❌ エラー: ID=${article.id}, ${error.message}`, 'ERROR');
        progress.errorCount++;

        // Rate Limitエラーの場合は待機
        if (error.message?.includes('429') || error.message?.includes('rate limit')) {
          log(`Rate Limit検出。${RATE_LIMIT_DELAY / 1000}秒待機...`);
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        }
      }

      progress.processedCount++;
      processedInSession++;
      progress.lastProcessedId = article.id;
      progress.updatedAt = new Date().toISOString();

      // 進捗を保存
      if (!options.dryRun) {
        saveProgress(progress);
      }

      // 記事間の待機
      if (!options.dryRun && processedInSession < targetCount) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // バッチ間の待機
    if (processedInSession < targetCount) {
      log(`バッチ完了。次のバッチまで${DELAY_BETWEEN_BATCHES / 1000}秒待機...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }

    // 長期待機
    if (progress.processedCount % LONG_DELAY_INTERVAL === 0 && processedInSession < targetCount) {
      log(`${LONG_DELAY_INTERVAL}件処理完了。${LONG_DELAY_TIME / 1000}秒の長期待機...`);
      await new Promise(resolve => setTimeout(resolve, LONG_DELAY_TIME));
    }

    // whereClauseを更新
    if (progress.lastProcessedId) {
      whereClause.id = { gt: progress.lastProcessedId };
    }
  }

  // 結果サマリー
  log('='.repeat(60));
  log('移行完了');
  log(`処理件数: ${progress.processedCount}`);
  log(`成功: ${progress.successCount}`);
  log(`エラー: ${progress.errorCount}`);
  log(`成功率: ${((progress.successCount / progress.processedCount) * 100).toFixed(1)}%`);
  log('='.repeat(60));

  // 進捗ファイルの削除（完了時のみ）
  if (!options.dryRun && progress.processedCount >= totalCount) {
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
      log('進捗ファイルを削除しました');
    }
  }

  // 統計情報
  if (!options.dryRun) {
    const v7Count = await prisma.article.count({ where: { summaryVersion: 7 } });
    const remainingCount = await prisma.article.count({ where: { summaryVersion: { lt: 7 } } });
    
    log('\n【データベース統計】');
    log(`summaryVersion 7: ${v7Count}件`);
    log(`未移行: ${remainingCount}件`);
  }
}

// エラーハンドリング
process.on('SIGINT', () => {
  log('\n処理を中断しました。--continueオプションで再開できます。', 'INFO');
  process.exit(0);
});

// 実行
main()
  .catch(error => {
    log(`予期しないエラー: ${error.message}`, 'ERROR');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });