#!/usr/bin/env tsx
import { LocalLLMClient } from '@/lib/ai/local-llm';

async function testWithDifferentTokens() {
  console.error('🧪 Local LLM maxTokens検証テスト\n');
  
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

  const tokenConfigs = [
    { maxTokens: 300, label: '300トークン（現在のデフォルト）' },
    { maxTokens: 500, label: '500トークン' },
    { maxTokens: 800, label: '800トークン（推奨値）' },
    { maxTokens: 1000, label: '1000トークン' },
  ];

  for (const config of tokenConfigs) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`📊 テスト: ${config.label}`);
    console.error('='.repeat(60));
    
    const client = new LocalLLMClient({
      url: 'http://192.168.11.7:1234',
      model: 'openai/gpt-oss-20b',
      maxTokens: config.maxTokens,
      temperature: 0.3,
    });

    try {
      // 1. 要約のみ生成
      console.error('\n📝 要約生成テスト:');
      const startTime1 = Date.now();
      const summary = await client.generateSummary(testArticle.title, testArticle.content);
      const time1 = Date.now() - startTime1;
      
      console.error(`要約: ${summary}`);
      console.error(`文字数: ${summary.length}文字`);
      console.error(`処理時間: ${time1}ms`);
      
      // 要約が途切れているかチェック
      if (!summary.endsWith('。')) {
        console.error('⚠️  要約が途切れている可能性があります（句点で終わっていない）');
      }
      
      // 2. 要約とタグ生成
      console.error('\n🏷️  要約とタグ生成テスト:');
      const startTime2 = Date.now();
      const result = await client.generateSummaryWithTags(testArticle.title, testArticle.content);
      const time2 = Date.now() - startTime2;
      
      console.error(`要約: ${result.summary}`);
      console.error(`要約文字数: ${result.summary.length}文字`);
      console.error(`タグ: ${result.tags.join(', ')}`);
      console.error(`タグ数: ${result.tags.length}個`);
      console.error(`処理時間: ${time2}ms`);
      
      // 要約が途切れているかチェック
      if (!result.summary.endsWith('。')) {
        console.error('⚠️  要約が途切れている可能性があります（句点で終わっていない）');
      }
      
      if (result.tags.length === 0) {
        console.error('⚠️  タグが生成されていません');
      }
      
    } catch (error) {
      console.error('❌ エラー:', error);
    }
  }
  
  console.error('\n' + '='.repeat(60));
  console.error('📊 検証完了');
  console.error('='.repeat(60));
  console.error('\n推奨事項:');
  console.error('- 日本語の要約生成には最低500トークン、推奨800トークンが必要');
  console.error('- 要約+タグ生成には800-1000トークンが推奨');
  console.error('- 環境変数 LOCAL_LLM_MAX_TOKENS で調整可能にすることを推奨');
}

testWithDifferentTokens().catch(console.error);