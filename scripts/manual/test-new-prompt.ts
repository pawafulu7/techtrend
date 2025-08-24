#!/usr/bin/env tsx
import fetch from 'node-fetch';

async function testNewPrompt() {
  console.error('🧪 新しいシステムプロンプト設定のテスト\n');
  console.error('前提: LLMサーバー側に以下のシステムプロンプトが設定されていることを想定\n');
  console.error('=' * 60);
  
  const url = 'http://192.168.11.7:1234';
  const model = 'openai/gpt-oss-20b';
  
  const testArticle = {
    title: 'GraphQLとRESTの使い分け: マイクロサービス環境での最適な選択',
    content: `
近年、API設計においてGraphQLとRESTという2つの主要なアプローチが存在します。
本記事では、マイクロサービス環境において、どのような場面でGraphQLを選択し、
どのような場面でRESTを選択すべきかを実践的な観点から解説します。

## GraphQLの利点

GraphQLは、クライアントが必要なデータを正確に指定できるクエリ言語です。
単一のエンドポイントから複数のリソースを効率的に取得でき、
オーバーフェッチングやアンダーフェッチングの問題を解決します。

特にモバイルアプリケーションやSPAでは、ネットワーク往復回数を削減できるため、
パフォーマンスの向上が期待できます。また、型システムによる
自己文書化機能により、開発効率も向上します。

## RESTの利点

RESTは、HTTPの標準的なメソッドとステータスコードを活用した
シンプルで直感的なAPI設計手法です。キャッシュの実装が容易で、
CDNとの親和性も高く、大規模なトラフィックに対応しやすいという特徴があります。

また、ツールやライブラリのエコシステムが成熟しており、
開発者の学習コストも比較的低いという利点があります。

## マイクロサービス環境での使い分け

### GraphQLが適している場面

1. **BFF（Backend for Frontend）パターン**
   複数のマイクロサービスからデータを集約して、
   フロントエンド向けに最適化されたAPIを提供する場合

2. **複雑なデータ関係**
   関連する複数のエンティティを一度に取得する必要がある場合

3. **モバイルファースト**
   帯域幅が限られた環境で、必要最小限のデータのみを取得したい場合

### RESTが適している場面

1. **公開API**
   外部開発者向けのAPIで、シンプルで理解しやすいインターフェースが必要な場合

2. **ファイルアップロード/ダウンロード**
   バイナリデータの処理や大容量ファイルの転送が必要な場合

3. **マイクロサービス間通信**
   サービス間の内部通信で、キャッシュやHTTPセマンティクスを活用したい場合

## ハイブリッドアプローチ

実際のプロジェクトでは、GraphQLとRESTを組み合わせたハイブリッドアプローチが
効果的な場合があります。例えば、メインのAPIはGraphQLで構築し、
ファイルアップロードや認証などの特定の機能はRESTで実装するという方法です。

## パフォーマンス比較

実際の測定結果では：
- GraphQL: 複数リソース取得時、ネットワーク往復を70%削減
- REST: 単一リソース取得時、レスポンス時間が20%高速
- キャッシュ効率: RESTが40%優れている

## まとめ

GraphQLとRESTの選択は、プロジェクトの要件、チームのスキルセット、
既存のインフラストラクチャなど、多くの要因を考慮して決定すべきです。
重要なのは、それぞれの特性を理解し、適切な場面で適切な技術を選択することです。
    `.trim()
  };

  // テストケース1: 要約とタグ生成
  console.error('📝 テスト1: 要約とタグ生成（標準形式）');
  console.error('-'.repeat(60));
  
  try {
    const prompt1 = `以下の技術記事を分析してください。

タイトル: ${testArticle.title}
内容: ${testArticle.content.substring(0, 2000)}

出力形式:
要約: [60-80文字の日本語で簡潔にまとめる]
タグ: [3-5個、カンマ区切り]`;

    const response1 = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt1 }],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (response1.ok) {
      const data = await response1.json() as any;
      const output = data.choices?.[0]?.message?.content || '';
      
      console.error('出力:');
      console.error(output);
      
      // 品質チェック
      const lines = output.split('\n');
      const summaryLine = lines.find((l: string) => l.startsWith('要約:'));
      const tagsLine = lines.find((l: string) => l.startsWith('タグ:'));
      
      if (summaryLine) {
        const summary = summaryLine.replace('要約:', '').trim();
        console.error('\n✅ 要約チェック:');
        console.error(`  文字数: ${summary.length}文字 ${summary.length >= 60 && summary.length <= 80 ? '✅' : '❌'}`);
        console.error(`  句点終了: ${summary.endsWith('。') ? '✅' : '❌'}`);
        console.error(`  英語混入なし: ${!/need|let's|count/i.test(summary) ? '✅' : '❌'}`);
      }
      
      if (tagsLine) {
        const tags = tagsLine.replace('タグ:', '').trim().split(/[,、]/);
        console.error('\n✅ タグチェック:');
        console.error(`  タグ数: ${tags.length}個 ${tags.length >= 3 && tags.length <= 5 ? '✅' : '❌'}`);
        console.error(`  タグ: ${tags.map(t => t.trim()).join(', ')}`);
      }
    }
  } catch (error) {
    console.error('❌ エラー:', error);
  }

  // 少し待機
  await new Promise(resolve => setTimeout(resolve, 2000));

  // テストケース2: 詳細要約生成
  console.error('\n\n📝 テスト2: 詳細要約生成（箇条書き形式）');
  console.error('-'.repeat(60));
  
  try {
    const prompt2 = `以下の技術記事を詳細に分析してください。

タイトル: ${testArticle.title}
内容: ${testArticle.content}

以下の形式で箇条書きで出力してください：
・記事の主題は、[内容]
・解決しようとしている問題は、[内容]
・提示されている解決策は、[内容]
・実装方法の詳細については、[内容]
・期待される効果は、[内容]
・実装時の注意点は、[内容]

各項目は50-150文字で記述してください。`;

    const response2 = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt2 }],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (response2.ok) {
      const data = await response2.json() as any;
      const output = data.choices?.[0]?.message?.content || '';
      
      console.error('出力:');
      console.error(output);
      
      // 品質チェック
      const bulletPoints = output.split('\n').filter(line => line.trim().startsWith('・'));
      
      console.error('\n✅ 詳細要約チェック:');
      console.error(`  項目数: ${bulletPoints.length}個 ${bulletPoints.length === 6 ? '✅' : '⚠️'}`);
      
      const requiredKeywords = [
        '記事の主題',
        '解決しようとしている問題',
        '提示されている解決策',
        '実装方法',
        '期待される効果',
        '実装時の注意点'
      ];
      
      requiredKeywords.forEach(keyword => {
        const hasKeyword = bulletPoints.some(line => line.includes(keyword));
        console.error(`  「${keyword}」: ${hasKeyword ? '✅' : '❌'}`);
      });
      
      // 英語の混入チェック
      const hasEnglishThinking = /need|let's|count|craft/i.test(output);
      console.error(`  英語思考過程なし: ${!hasEnglishThinking ? '✅' : '❌'}`);
    }
  } catch (error) {
    console.error('❌ エラー:', error);
  }

  console.error('\n' + '=' * 60);
  console.error('📊 テスト完了');
  console.error('=' * 60);
  console.error('\n推奨事項:');
  console.error('1. システムプロンプトが正しく設定されているか確認');
  console.error('2. 英語の思考過程が出力される場合は、プロンプトを強化');
  console.error('3. 項目が不足する場合は、max_tokensを増やす');
  console.error('4. 形式が崩れる場合は、temperatureを下げる（0.2-0.3推奨）');
}

testNewPrompt().catch(console.error);