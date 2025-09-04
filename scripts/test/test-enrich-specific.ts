#!/usr/bin/env tsx

import { MoneyForwardContentEnricher } from '../../lib/enrichers/moneyforward';

async function testEnrichSpecific() {
  console.error('🔍 特定記事のエンリッチメントテスト\n');
  
  const url = 'https://moneyforward-dev.jp/entry/2025/07/31/130000';
  const enricher = new MoneyForwardContentEnricher();
  
  try {
    console.error(`URL: ${url}`);
    console.error('エンリッチメント実行中...\n');
    
    const result = await enricher.enrich(url);
    
    if (result) {
      console.error('✅ エンリッチメント成功');
      console.error(`コンテンツ長: ${result.content?.length || 0}文字`);
      console.error(`サムネイル: ${result.thumbnail ? '✅' : '❌'}`);
      
      if (result.content) {
        console.error('\n📄 コンテンツプレビュー（最初の500文字）:');
        console.error(result.content.substring(0, 500));
      }
    } else {
      console.error('❌ エンリッチメント失敗');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

testEnrichSpecific();