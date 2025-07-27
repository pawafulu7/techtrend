import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetZennSummaries() {
  console.log('=== Zenn記事の要約をリセット ===\n');

  // Zennの全記事の要約をnullに設定
  const result = await prisma.article.updateMany({
    where: {
      source: { name: 'Zenn' }
    },
    data: {
      summary: null
    }
  });

  console.log(`リセット完了: ${result.count}件の記事の要約をクリアしました`);

  await prisma.$disconnect();
}

resetZennSummaries().catch(console.error);