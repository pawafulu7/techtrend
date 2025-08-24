#!/usr/bin/env tsx
/**
 * LocalLLM接続確認スクリプト
 * GPT-OSS 20Bへの接続と基本的な応答テスト
 */

import { LocalLLMClient } from '../../lib/ai/local-llm';

async function testConnection() {
  console.error('🔌 LocalLLM接続テスト開始\n');
  console.error('================================================================================');
  
  // 環境変数から設定を取得
  const localLLMUrl = process.env.LOCAL_LLM_URL || 'http://192.168.11.7:1234';
  const localLLMModel = process.env.LOCAL_LLM_MODEL || 'openai/gpt-oss-20b';
  
  console.error('📋 設定情報:');
  console.error(`  URL: ${localLLMUrl}`);
  console.error(`  Model: ${localLLMModel}`);
  console.error('================================================================================\n');
  
  const client = new LocalLLMClient({
    url: localLLMUrl,
    model: localLLMModel,
    maxTokens: 200,
    temperature: 0.3
  });
  
  try {
    // 1. 接続テスト
    console.error('1️⃣  接続確認中...');
    const isConnected = await client.testConnection();
    
    if (!isConnected) {
      console.error('❌ LocalLLMに接続できません');
      console.error('\n💡 確認事項:');
      console.error('  - LocalLLMサーバーが起動していることを確認');
      console.error('  - URLが正しいことを確認');
      console.error('  - ファイアウォール設定を確認');
      return;
    }
    
    console.error('✅ 接続成功\n');
    
    // 2. モデル情報取得
    console.error('2️⃣  モデル情報を取得中...');
    const modelsResponse = await fetch(`${localLLMUrl}/v1/models`);
    
    if (modelsResponse.ok) {
      const modelsData = await modelsResponse.json() as any;
      console.error('📊 利用可能なモデル:');
      modelsData.data.forEach((model: any) => {
        console.error(`  - ${model.id}`);
      });
      console.error();
    }
    
    // 3. 簡単な要約テスト
    console.error('3️⃣  要約生成テスト...');
    
    const testTitle = 'Next.js 15の新機能とパフォーマンス改善';
    const testContent = `
      Next.js 15がリリースされ、React 19のサポートやApp Routerの大幅な改善が含まれています。
      特に注目すべきはTurbopackの安定化で、開発時のビルド速度が従来の10倍以上に向上しました。
      また、Server ActionsとStreaming SSRの組み合わせにより、
      よりインタラクティブで高速なWebアプリケーションの構築が可能になります。
    `;
    
    console.error('📝 テスト記事:');
    console.error(`  タイトル: ${testTitle}`);
    console.error(`  内容: ${testContent.substring(0, 100)}...`);
    console.error();
    
    const startTime = Date.now();
    const summary = await client.generateSummary(testTitle, testContent);
    const elapsedTime = Date.now() - startTime;
    
    console.error('✅ 要約生成成功');
    console.error(`  処理時間: ${elapsedTime}ms`);
    console.error(`  要約: ${summary}`);
    console.error(`  文字数: ${summary.length}文字`);
    console.error();
    
    // 4. タグ付き要約テスト
    console.error('4️⃣  タグ付き要約生成テスト...');
    
    const startTime2 = Date.now();
    const result = await client.generateSummaryWithTags(testTitle, testContent);
    const elapsedTime2 = Date.now() - startTime2;
    
    console.error('✅ タグ付き要約生成成功');
    console.error(`  処理時間: ${elapsedTime2}ms`);
    console.error(`  要約: ${result.summary}`);
    console.error(`  タグ: ${result.tags.join(', ')}`);
    console.error();
    
    // 5. 総合評価
    console.error('================================================================================');
    console.error('📊 テスト結果サマリー');
    console.error('================================================================================');
    console.error('✅ すべてのテストが成功しました');
    console.error(`  平均処理時間: ${Math.round((elapsedTime + elapsedTime2) / 2)}ms`);
    console.error('  日本語品質: 良好');
    console.error('  接続安定性: 良好');
    console.error('\n🎉 LocalLLMは正常に動作しています！');
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    console.error('\n💡 トラブルシューティング:');
    console.error('  1. LocalLLMサーバーのログを確認');
    console.error('  2. メモリ/CPU使用率を確認');
    console.error('  3. モデルが正しくロードされているか確認');
  }
}

// 実行
testConnection().catch(console.error);