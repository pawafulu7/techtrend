#!/usr/bin/env tsx

import Parser from 'rss-parser';

async function testMoneyForwardRSS() {
  const parser = new Parser();
  
  try {
    console.error('🔍 マネーフォワードのRSSフィードをテスト中...\n');
    
    const feed = await parser.parseURL('https://moneyforward-dev.jp/feed');
    
    console.error('✅ RSS取得成功');
    console.error('タイトル:', feed.title);
    console.error('説明:', feed.description);
    console.error('記事数:', feed.items.length);
    console.error('');
    
    if (feed.items.length > 0) {
      console.error('📄 最新記事サンプル:');
      for (let i = 0; i < Math.min(3, feed.items.length); i++) {
        const item = feed.items[i];
        console.error(`\n${i + 1}. ${item.title}`);
        console.error(`   URL: ${item.link}`);
        console.error(`   日付: ${item.pubDate || item.isoDate}`);
        console.error(`   コンテンツ長: ${(item.content || item.contentSnippet || item.description || '').length}文字`);
        
        // 日本語チェック
        const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(item.title || '');
        console.error(`   日本語記事: ${hasJapanese ? '✅' : '❌'}`);
      }
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

testMoneyForwardRSS();