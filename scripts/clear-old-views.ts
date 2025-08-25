#!/usr/bin/env npx tsx
/**
 * 古い閲覧履歴をクリアするスクリプト
 * 30日以上前の閲覧履歴を削除して、古い記事を再度推薦対象にする
 */

import { prisma } from '@/lib/prisma';

async function clearOldViews(userId: string, daysToKeep: number = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  console.log(`Clearing views older than ${cutoffDate.toISOString()}`);

  const result = await prisma.articleView.deleteMany({
    where: {
      userId,
      viewedAt: {
        lt: cutoffDate
      }
    }
  });

  console.log(`Deleted ${result.count} old view records`);
  return result.count;
}

// 実行
const userId = process.argv[2];
if (!userId) {
  console.error('Usage: npx tsx scripts/clear-old-views.ts <userId>');
  process.exit(1);
}

clearOldViews(userId)
  .then(() => {
    console.log('Completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });