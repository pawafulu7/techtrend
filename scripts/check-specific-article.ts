import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSpecificArticle() {
  const article = await prisma.article.findUnique({
    where: { id: 'cmdq3ya7k004fte56t7uf4mki' },
    select: {
      id: true,
      title: true,
      summary: true,
      detailedSummary: true,
      updatedAt: true
    }
  });
  
  if (!article) {
    console.log('記事が見つかりません');
    return;
  }
  
  console.log('記事の詳細:');
  console.log('ID:', article.id);
  console.log('Title:', article.title);
  console.log('Summary:', article.summary?.substring(0, 100));
  console.log('DetailedSummary先頭:', article.detailedSummary?.substring(0, 200));
  console.log('更新日時:', article.updatedAt);
  
  // 問題の確認
  if (article.detailedSummary?.startsWith('、')) {
    console.log('\n❌ 問題: detailedSummaryが「、」で始まっています');
  }
  
  await prisma.$disconnect();
}

// 直接実行された場合
if (require.main === module) {
  checkSpecificArticle()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}