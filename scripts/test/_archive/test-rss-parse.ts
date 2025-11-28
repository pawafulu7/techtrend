#!/usr/bin/env tsx
import Parser from 'rss-parser';

async function testRSSParse() {
  const parser = new Parser();
  
  console.error("=== マネーフォワードRSSフィード解析テスト ===");
  
  try {
    const feed = await parser.parseURL('https://moneyforward-dev.jp/feed');
    
    // SECCON記事を探す
    const secconArticle = feed.items?.find(item => 
      item.title?.includes('SECCON')
    );
    
    if (secconArticle) {
      console.error("\nSECCON記事の詳細:");
      console.error("----------------------------------------");
      console.error(`タイトル: ${secconArticle.title}`);
      console.error(`リンク: ${secconArticle.link}`);
      console.error(`公開日: ${secconArticle.pubDate}`);
      console.error(`\ndescriptionフィールド:`);
      console.error(`- 存在: ${secconArticle.description !== undefined}`);
      console.error(`- 型: ${typeof secconArticle.description}`);
      console.error(`- 長さ: ${secconArticle.description?.length || 0} 文字`);
      
      if (secconArticle.description) {
        console.error(`- 最初の100文字: "${secconArticle.description.substring(0, 100)}..."`);
        
        // 日本語チェック
        const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
        const hasJapanese = japanesePattern.test(secconArticle.description);
        console.error(`- 日本語を含む: ${hasJapanese}`);
        
        if (!hasJapanese) {
          console.error("\n⚠️ descriptionに日本語が含まれていません！");
        }
      } else {
        console.error("\n⚠️ descriptionフィールドが空です！");
      }
      
      console.error(`\ncontentフィールド:`);
      console.error(`- 存在: ${secconArticle.content !== undefined}`);
      console.error(`- 型: ${typeof secconArticle.content}`);
      console.error(`- 長さ: ${secconArticle.content?.length || 0} 文字`);
      
      const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
      
      if (secconArticle.content) {
        console.error(`- 最初の100文字: "${secconArticle.content.substring(0, 100)}..."`);
        
        const hasJapanese = japanesePattern.test(secconArticle.content);
        console.error(`- 日本語を含む: ${hasJapanese}`);
      }
      
      console.error(`\nsummaryフィールド:`);
      console.error(`- 存在: ${(secconArticle as any).summary !== undefined}`);
      if ((secconArticle as any).summary) {
        const summary = (secconArticle as any).summary;
        console.error(`- 型: ${typeof summary}`);
        console.error(`- 長さ: ${summary.length || 0} 文字`);
        console.error(`- 最初の100文字: "${summary.substring(0, 100)}..."`);
        
        const hasJapanese = japanesePattern.test(summary);
        console.error(`- 日本語を含む: ${hasJapanese}`);
      }
      
      console.error("\n全フィールド一覧:");
      console.error(Object.keys(secconArticle));
      
    } else {
      console.error("\n❌ SECCON記事がRSSフィードに見つかりません");
    }
    
  } catch (error) {
    console.error("エラー:", error);
  }
}

testRSSParse().catch(console.error);