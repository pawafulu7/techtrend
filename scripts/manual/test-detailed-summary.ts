#!/usr/bin/env tsx
import { AIService } from '@/lib/ai/ai-service';

async function testDetailedSummary() {
  console.log('🧪 詳細要約生成テスト\n');
  console.log('='.repeat(60));
  
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

以下は、Server Actionsを使用したフォーム処理の例です：

\`\`\`typescript
async function createUser(formData: FormData) {
  'use server';
  
  const name = formData.get('name');
  const email = formData.get('email');
  
  // バリデーション
  if (!name || !email) {
    throw new Error('名前とメールアドレスは必須です');
  }
  
  // データベースに保存
  await db.user.create({
    data: { name, email }
  });
  
  // リダイレクト
  redirect('/success');
}
\`\`\`

パフォーマンスの観点から見ると、App Routerは初期ロード時間を最大30%削減し、
Server Actionsはフォーム処理のレイテンシを50%改善することが報告されています。

また、App Routerでは、以下のような最適化が自動的に行われます：
- 自動的なコード分割
- プリフェッチングの最適化
- 部分的な再レンダリング
- ストリーミングSSR

実装時の注意点として、以下を考慮する必要があります：
- Node.js 18.17以上が必要
- Edge Runtimeとの互換性
- 既存のpages/ディレクトリとの共存
- クライアントコンポーネントとサーバーコンポーネントの使い分け
    `.trim()
  };

  try {
    // AIサービスのインスタンスを作成
    const aiService = AIService.fromEnv();
    
    console.log('📝 詳細要約を生成中...\n');
    const startTime = Date.now();
    
    // 詳細要約を生成
    const result = await aiService.generateDetailedSummary(
      testArticle.title,
      testArticle.content
    );
    
    const duration = Date.now() - startTime;
    
    console.log('✅ 生成完了\n');
    console.log('-'.repeat(60));
    
    // 結果の表示
    console.log('【要約】');
    console.log(result.summary);
    console.log(`文字数: ${result.summary.length}文字`);
    console.log();
    
    console.log('【詳細要約】');
    console.log(result.detailedSummary);
    console.log();
    
    console.log('【タグ】');
    console.log(result.tags.join(', '));
    console.log();
    
    console.log('-'.repeat(60));
    console.log('【品質チェック】\n');
    
    // 詳細要約の項目数をチェック
    const bulletPoints = result.detailedSummary.split('\n').filter(line => line.trim().startsWith('・'));
    console.log(`✓ 項目数: ${bulletPoints.length}個 ${bulletPoints.length === 6 ? '✅' : '⚠️'}`);
    
    // 必須キーワードのチェック
    const requiredKeywords = [
      '記事の主題',
      '具体的な問題',
      '提示されている解決策',
      '実装方法',
      '期待される効果',
      '実装時の注意点'
    ];
    
    console.log('\n項目別チェック:');
    requiredKeywords.forEach((keyword, index) => {
      const hasKeyword = bulletPoints[index]?.includes(keyword) || false;
      console.log(`  ${index + 1}. 「${keyword}」: ${hasKeyword ? '✅' : '❌'}`);
      if (bulletPoints[index]) {
        const content = bulletPoints[index].split('、')[1] || '';
        console.log(`     内容文字数: ${content.length}文字`);
      }
    });
    
    // 要約の品質チェック
    console.log('\n要約の品質:');
    console.log(`  文字数範囲（60-80文字）: ${result.summary.length >= 60 && result.summary.length <= 80 ? '✅' : '❌'}`);
    console.log(`  句点で終了: ${result.summary.endsWith('。') ? '✅' : '❌'}`);
    
    // タグのチェック
    console.log('\nタグの品質:');
    console.log(`  タグ数（3-5個）: ${result.tags.length >= 3 && result.tags.length <= 5 ? '✅' : '❌'}`);
    
    console.log('\n-'.repeat(60));
    console.log(`処理時間: ${duration}ms`);
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('テスト完了');
}

// テスト実行
testDetailedSummary().catch(console.error);