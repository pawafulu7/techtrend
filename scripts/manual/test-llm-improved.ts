#!/usr/bin/env tsx
import { LocalLLMClient } from '@/lib/ai/local-llm';

async function testImprovedLocalLLM() {
  console.log('🧪 改善されたLocal LLMのテスト\n');
  console.log('デフォルトのmaxTokens: 800（環境変数未設定の場合）\n');
  
  const testArticle = {
    title: 'Next.js 14の新機能: App RouterとServer Actionsの実装ガイド',
    content: `
Next.js 14では、App RouterとServer Actionsという画期的な新機能が導入されました。
これらの機能により、従来のページベースのルーティングから、より柔軟で高性能な
アプリケーション構築が可能になりました。

App Routerは、Reactのサーバーコンポーネントを活用し、クライアントサイドの
JavaScriptを削減しながら、より高速なページロードを実現します。
ディレクトリベースのルーティングにより、直感的なファイル構造でアプリケーションを
組織化できます。

Server Actionsは、フォーム送信やデータ変更を、クライアントサイドのJavaScriptなしで
直接サーバー上で処理できる新しい方法です。これにより、フォームの処理が
簡潔になり、プログレッシブエンハンスメントもサポートされます。

実装例として、ユーザー登録フォームを考えてみましょう。
従来のアプローチでは、フォーム送信時にクライアントサイドでバリデーションを行い、
APIルートにPOSTリクエストを送信していました。
Server Actionsを使用すると、この処理をサーバー側で直接実行できます。

パフォーマンスの観点から見ると、App Routerは初期ロード時間を最大30%削減し、
Server Actionsはフォーム処理のレイテンシを50%改善することが報告されています。
    `.trim()
  };

  const client = new LocalLLMClient({
    url: 'http://192.168.11.7:1234',
    model: 'openai/gpt-oss-20b',
    temperature: 0.3,
    // maxTokensは環境変数 LOCAL_LLM_MAX_TOKENS またはデフォルト800が使用される
  });

  console.log('=' * 60);
  console.log('📝 要約生成テスト（改善版）');
  console.log('=' * 60);
  
  try {
    const startTime1 = Date.now();
    const summary = await client.generateSummary(testArticle.title, testArticle.content);
    const time1 = Date.now() - startTime1;
    
    console.log(`\n要約: ${summary}`);
    console.log(`文字数: ${summary.length}文字`);
    console.log(`処理時間: ${time1}ms`);
    
    // 品質チェック
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(summary);
    const hasEnglishThinking = /need|chars|count|let's/i.test(summary);
    const endsWithPeriod = summary.endsWith('。');
    const lengthInRange = summary.length >= 60 && summary.length <= 100;
    
    console.log('\n📊 品質チェック:');
    console.log(`  ✅ 日本語で書かれている: ${hasJapanese ? 'OK' : 'NG'}`);
    console.log(`  ✅ 英語の思考過程が含まれない: ${!hasEnglishThinking ? 'OK' : 'NG'}`);
    console.log(`  ✅ 句点で終わる: ${endsWithPeriod ? 'OK' : 'NG'}`);
    console.log(`  ✅ 60-100文字の範囲内: ${lengthInRange ? 'OK (' + summary.length + '文字)' : 'NG (' + summary.length + '文字)'}`);
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }

  console.log('\n' + '=' * 60);
  console.log('🏷️ 要約とタグ生成テスト（改善版）');
  console.log('=' * 60);
  
  try {
    const startTime2 = Date.now();
    const result = await client.generateSummaryWithTags(testArticle.title, testArticle.content);
    const time2 = Date.now() - startTime2;
    
    console.log(`\n要約: ${result.summary}`);
    console.log(`要約文字数: ${result.summary.length}文字`);
    console.log(`タグ: ${result.tags.join(', ')}`);
    console.log(`タグ数: ${result.tags.length}個`);
    console.log(`処理時間: ${time2}ms`);
    
    // 品質チェック
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(result.summary);
    const hasEnglishThinking = /need|chars|count|let's|summary|tags/i.test(result.summary);
    const endsWithPeriod = result.summary.endsWith('。');
    const lengthInRange = result.summary.length >= 60 && result.summary.length <= 100;
    const hasValidTags = result.tags.length >= 3 && result.tags.length <= 5;
    
    console.log('\n📊 品質チェック:');
    console.log(`  ✅ 日本語で書かれている: ${hasJapanese ? 'OK' : 'NG'}`);
    console.log(`  ✅ 英語の思考過程が含まれない: ${!hasEnglishThinking ? 'OK' : 'NG'}`);
    console.log(`  ✅ 句点で終わる: ${endsWithPeriod ? 'OK' : 'NG'}`);
    console.log(`  ✅ 60-100文字の範囲内: ${lengthInRange ? 'OK (' + result.summary.length + '文字)' : 'NG (' + result.summary.length + '文字)'}`);
    console.log(`  ✅ タグが3-5個: ${hasValidTags ? 'OK (' + result.tags.length + '個)' : 'NG (' + result.tags.length + '個)'}`);
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }

  console.log('\n' + '=' * 60);
  console.log('📈 改善効果のまとめ');
  console.log('=' * 60);
  console.log('1. maxTokensを800に増加 → 要約が途切れない');
  console.log('2. プロンプト改善 → 思考過程の出力を抑制');
  console.log('3. 環境変数対応 → LOCAL_LLM_MAX_TOKENSで調整可能');
}

testImprovedLocalLLM().catch(console.error);