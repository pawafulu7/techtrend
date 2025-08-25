#!/usr/bin/env npx tsx

/**
 * 「全て既読にする」で作成された不正なArticleViewレコードを削除
 * viewedAtが一括で同じ時刻になっているレコードを削除
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

async function deleteInvalidViews(options: Options) {
  console.log('=== 不正な閲覧記録の削除 ===\n');
  
  const whereClause: any = {
    viewedAt: {
      gte: new Date(options.targetDate.getTime() - 1000),
      lte: new Date(options.targetDate.getTime() + 1000),
    }
  };

  if (options.userId) {
    whereClause.userId = options.userId;
  }

  // 削除対象のレコードを取得
  const targetRecords = await prisma.articleView.findMany({
    where: whereClause,
    select: {
      id: true,
      userId: true,
      articleId: true,
      viewedAt: true,
      isRead: true,
      readAt: true,
    },
    orderBy: { id: 'asc' }
  });

  const totalRecords = targetRecords.length;
  console.log(`削除対象: ${totalRecords} 件`);
  console.log(`対象時刻: ${options.targetDate.toISOString()}`);
  console.log(`ドライラン: ${options.dryRun ? 'はい' : 'いいえ'}`);
  
  if (options.dryRun) {
    console.log('\n【ドライラン】実際の削除は行いません');
  }

  let deletedCount = 0;
  let errorCount = 0;
  let preservedCount = 0;

  // バッチ処理で削除
  for (let i = 0; i < totalRecords; i += options.batchSize) {
    const batch = targetRecords.slice(i, i + options.batchSize);
    
    try {
      if (!options.dryRun) {
        // 実際に閲覧記録がある（isReadがtrue）場合は、閲覧記録だけ削除して既読状態を維持
        const recordsToDelete = [];
        const recordsToUpdate = [];
        
        for (const record of batch) {
          if (record.isRead && record.readAt) {
            // 既読状態は維持（後で新しいレコードで置き換える）
            recordsToUpdate.push(record);
          }
          recordsToDelete.push(record.id);
        }
        
        // まず古いレコードを削除
        await prisma.articleView.deleteMany({
          where: {
            id: { in: recordsToDelete }
          }
        });
        
        // 既読状態を維持するため新しいレコードを作成（viewedAtは設定しない）
        for (const record of recordsToUpdate) {
          await prisma.articleView.create({
            data: {
              userId: record.userId,
              articleId: record.articleId,
              isRead: true,
              readAt: record.readAt,
              // viewedAtは@default(now())により新規作成時のみ設定される
            }
          }).catch(() => {
            // すでに存在する場合は無視
            preservedCount++;
          });
        }
        
        deletedCount += recordsToDelete.length;
      } else {
        // ドライランの場合はカウントのみ
        deletedCount += batch.length;
      }

      const progress = Math.round(((i + batch.length) / totalRecords) * 100);
      process.stdout.write(`\r進捗: ${i + batch.length}/${totalRecords} (${progress}%)`);

      // Rate limit対策
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      errorCount++;
      console.error(`\nバッチ処理エラー: ${error}`);
    }
  }

  console.log('\n');
  console.log(`削除完了: ${deletedCount} 件`);
  console.log(`既読状態保持: ${preservedCount} 件`);
  console.log(`エラー: ${errorCount} 件`);
  
  return { deletedCount, preservedCount, errorCount };
}

async function verifyDeletion() {
  console.log('\n=== 削除後の確認 ===');
  
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
  
  // 全体の記録数を確認
  const totalCount = await prisma.articleView.count();
  console.log(`全ArticleViewレコード: ${totalCount} 件`);
}

async function main() {
  console.log('不正な閲覧記録削除スクリプト');
  console.log('='.repeat(50));

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
    },
  });

  const options: Options = {
    dryRun: values['dry-run'] || false,
    batchSize: parseInt(values['batch-size'] || '100', 10),
    userId: values['user-id'],
    targetDate: new Date(values['target-date'] || '2025-08-25T15:16:09.000Z'),
  };

  try {
    // 確認プロンプト（ドライランでない場合）
    if (!options.dryRun) {
      const targetCount = await prisma.articleView.count({
        where: {
          viewedAt: {
            gte: new Date(options.targetDate.getTime() - 1000),
            lte: new Date(options.targetDate.getTime() + 1000),
          },
          ...(options.userId ? { userId: options.userId } : {})
        }
      });
      
      if (targetCount === 0) {
        console.log('削除対象のレコードがありません');
        return;
      }
      
      console.log(`\n⚠️  警告: この操作はデータベースを変更します`);
      console.log(`${targetCount} 件のレコードを削除します`);
      console.log(`既読状態は維持されます`);
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

    // 削除を実行
    const result = await deleteInvalidViews(options);

    // 削除後の確認
    if (!options.dryRun) {
      await verifyDeletion();
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