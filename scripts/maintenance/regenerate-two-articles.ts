import { createPrismaClient } from '@/lib/prisma/create-client';
import { getAppDependencies } from '@/lib/di/bootstrap';

const prisma = createPrismaClient();

async function main() {
  const targetIds = [
    'cmg1mqnxq000ntewkndqiahgk',
    'cmg115wkr0005teas4034fom9'
  ];

  console.log('=== 指定された2件の記事を再生成 ===\n');

  const articles = await prisma.article.findMany({
    where: {
      id: {
        in: targetIds
      }
    }
  });

  console.log(`対象記事数: ${articles.length}件\n`);

  const deps = getAppDependencies();
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.log(`[${i + 1}/${articles.length}] 処理中: ${article.title}`);

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

      console.log('  ✓ 完了\n');
      successCount++;
    } catch (error) {
      console.error(`  ✗ エラー: ${error}\n`);
      failureCount++;
    }
  }

  console.log('=== 実行結果 ===');
  console.log(`成功: ${successCount}件`);
  console.log(`失敗: ${failureCount}件`);
}

main()
  .catch((error) => {
    console.error('スクリプト実行エラー:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
