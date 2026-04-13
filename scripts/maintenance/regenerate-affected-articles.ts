/**
 * 影響を受けた記事の再生成スクリプト
 *
 * データ修正スクリプトでコロンなし行がスキップされ、項目が失われた記事を再生成
 * 最新のparseUnifiedResponse（カテゴリ削除ロジック）で正しいフォーマットに修正
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import { getAppDependencies } from '@/lib/di/bootstrap';
import * as fs from 'fs';

const prisma = createPrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const idsFileArg = args.find(arg => arg.startsWith('--ids-file='));
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const isDryRun = args.includes('--dry-run');

  if (!idsFileArg) {
    console.error('Error: --ids-file=<path> is required');
    console.error('Usage: npx tsx scripts/maintenance/regenerate-affected-articles.ts --ids-file=/tmp/affected-ids.txt [--limit=10] [--dry-run]');
    process.exit(1);
  }

  const idsFile = idsFileArg.split('=')[1];
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

  console.log('影響記事の再生成スクリプト');
  console.log('=====================================');
  console.log(`IDファイル: ${idsFile}`);
  console.log(`モード: ${isDryRun ? 'DRY RUN' : '実行'}`);
  console.log(`制限: ${limit ? `${limit}件` : 'なし'}`);
  console.log('');

  // IDリストを読み込み
  const idsContent = fs.readFileSync(idsFile, 'utf-8');
  let targetIds = idsContent.split('\n').map(id => id.trim()).filter(id => id.length > 0);

  if (limit) {
    targetIds = targetIds.slice(0, limit);
  }

  console.log(`対象記事数: ${targetIds.length}件`);
  console.log('');

  // 記事を取得
  const articles = await prisma.article.findMany({
    where: {
      id: {
        in: targetIds
      }
    },
    orderBy: {
      publishedAt: 'desc'
    }
  });

  console.log(`取得記事数: ${articles.length}件`);
  console.log('');

  if (isDryRun) {
    console.log('DRY RUNモード: 以下の記事が再生成されます:');
    articles.forEach((article, index) => {
      console.log(`[${index + 1}] ${article.id}: ${article.title?.substring(0, 60)}...`);
    });
    console.log('');
    console.log('実行するには --dry-run を外してください');
    await prisma.$disconnect();
    return;
  }

  const deps = getAppDependencies();
  let successCount = 0;
  let failureCount = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.log(`[${i + 1}/${articles.length}] ${article.id}`);
    console.log(`  タイトル: ${article.title?.substring(0, 60)}...`);

    try {
      const result = await deps.service.generateSummary({
        title: article.title,
        content: article.content,
        url: article.url,
        articleId: article.id,
      });

      await prisma.article.update({
        where: { id: article.id },
        data: {
          summary: result.summary,
          detailedSummary: result.detailedSummary,
          summaryVersion: 8,
          summaryComputedAt: new Date(),
        },
      });

      console.log(`  ✓ 完了`);
      console.log(`  要約: ${result.summary.substring(0, 80)}...`);
      console.log(`  詳細: ${result.detailedSummary.split('\n').length}項目`);
      console.log('');
      successCount++;

      // API制限を考慮して少し待機
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      const err = error as Error;
      console.error(`  ✗ エラー: ${err.message}`);
      console.log('');
      failureCount++;
      errors.push({ id: article.id, error: err.message });
    }
  }

  console.log('=====================================');
  console.log('実行結果');
  console.log(`成功: ${successCount}件`);
  console.log(`失敗: ${failureCount}件`);

  if (errors.length > 0) {
    console.log('');
    console.log('エラー詳細:');
    errors.forEach(({ id, error }) => {
      console.log(`  ${id}: ${error}`);
    });
  }
}

main()
  .catch((error) => {
    console.error('スクリプト実行エラー:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
