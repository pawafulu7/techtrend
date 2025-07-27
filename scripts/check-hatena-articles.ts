import { prisma } from '../lib/database';

async function checkHatenaArticles() {
  console.log('はてなブックマークの記事をチェックしています...\n');
  
  // はてなブックマークのソースを取得
  const hatenaSource = await prisma.source.findFirst({
    where: { name: 'はてなブックマーク' }
  });
  
  if (!hatenaSource) {
    console.log('はてなブックマークのソースが見つかりません');
    return;
  }
  
  // 記事を取得（新しい順）
  const articles = await prisma.article.findMany({
    where: { sourceId: hatenaSource.id },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      url: true,
      publishedAt: true,
    }
  });
  
  console.log(`総記事数: ${articles.length}件\n`);
  console.log('記事一覧:');
  console.log('='.repeat(80));
  
  articles.forEach((article, index) => {
    console.log(`${index + 1}. ${article.title}`);
    console.log(`   URL: ${article.url}`);
    console.log(`   公開日: ${article.publishedAt.toLocaleString('ja-JP')}`);
    console.log('-'.repeat(80));
  });
}

checkHatenaArticles()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });