#!/usr/bin/env npx tsx

/**
 * ArticleViewテーブルのviewedAt修復スクリプト
 * 「全て既読にする」機能で一括更新されたviewedAtをNULLにリセット
 * 
 * 使用方法:
 * npx tsx scripts/fix/restore-article-view-dates.ts [--dry-run] [--batch-size=100] [--user-id=xxx]
 */

import { PrismaClient } from '@prisma/client';
import { parseArgs } from 'util';

const prisma = new PrismaClient();

interface Options {
  dryRun: boolean;
  batchSize: number;
  userId?: string;
  targetDate: Date;
}

async function analyzeAffectedData(options: Options) {
  console.log('=== 影響を受けたデータの分析 ===');
  
  // 特定の時刻で一括更新されたレコードをカウント
  const targetDateStr = options.targetDate.toISOString();
  const whereClause: any = {
    viewedAt: {
      gte: new Date(options.targetDate.getTime() - 1000), // 1秒の余裕
      lte: new Date(options.targetDate.getTime() + 1000), // 1秒の余裕
    }
  };

  if (options.userId) {
    whereClause.userId = options.userId;
  }

  const affectedCount = await prisma.articleView.count({
    where: whereClause
  });

  console.log(`影響を受けた記録数: ${affectedCount} 件`);
  console.log(`対象時刻: ${targetDateStr}`);
  console.log(`ユーザーID: ${options.userId || '全ユーザー'}`);

  // viewedAtとreadAtが同じレコードを確認
  const sameTimeCount = await prisma.articleView.count({
    where: {
      ...whereClause,
      readAt: { not: null }
    }
  });

  console.log(`viewedAtとreadAtが近い時刻の記録: ${sameTimeCount} 件`);

  // ユーザー別の内訳を表示
  const userBreakdown = await prisma.articleView.groupBy({
    by: ['userId'],
    where: whereClause,
    _count: {
      id: true
    }
  });

  console.log('\nユーザー別内訳:');
  for (const user of userBreakdown) {
    const userInfo = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { email: true, name: true }
    });
    console.log(`  ${userInfo?.email || user.userId}: ${user._count.id} 件`);
  }

  return affectedCount;
}

async function restoreViewDates(options: Options) {
  console.log('\n=== データ修復処理 ===');
  
  if (options.dryRun) {
    console.log('【ドライラン】実際の更新は行いません');
  }

  const whereClause: any = {
    viewedAt: {
      gte: new Date(options.targetDate.getTime() - 1000),
      lte: new Date(options.targetDate.getTime() + 1000),
    }
  };

  if (options.userId) {
    whereClause.userId = options.userId;
  }

  // 影響を受けたレコードを取得
  const affectedRecords = await prisma.articleView.findMany({
    where: whereClause,
    select: {
      id: true,
      userId: true,
      articleId: true,
      viewedAt: true,
      readAt: true
    },
    orderBy: { id: 'asc' }
  });

  const totalRecords = affectedRecords.length;
  console.log(`処理対象: ${totalRecords} 件`);

  let processedCount = 0;
  let errorCount = 0;

  // バッチ処理
  for (let i = 0; i < totalRecords; i += options.batchSize) {
    const batch = affectedRecords.slice(i, i + options.batchSize);
    const batchIds = batch.map(r => r.id);

    try {
      if (!options.dryRun) {
        // viewedAtを元の値（作成時刻）にリセット
        // 注意: 実際に閲覧していない記録の場合、削除することも検討
        await prisma.articleView.updateMany({
          where: {
            id: { in: batchIds }
          },
          data: {
            viewedAt: null // NULLにリセット（または削除）
          }
        });
      }

      processedCount += batch.length;
      const progress = Math.round((processedCount / totalRecords) * 100);
      process.stdout.write(`\r進捗: ${processedCount}/${totalRecords} (${progress}%)`);

      // Rate limit対策
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      errorCount++;
      console.error(`\nバッチ処理エラー: ${error}`);
    }
  }

  console.log('\n');
  console.log(`処理完了: ${processedCount} 件`);
  console.log(`エラー: ${errorCount} 件`);

  return { processedCount, errorCount };
}

async function verifyRestoration() {
  console.log('\n=== 修復後の確認 ===');

  // NULL化されたレコード数を確認
  const nullViewedAtCount = await prisma.articleView.count({
    where: {
      viewedAt: null
    }
  });

  console.log(`viewedAtがNULLのレコード: ${nullViewedAtCount} 件`);

  // 残っている同一時刻のレコードを確認
  const targetDate = new Date('2025-08-25T15:16:09.000Z');
  const remainingCount = await prisma.articleView.count({
    where: {
      viewedAt: {
        gte: new Date(targetDate.getTime() - 1000),
        lte: new Date(targetDate.getTime() + 1000),
      }
    }
  });

  console.log(`同一時刻の残存レコード: ${remainingCount} 件`);
}

async function main() {
  console.log('ArticleView修復スクリプト');
  console.log('='.repeat(50));

  // コマンドライン引数を解析
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'dry-run': {
        type: 'boolean',
        default: false,
      },
      'batch-size': {
        type: 'string',
        default: '100',
      },
      'user-id': {
        type: 'string',
      },
      'target-date': {
        type: 'string',
        default: '2025-08-25T15:16:09.000Z',
      },
      'analyze-only': {
        type: 'boolean',
        default: false,
      },
    },
  });

  const options: Options = {
    dryRun: values['dry-run'] || false,
    batchSize: parseInt(values['batch-size'] || '100', 10),
    userId: values['user-id'],
    targetDate: new Date(values['target-date'] || '2025-08-25T15:16:09.000Z'),
  };

  try {
    // 分析を実行
    const affectedCount = await analyzeAffectedData(options);

    if (values['analyze-only']) {
      console.log('\n分析のみモードで実行しました');
      return;
    }

    if (affectedCount === 0) {
      console.log('\n修復対象のデータがありません');
      return;
    }

    // 確認プロンプト（ドライランでない場合）
    if (!options.dryRun && affectedCount > 0) {
      console.log('\n');
      console.log('⚠️  警告: この操作はデータベースを変更します');
      console.log(`${affectedCount} 件のレコードのviewedAtをNULLにリセットします`);
      console.log('続行しますか？ (yes/no): ');

      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      await new Promise<void>((resolve) => {
        readline.question('', (answer: string) => {
          if (answer.toLowerCase() !== 'yes') {
            console.log('処理を中止しました');
            process.exit(0);
          }
          readline.close();
          resolve();
        });
      });
    }

    // 修復を実行
    const result = await restoreViewDates(options);

    // 修復後の確認
    if (!options.dryRun) {
      await verifyRestoration();
    }

    console.log('\n✅ 処理が完了しました');
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});