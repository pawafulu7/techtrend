import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function reportNewArticles() {
  console.log('📊 Speaker Deck 新規記事取得レポート');
  console.log('=====================================\n');
  
  // 最新10件の記事を取得
  const latestArticles = await prisma.article.findMany({
    where: {
      source: { name: 'Speaker Deck' }
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      title: true,
      url: true,
      publishedAt: true,
      createdAt: true,
      thumbnail: true
    }
  });
  
  console.log('🆕 新規取得記事（作成日時順）:');
  console.log('--------------------------------');
  
  latestArticles.forEach((article, index) => {
    console.log(`\n${index + 1}. ${article.title}`);
    console.log(`   📅 公開日: ${new Date(article.publishedAt).toLocaleDateString('ja-JP')}`);
    console.log(`   🔗 URL: ${article.url}`);
    console.log(`   🖼️  サムネイル: ${article.thumbnail ? '有' : '無'}`);
  });
  
  // 統計情報
  const totalCount = await prisma.article.count({
    where: {
      source: { name: 'Speaker Deck' }
    }
  });
  
  const dateCount = await prisma.article.groupBy({
    by: ['publishedAt'],
    where: {
      source: { name: 'Speaker Deck' }
    },
    _count: true,
    orderBy: {
      publishedAt: 'desc'
    },
    take: 5
  });
  
  console.log('\n\n📈 統計情報:');
  console.log('-------------');
  console.log(`総記事数: ${totalCount}件`);
  console.log(`（前回: 97件 → 今回: ${totalCount}件）`);
  console.log(`増加数: ${totalCount - 97}件`);
  
  console.log('\n📅 最近の記事分布:');
  dateCount.forEach(item => {
    const date = new Date(item.publishedAt);
    console.log(`  ${date.toLocaleDateString('ja-JP')}: ${item._count}件`);
  });
  
  await prisma.$disconnect();
}

reportNewArticles().catch(console.error);