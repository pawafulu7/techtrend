#!/usr/bin/env tsx
import { CorporateTechBlogFetcher } from '../lib/fetchers/corporate-tech-blog';

async function testJapaneseCheck() {
  const fetcher = new CorporateTechBlogFetcher();
  
  // SECCON記事のデータ（RSSフィードから取得した内容）
  const testTitle = "SECCON Beginners CTF 2025 Writeup";
  const testDescription = "株式会社マネーフォワード ビジネスカンパニー ERP開発本部の関西開発部に所属しているnanriです. 弊社有志でCTFに参加しました. この記事は僕が解いた問題のWriteup(問題の解き方をまとめたもの)になります. What is SECCON Beginners CTF? What is CTF? CTFについては関西開発部のインタビューより以下のとおりです. CTF（Capture The Flag:旗取り合戦）は、情報セキュリティのスキルを競い合うセキュリティコンテストです。 参加者は与えられた課題の中から隠された「FLAG」と呼ばれる文字列を見つけ出し、得点を競います。 また、さ…";
  
  // containsJapanese メソッドを直接呼び出す
  const containsJapanese = (fetcher as any).containsJapanese;
  
  console.error("=== 日本語判定テスト ===");
  console.error(`タイトル: "${testTitle}"`);
  console.error(`タイトルに日本語を含む: ${containsJapanese(testTitle)}`);
  console.error("");
  console.error(`説明文: "${testDescription.substring(0, 100)}..."`);
  console.error(`説明文に日本語を含む: ${containsJapanese(testDescription)}`);
  console.error("");
  
  // 複合判定（実際のfetchメソッドの判定ロジック）
  const hasJapanese = containsJapanese(testTitle) || containsJapanese(testDescription);
  console.error(`総合判定（タイトル OR 説明文）: ${hasJapanese}`);
  
  if (!hasJapanese) {
    console.error("\n❌ この記事は非日本語記事として除外されます");
    console.error("\n原因分析:");
    console.error("- タイトルが英数字のみで構成されている");
    console.error("- 説明文に日本語が含まれていない可能性");
    
    // 詳細分析
    const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g;
    const matches = testDescription.match(japanesePattern);
    if (matches) {
      console.error(`\n説明文中の日本語文字（最初の10文字）: ${matches.slice(0, 10).join('')}`);
    } else {
      console.error("\n説明文に日本語文字が検出されませんでした");
    }
  } else {
    console.error("\n✅ この記事は日本語記事として処理されます");
  }
}

testJapaneseCheck().catch(console.error);