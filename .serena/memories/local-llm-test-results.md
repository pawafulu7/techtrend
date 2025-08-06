# ローカルLLM検証結果 (2025-01-08)

## 検証環境
- **LLMサーバー**: http://192.168.11.7:1234 (OpenAI互換API)
- **利用可能モデル**:
  - openai/gpt-oss-20b (メインモデル)
  - text-embedding-nomic-embed-text-v1.5 (埋め込みモデル)
  - google/gemma-3-12b

## テスト内容
Amazon OpenSearch Serverlessの記事を使用して要約・タグ生成能力を検証

### テスト記事
- **ID**: cmdxpqwek0002tezpe5guk912
- **タイトル**: Amazon OpenSearch Serverless introduces automatic semantic enrichment
- **ソース**: AWS

## 比較結果

### Gemini API (現行)
- **要約**: セマンティック検索実装の複雑さを自動エンリッチメント機能により解決。機械学習の専門知識や複雑な設定を必要とせず、データ取り込み時に自動的にセマンティックエンリッチメントを行い、検索関連性の向上を実現する。
- **タグ**: AWS, OpenSearch Service
- **コスト**: API利用料金発生
- **制限**: レート制限あり（429エラー頻発）

### ローカルLLM (openai/gpt-oss-20b)
- **要約**: OpenSearch Serverlessが自動セマンティックエンリッチメントを実装し、検索クエリの文脈と意味を理解できるようになりました。設定は自動化され、複雑な手作業が不要になるため、検索精度を簡単に向上できます。
- **タグ**: OpenSearch, Serverless, セマンティック検索, 自動化, 検索エンリッチメント
- **トークン使用量**: Prompt: 227, Completion: 110, Total: 337
- **処理時間**: 約1-2秒（ローカル処理）

## 評価結果

### ✅ 長所
1. **コスト効率**: API料金不要、完全無料で運用可能
2. **処理速度**: ローカル処理により高速レスポンス
3. **スケーラビリティ**: レート制限なし、大量処理可能
4. **プライバシー**: データが外部送信されない
5. **タグ品質**: より詳細で具体的なタグ生成（5個 vs 2個）
6. **日本語品質**: 自然な日本語要約を生成

### ⚠️ 考慮事項
1. **リソース使用**: ローカルサーバーのメモリ/CPU使用
2. **モデル依存**: 品質はモデルサイズに依存
3. **保守**: ローカルサーバーの管理が必要

## 実装案

### APIエンドポイント統合例
```javascript
// generate-summaries.ts への統合案
async function generateSummaryAndTags(title: string, content: string): Promise<SummaryAndTags> {
  const useLocalLLM = process.env.USE_LOCAL_LLM === 'true';
  const localLLMUrl = process.env.LOCAL_LLM_URL || 'http://192.168.11.7:1234';
  
  if (useLocalLLM) {
    // ローカルLLM使用
    const response = await fetch(`${localLLMUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{
          role: "user",
          content: generatePrompt(title, content)
        }],
        max_tokens: 300,
        temperature: 0.3
      })
    });
    // パース処理
  } else {
    // 既存のGemini API処理
  }
}
```

### 環境変数設定例
```bash
# .env
USE_LOCAL_LLM=true
LOCAL_LLM_URL=http://192.168.11.7:1234
LOCAL_LLM_MODEL=openai/gpt-oss-20b
```

## 推奨運用方法

### ハイブリッドアプローチ
1. **通常時**: ローカルLLM使用（コスト削減、高速処理）
2. **フォールバック**: ローカルLLM障害時はGemini APIに切り替え
3. **品質チェック**: 定期的に両者の出力を比較

### 段階的移行
1. **Phase 1**: テスト環境でローカルLLM運用
2. **Phase 2**: 一部記事でA/Bテスト実施
3. **Phase 3**: 問題なければ完全移行

## 結論
ローカルLLM（openai/gpt-oss-20b）は、Gemini APIの代替として十分実用的。
特にレート制限問題の解決とコスト削減の観点から導入価値が高い。