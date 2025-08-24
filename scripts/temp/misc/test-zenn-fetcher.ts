import { ZennExtendedFetcher } from '../../lib/fetchers/zenn-extended';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  try {
    const source = await prisma.source.findFirst({
      where: { name: 'Zenn' }
    });
    
    if (!source) {
      console.error('❌ Zennソースが見つかりません');
      return;
    }
    
    console.error('📋 Zennフェッチャーのテストを開始...');
    const fetcher = new ZennExtendedFetcher(source);
    const result = await fetcher.fetch();
    
    if (result.articles.length === 0) {
      console.error('⚠️ 記事が取得できませんでした');
      return;
    }
    
    console.error(`\n✅ ${result.articles.length}件の記事を取得`);
    
    // 最初の3件をチェック
    for (let i = 0; i < Math.min(3, result.articles.length); i++) {
      const article = result.articles[i];
      console.error(`\n記事 ${i + 1}:`);
      console.error(`  タイトル: ${article.title}`);
      console.error(`  URL: ${article.url}`);
      console.error(`  タグ: ${article.tagNames?.join(', ') || 'なし'}`);
      
      // articleタグのチェック
      const hasArticleTag = article.tagNames?.includes('article');
      console.error(`  articleタグ: ${hasArticleTag ? '❌ 含まれている' : '✅ 含まれていない'}`);
      
      // bookまたはscrapタグのチェック
      if (article.url.includes('/books/')) {
        const hasBookTag = article.tagNames?.includes('book');
        console.error(`  bookタグ: ${hasBookTag ? '✅ 正常に付与' : '❌ 付与されていない'}`);
      } else if (article.url.includes('/scraps/')) {
        const hasScrapTag = article.tagNames?.includes('scrap');
        console.error(`  scrapタグ: ${hasScrapTag ? '✅ 正常に付与' : '❌ 付与されていない'}`);
      }
    }
    
    // 全体のarticleタグチェック
    const articlesWithArticleTag = result.articles.filter(a => 
      a.tagNames?.includes('article')
    );
    
    console.error('\n=== テスト結果 ===');
    if (articlesWithArticleTag.length === 0) {
      console.error('✅ すべての記事でarticleタグが付与されていません（正常）');
    } else {
      console.error(`❌ ${articlesWithArticleTag.length}件の記事にarticleタグが付与されています`);
      articlesWithArticleTag.forEach(a => {
        console.error(`  - ${a.title}`);
      });
    }
    
  } catch (error) {
    console.error('❌ テスト中にエラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();