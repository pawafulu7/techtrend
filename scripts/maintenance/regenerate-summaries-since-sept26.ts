import { PrismaClient } from '@prisma/client';
import { getAppDependencies } from '@/lib/di/bootstrap';

const prisma = new PrismaClient();

async function main() {
  console.log('=== コロン直後に改行がある記事の再生成スクリプト ===\n');

  const articles = await prisma.article.findMany({
    where: {
      summaryComputedAt: {
        gte: new Date('2025-09-26T00:00:00Z'),
      },
      detailedSummary: {
        not: null,
        contains: '：\n',
      },
    },
    orderBy: {
      summaryComputedAt: 'desc',
    },
  });

  console.log(`対象記事数: ${articles.length}件\n`);

  if (articles.length === 0) {
    console.log('再生成が必要な記事はありません。');
    return;
  }

  const deps = getAppDependencies();
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.log(
      `[${i + 1}/${articles.length}] 処理中: ${article.title.substring(0, 50)}...`,
    );

    try {
      if (!article.content || article.content.length < 100) {
        console.log('  ⚠️  スキップ: コンテンツが不足しています');
        continue;
      }

      const result = await deps.service.generateSummary({
        title: article.title,
        content: article.content,
        url: article.url,
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

      console.log('  ✓ 完了');
      successCount++;

      if (i > 0 && i % 5 === 0) {
        console.log(`\n進捗: ${i}/${articles.length}件完了\n`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`  ✗ エラー: ${error}`);
      failureCount++;
    }
  }

  console.log('\n=== 実行結果 ===');
  console.log(`成功: ${successCount}件`);
  console.log(`失敗: ${failureCount}件`);
  console.log(`合計: ${articles.length}件`);
}

main()
  .catch((error) => {
    console.error('スクリプト実行エラー:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });