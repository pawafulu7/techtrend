#!/usr/bin/env -S npx tsx

import { MoneyForwardContentEnricher } from '../../lib/enrichers/moneyforward';

async function testEnrichSpecific() {
  console.log('🔍 特定記事のエンリッチメントテスト\n');
  
  const url = 'https://moneyforward-dev.jp/entry/2025/07/31/130000';
  const enricher = new MoneyForwardContentEnricher();
  
  try {
    console.log(`URL: ${url}`);
    console.log('エンリッチメント実行中...\n');
    
    const result = await enricher.enrich(url);
    
    if (result) {
      console.log('✅ エンリッチメント成功');
      console.log(`コンテンツ長: ${result.content?.length || 0}文字`);
      console.log(`サムネイル: ${result.thumbnail ? '✅' : '❌'}`);
      
      if (result.content) {
        console.log('\n📄 コンテンツプレビュー（最初の500文字）:');
        console.log(result.content.substring(0, 500));
      }
      return true;
    } else {
      console.error('❌ エンリッチメント失敗');
      return false;
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
    return false;
  }
}

testEnrichSpecific()
  .then((success) => process.exit(success ? 0 : 1))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });