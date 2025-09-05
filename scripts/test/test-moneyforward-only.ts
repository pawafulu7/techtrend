#!/usr/bin/env tsx
import Parser from 'rss-parser';

async function testMoneyForwardOnly() {
  const parser = new Parser();
  
  console.error("=== マネーフォワード記事取得テスト（改善版） ===");
  console.error(`環境変数 EXCLUDE_EVENT_ARTICLES: ${process.env.EXCLUDE_EVENT_ARTICLES || 'false'}`);
  console.error("");
  
  try {
    const feed = await parser.parseURL('https://moneyforward-dev.jp/feed');
    
    console.error(`RSSフィードから${feed.items?.length || 0}件の記事を取得`);
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    let processedCount = 0;
    let skippedNonJapanese = 0;
    let skippedOld = 0;
    let skippedEvent = 0;
    const articles: any[] = [];
    
    for (const item of feed.items || []) {
      if (!item.title || !item.link) continue;
      
      // 日付チェック
      const publishedAt = item.isoDate ? new Date(item.isoDate) :
                         item.pubDate ? new Date(item.pubDate) : new Date();
      
      if (publishedAt < thirtyDaysAgo) {
        skippedOld++;
        continue;
      }
      
      // 日本語チェック（改善版）
      const textToCheck = item.description || item.content || 
                         item.summary || item.contentSnippet || '';
      const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
      const hasJapanese = japanesePattern.test(item.title) || 
                         japanesePattern.test(textToCheck);
      
      if (!hasJapanese) {
        console.error(`非日本語記事をスキップ: ${item.title}`);
        skippedNonJapanese++;
        continue;
      }
      
      // イベント記事チェック（環境変数で制御）
      const excludeEvents = process.env.EXCLUDE_EVENT_ARTICLES === 'true';
      if (excludeEvents) {
        const eventKeywords = [
          '登壇', 'イベント', 'セミナー', '勉強会',
          'カンファレンス', 'meetup', '参加募集', '開催しました',
          '開催します', '参加者募集'
        ];
        const excludeExceptions = ['振り返り', 'レポート', '技術解説', 'まとめ'];
        
        const hasException = excludeExceptions.some(exception => 
          item.title.includes(exception)
        );
        
        if (!hasException) {
          const hasEventKeyword = eventKeywords.some(keyword => 
            item.title.includes(keyword) || item.title.toLowerCase().includes(keyword.toLowerCase())
          );
          
          if (hasEventKeyword) {
            console.error(`イベント記事を除外: ${item.title}`);
            skippedEvent++;
            continue;
          }
        }
      }
      
      processedCount++;
      articles.push({
        title: item.title,
        url: item.link,
        publishedAt: publishedAt.toISOString(),
        hasDescription: !!item.description,
        hasContent: !!item.content,
        hasSummary: !!item.summary
      });
    }
    
    console.error("\n=== 処理結果サマリー ===");
    console.error(`処理された記事: ${processedCount}件`);
    console.error(`スキップ（30日より古い）: ${skippedOld}件`);
    console.error(`スキップ（非日本語）: ${skippedNonJapanese}件`);
    console.error(`スキップ（イベント記事）: ${skippedEvent}件`);
    
    console.error("\n=== 取得された記事一覧 ===");
    articles.forEach((article, index) => {
      console.error(`[${index + 1}] ${article.title}`);
      console.error(`    URL: ${article.url}`);
      console.error(`    公開日: ${article.publishedAt}`);
      console.error(`    フィールド: description=${article.hasDescription}, content=${article.hasContent}, summary=${article.hasSummary}`);
      
      // SECCON記事の特別確認
      if (article.title.includes('SECCON')) {
        console.error(`    ✅ SECCON記事が正常に取得されました！`);
      }
    });
    
    // SECCON記事が含まれているか最終確認
    const hasSecconArticle = articles.some(a => a.title.includes('SECCON'));
    if (!hasSecconArticle) {
      console.error("\n⚠️ SECCON記事が取得されませんでした");
      
      // RSSフィードにSECCON記事が存在するか確認
      const secconInFeed = feed.items?.some(item => item.title?.includes('SECCON'));
      if (secconInFeed) {
        console.error("RSSフィードにはSECCON記事が存在しますが、フィルタリングされました");
      }
    }
    
  } catch (error) {
    console.error("エラー:", error);
  }
}

testMoneyForwardOnly().catch(console.error);