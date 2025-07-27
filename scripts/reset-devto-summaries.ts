import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetDevToSummaries() {
  console.log('=== Dev.to記事の要約をリセット ===\n');

  // Dev.toの全記事の要約をnullに設定
  const result = await prisma.article.updateMany({
    where: {
      source: { name: 'Dev.to' }
    },
    data: {
      summary: null
    }
  });

  console.log(`リセット完了: ${result.count}件の記事の要約をクリアしました`);

  await prisma.$disconnect();
}

resetDevToSummaries().catch(console.error);