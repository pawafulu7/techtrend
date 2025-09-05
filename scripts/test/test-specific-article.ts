#!/usr/bin/env tsx
import { CorporateTechBlogFetcher } from '../lib/fetchers/corporate-tech-blog';

async function testSpecificArticle() {
  const fetcher = new CorporateTechBlogFetcher();
  
  // テスト対象の記事情報
  const testTitle = "SECCON Beginners CTF 2025 Writeup";
  const testUrl = "https://moneyforward-dev.jp/entry/2025/08/08/103559";
  
  // isEventArticle メソッドを直接呼び出す（private メソッドなので any でキャスト）
  const isEvent = (fetcher as any).isEventArticle(testTitle, testUrl);
  
  console.error("=== マネーフォワード記事フィルタリングテスト ===");
  console.error(`タイトル: ${testTitle}`);
  console.error(`URL: ${testUrl}`);
  console.error(`イベント記事として判定: ${isEvent ? 'YES（除外される）' : 'NO（除外されない）'}`);
  
  if (isEvent) {
    console.error("\n除外理由の分析:");
    
    // イベントキーワードチェック
    const eventKeywords = [
      '登壇', 'イベント', 'セミナー', '勉強会',
      'カンファレンス', 'meetup', '参加募集', '開催しました',
      '開催します', '参加者募集'
    ];
    
    const matchedKeywords = eventKeywords.filter(keyword => 
      testTitle.includes(keyword) || testTitle.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (matchedKeywords.length > 0) {
      console.error(`- イベントキーワードにマッチ: ${matchedKeywords.join(', ')}`);
    }
    
    // URLパターンチェック
    if (/\/(event|seminar|meetup|conference)/i.test(testUrl)) {
      console.error("- URLにイベント関連パスが含まれる");
    }
    
    // 日付パターンチェック
    const futureDatePattern = /20\d{2}\/\d{1,2}\/\d{1,2}/;
    if (futureDatePattern.test(testTitle)) {
      const match = testTitle.match(futureDatePattern);
      console.error(`- タイトルに日付パターンが含まれる: ${match?.[0]}`);
    }
    
    // タイトル内の「2025」チェック
    if (testTitle.includes('2025')) {
      console.error("- タイトルに「2025」が含まれる（年度表記として誤検知の可能性）");
    }
  }
}

testSpecificArticle().catch(console.error);