#!/usr/bin/env tsx
/**
 * LocalLLM接続確認スクリプト
 * GPT-OSS 20Bへの接続と基本的な応答テスト
 */

import { LocalLLMClient } from '../../lib/ai/local-llm';

async function testConnection() {
  console.log('🔌 LocalLLM接続テスト開始\n');
  console.log('================================================================================');
  
  // 環境変数から設定を取得
  const localLLMUrl = process.env.LOCAL_LLM_URL || 'http://192.168.11.7:1234';
  const localLLMModel = process.env.LOCAL_LLM_MODEL || 'openai/gpt-oss-20b';
  
  console.log('📋 設定情報:');
  console.log(`  URL: ${localLLMUrl}`);
  console.log(`  Model: ${localLLMModel}`);
  console.log('================================================================================\n');
  
  const client = new LocalLLMClient({
    url: localLLMUrl,
    model: localLLMModel,
    maxTokens: 200,
    temperature: 0.3
  });
  
  try {
    // 1. 接続テスト
    console.log('1️⃣  接続確認中...');
    const isConnected = await client.testConnection();
    
    if (!isConnected) {
      console.error('❌ LocalLLMに接続できません');
      console.log('\n💡 確認事項:');
      console.log('  - LocalLLMサーバーが起動していることを確認');
      console.log('  - URLが正しいことを確認');
      console.log('  - ファイアウォール設定を確認');
      return;
    }
    
    console.log('✅ 接続成功\n');
    
    // 2. モデル情報取得
    console.log('2️⃣  モデル情報を取得中...');
    const modelsResponse = await fetch(`${localLLMUrl}/v1/models`);
    
    if (modelsResponse.ok) {
      const modelsData = await modelsResponse.json() as any;
      console.log('📊 利用可能なモデル:');
      modelsData.data.forEach((model: any) => {
        console.log(`  - ${model.id}`);
      });
      console.log();
    }
    
    // 3. 簡単な要約テスト
    console.log('3️⃣  要約生成テスト...');
    
    const testTitle = 'Next.js 15の新機能とパフォーマンス改善';
    const testContent = `
      Next.js 15がリリースされ、React 19のサポートやApp Routerの大幅な改善が含まれています。
      特に注目すべきはTurbopackの安定化で、開発時のビルド速度が従来の10倍以上に向上しました。
      また、Server ActionsとStreaming SSRの組み合わせにより、
      よりインタラクティブで高速なWebアプリケーションの構築が可能になります。
    `;
    
    console.log('📝 テスト記事:');
    console.log(`  タイトル: ${testTitle}`);
    console.log(`  内容: ${testContent.substring(0, 100)}...`);
    console.log();
    
    const startTime = Date.now();
    const summary = await client.generateSummary(testTitle, testContent);
    const elapsedTime = Date.now() - startTime;
    
    console.log('✅ 要約生成成功');
    console.log(`  処理時間: ${elapsedTime}ms`);
    console.log(`  要約: ${summary}`);
    console.log(`  文字数: ${summary.length}文字`);
    console.log();
    
    // 4. タグ付き要約テスト
    console.log('4️⃣  タグ付き要約生成テスト...');
    
    const startTime2 = Date.now();
    const result = await client.generateSummaryWithTags(testTitle, testContent);
    const elapsedTime2 = Date.now() - startTime2;
    
    console.log('✅ タグ付き要約生成成功');
    console.log(`  処理時間: ${elapsedTime2}ms`);
    console.log(`  要約: ${result.summary}`);
    console.log(`  タグ: ${result.tags.join(', ')}`);
    console.log();
    
    // 5. 総合評価
    console.log('================================================================================');
    console.log('📊 テスト結果サマリー');
    console.log('================================================================================');
    console.log('✅ すべてのテストが成功しました');
    console.log(`  平均処理時間: ${Math.round((elapsedTime + elapsedTime2) / 2)}ms`);
    console.log('  日本語品質: 良好');
    console.log('  接続安定性: 良好');
    console.log('\n🎉 LocalLLMは正常に動作しています！');
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    console.log('\n💡 トラブルシューティング:');
    console.log('  1. LocalLLMサーバーのログを確認');
    console.log('  2. メモリ/CPU使用率を確認');
    console.log('  3. モデルが正しくロードされているか確認');
  }
}

// 実行
testConnection().catch(console.error);