import { prisma } from '../lib/database';
import { DevToFetcher } from '../lib/fetchers/devto';

async function testDevToFetcher() {
  console.log('Dev.to フェッチャーをテストします...\n');

  // Dev.toソースを取得
  const devtoSource = await prisma.source.findFirst({
    where: { name: 'Dev.to' }
  });

  if (!devtoSource) {
    console.error('Dev.toソースが見つかりません');
    return;
  }

  const fetcher = new DevToFetcher(devtoSource);
  
  try {
    console.log('記事を取得中...');
    const { articles, errors } = await fetcher.fetch();
    
    console.log(`\n取得結果:`);
    console.log(`- 記事数: ${articles.length}`);
    console.log(`- エラー数: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\nエラー:');
      errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.message}`);
      });
    }
    
    if (articles.length > 0) {
      console.log('\n最初の5件の記事:');
      articles.slice(0, 5).forEach((article, index) => {
        console.log(`\n${index + 1}. ${article.title}`);
        console.log(`   URL: ${article.url}`);
        console.log(`   タグ: ${article.tagNames?.join(', ')}`);
        console.log(`   公開日: ${article.publishedAt.toLocaleString('ja-JP')}`);
        if (article.bookmarks) {
          console.log(`   リアクション数: ${article.bookmarks}`);
        }
      });
    }
  } catch (error) {
    console.error('フェッチエラー:', error);
  }
}

testDevToFetcher()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });