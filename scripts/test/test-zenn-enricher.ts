#!/usr/bin/env npx tsx
/**
 * Zennエンリッチャーの動作テスト
 */

import { ZennContentEnricher } from '../../lib/enrichers/zenn';

async function testZennEnricher() {
  console.error('========================================');
  console.error('Zennエンリッチャー動作テスト');
  console.error('========================================\n');

  const enricher = new ZennContentEnricher();

  // テスト対象のURL（問題のある記事）
  const testUrls = [
    'https://zenn.dev/fd2025/articles/df54a4428bc47c',
    'https://zenn.dev/nomhiro/articles/mindmap-node-click-nextjs',
    'https://zenn.dev/mabo23/articles/b2c17fefee90dc',
  ];

  for (const url of testUrls) {
    console.error(`\nテストURL: ${url}`);
    console.error('----------------------------------------');

    try {
      const result = await enricher.enrich(url);
      
      if (result && result.content) {
        console.error(`✅ 成功: ${result.content.length}文字取得`);
        console.error(`   最初の300文字: ${result.content.substring(0, 300)}...`);
        if (result.thumbnail) {
          console.error(`   サムネイル: ${result.thumbnail}`);
        }
      } else {
        console.error('❌ コンテンツ取得失敗');
      }
    } catch (error) {
      console.error(`❌ エラー: ${error}`);
    }

    // Rate limit対策
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// 実行
testZennEnricher();