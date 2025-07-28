import Parser from 'rss-parser';

async function debugQiitaFeed() {
  console.log('📝 Qiita PopularのRSSフィードを解析します...');
  
  const parser = new Parser();
  const feedUrl = 'https://qiita.com/popular-items/feed';
  
  try {
    const feed = await parser.parseURL(feedUrl);
    
    console.log(`\n📄 フィード情報:`);
    console.log(`タイトル: ${feed.title}`);
    console.log(`記事数: ${feed.items?.length || 0}件`);
    
    if (feed.items && feed.items.length > 0) {
      console.log(`\n📊 最初の3記事のカテゴリ情報:`);
      
      feed.items.slice(0, 3).forEach((item, index) => {
        console.log(`\n記事${index + 1}: ${item.title}`);
        console.log(`カテゴリ数: ${item.categories?.length || 0}`);
        if (item.categories && item.categories.length > 0) {
          console.log(`カテゴリ: ${item.categories.join(', ')}`);
        } else {
          console.log(`カテゴリ: なし`);
        }
      });
      
      // 全記事のカテゴリ統計
      const articlesWithCategories = feed.items.filter(item => item.categories && item.categories.length > 0);
      console.log(`\n📈 カテゴリ統計:`);
      console.log(`カテゴリがある記事: ${articlesWithCategories.length}/${feed.items.length}件 (${((articlesWithCategories.length / feed.items.length) * 100).toFixed(1)}%)`);
    }
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  }
}

debugQiitaFeed().catch(console.error);