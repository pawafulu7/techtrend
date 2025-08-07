#!/usr/bin/env tsx
import { AIService } from '@/lib/ai/ai-service';

async function testCleanLabels() {
  console.log('🧪 ラベル削除テスト\n');
  console.log('='.repeat(60));
  
  const testArticle = {
    title: 'GraphQLとRESTの使い分け: マイクロサービス環境での最適な選択',
    content: `
近年、API設計においてGraphQLとRESTという2つの主要なアプローチが存在します。
本記事では、マイクロサービス環境において、どのような場面でGraphQLを選択し、
どのような場面でRESTを選択すべきかを実践的な観点から解説します。

GraphQLは、クライアントが必要なデータを正確に指定できるクエリ言語です。
単一のエンドポイントから複数のリソースを効率的に取得でき、
オーバーフェッチングやアンダーフェッチングの問題を解決します。

RESTは、HTTPの標準的なメソッドとステータスコードを活用した
シンプルで直感的なAPI設計手法です。キャッシュの実装が容易で、
CDNとの親和性も高く、大規模なトラフィックに対応しやすいという特徴があります。

実際のプロジェクトでは、GraphQLとRESTを組み合わせたハイブリッドアプローチが
効果的な場合があります。例えば、メインのAPIはGraphQLで構築し、
ファイルアップロードや認証などの特定の機能はRESTで実装するという方法です。

パフォーマンス比較では、GraphQLは複数リソース取得時にネットワーク往復を70%削減し、
RESTは単一リソース取得時にレスポンス時間が20%高速という結果が出ています。
    `.trim()
  };

  try {
    const aiService = AIService.fromEnv();
    
    console.log('📝 詳細要約を生成中（ラベルなし）...\n');
    const startTime = Date.now();
    
    const result = await aiService.generateDetailedSummary(
      testArticle.title,
      testArticle.content
    );
    
    const duration = Date.now() - startTime;
    
    console.log('✅ 生成完了\n');
    console.log('【詳細要約】');
    console.log(result.detailedSummary);
    console.log();
    
    // ラベルが削除されているかチェック
    const bulletPoints = result.detailedSummary.split('\n').filter(line => line.trim().startsWith('・'));
    
    console.log('【品質チェック】');
    console.log(`項目数: ${bulletPoints.length}個 ${bulletPoints.length === 6 ? '✅' : '⚠️'}`);
    console.log();
    
    // 不要なラベルが含まれていないかチェック
    const unwantedLabels = [
      '記事の主題は、',
      '具体的な問題は、',
      '提示されている解決策は、',
      '実装方法の詳細については、',
      '期待される効果は、',
      '実装時の注意点は、'
    ];
    
    console.log('ラベル削除チェック:');
    let hasUnwantedLabels = false;
    bulletPoints.forEach((line, index) => {
      const hasLabel = unwantedLabels.some(label => line.includes(label));
      if (hasLabel) {
        console.log(`  ${index + 1}. ❌ ラベルが残っています: ${line.substring(0, 30)}...`);
        hasUnwantedLabels = true;
      } else {
        console.log(`  ${index + 1}. ✅ ラベルなし`);
      }
    });
    
    if (!hasUnwantedLabels) {
      console.log('\n✅ すべてのラベルが正しく削除されています');
    } else {
      console.log('\n⚠️ 一部のラベルが残っています');
    }
    
    console.log('\n' + '-'.repeat(60));
    console.log(`処理時間: ${duration}ms`);
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('テスト完了');
}

// テスト実行
testCleanLabels().catch(console.error);