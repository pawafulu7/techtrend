import { ZennExtendedFetcher } from '../lib/fetchers/zenn-extended';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  try {
    const source = await prisma.source.findFirst({
      where: { name: 'Zenn' }
    });
    
    if (!source) {
      console.log('❌ Zennソースが見つかりません');
      return;
    }
    
    console.log('📋 Zennフェッチャーのテストを開始...');
    const fetcher = new ZennExtendedFetcher(source);
    const result = await fetcher.fetch();
    
    if (result.articles.length === 0) {
      console.log('⚠️ 記事が取得できませんでした');
      return;
    }
    
    console.log(`\n✅ ${result.articles.length}件の記事を取得`);
    
    // 最初の3件をチェック
    for (let i = 0; i < Math.min(3, result.articles.length); i++) {
      const article = result.articles[i];
      console.log(`\n記事 ${i + 1}:`);
      console.log(`  タイトル: ${article.title}`);
      console.log(`  URL: ${article.url}`);
      console.log(`  タグ: ${article.tagNames?.join(', ') || 'なし'}`);
      
      // articleタグのチェック
      const hasArticleTag = article.tagNames?.includes('article');
      console.log(`  articleタグ: ${hasArticleTag ? '❌ 含まれている' : '✅ 含まれていない'}`);
      
      // bookまたはscrapタグのチェック
      if (article.url.includes('/books/')) {
        const hasBookTag = article.tagNames?.includes('book');
        console.log(`  bookタグ: ${hasBookTag ? '✅ 正常に付与' : '❌ 付与されていない'}`);
      } else if (article.url.includes('/scraps/')) {
        const hasScrapTag = article.tagNames?.includes('scrap');
        console.log(`  scrapタグ: ${hasScrapTag ? '✅ 正常に付与' : '❌ 付与されていない'}`);
      }
    }
    
    // 全体のarticleタグチェック
    const articlesWithArticleTag = result.articles.filter(a => 
      a.tagNames?.includes('article')
    );
    
    console.log('\n=== テスト結果 ===');
    if (articlesWithArticleTag.length === 0) {
      console.log('✅ すべての記事でarticleタグが付与されていません（正常）');
    } else {
      console.log(`❌ ${articlesWithArticleTag.length}件の記事にarticleタグが付与されています`);
      articlesWithArticleTag.forEach(a => {
        console.log(`  - ${a.title}`);
      });
    }
    
  } catch (error) {
    console.error('❌ テスト中にエラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();