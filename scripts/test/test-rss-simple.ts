#!/usr/bin/env node

/**
 * 新規5社のRSSフィード単体テスト
 */

import RSSParser from 'rss-parser';

const parser = new RSSParser();

const testFeeds = [
  { name: 'ZOZO', url: 'https://techblog.zozo.com/rss' },
  { name: 'リクルート', url: 'https://techblog.recruit.co.jp/rss.xml' },
  { name: 'はてなDeveloper', url: 'https://developer.hatenastaff.com/feed' },
  { name: 'GMOペパボ', url: 'https://tech.pepabo.com/feed.rss' },
  { name: 'Sansan', url: 'https://buildersbox.corp-sansan.com/feed' }
];

async function testSingleFeed(company: string, url: string) {
  console.error(`\n[${company}] テスト開始`);
  try {
    const feed = await parser.parseURL(url);
    console.error(`✅ フィード取得成功`);
    console.error(`  - タイトル: ${feed.title}`);
    console.error(`  - 記事数: ${feed.items?.length || 0}件`);
    
    if (feed.items && feed.items.length > 0) {
      const firstItem = feed.items[0];
      console.error(`  - 最新記事: ${firstItem.title?.substring(0, 50)}...`);
      console.error(`  - URL: ${firstItem.link}`);
      console.error(`  - コンテンツ長: ${(firstItem.content || firstItem.contentSnippet || '').length}文字`);
    }
    
    return { company, success: true, count: feed.items?.length || 0 };
  } catch (error) {
    console.error(`❌ エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { company, success: false, count: 0 };
  }
}

async function testAllFeeds() {
  console.error('🔍 新規5社のRSSフィードテスト\n');
  console.error('─'.repeat(60));
  
  const results = [];
  
  for (const { name, url } of testFeeds) {
    const result = await testSingleFeed(name, url);
    results.push(result);
  }
  
  // サマリー表示
  console.error('\n' + '─'.repeat(60));
  console.error('\n📊 テスト結果サマリー:\n');
  console.error('企業名\t\t\tステータス\t記事数');
  console.error('─'.repeat(60));
  
  let successCount = 0;
  for (const result of results) {
    const status = result.success ? '✅ 成功' : '❌ 失敗';
    const padded = result.company.padEnd(20);
    console.error(`${padded}\t${status}\t\t${result.count}`);
    if (result.success) successCount++;
  }
  
  console.error('─'.repeat(60));
  console.error(`\n結果: ${successCount}/5 社のRSSフィードが有効です`);
}

// 実行
testAllFeeds().catch(console.error);