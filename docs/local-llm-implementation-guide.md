# LocalLLM実装ガイド

## 概要
このドキュメントは、TechTrendプロジェクトでLocalLLM（GPT-OSS 20B）を実用化するための検証結果と実装方法をまとめたものです。

## 検証日時
- 検証実施日: 2025年1月11日
- 検証環境: Ubuntu (WSL2)
- LocalLLMサーバー: http://192.168.11.7:1234
- モデル: openai/gpt-oss-20b

## 1. 検証結果サマリー

### 品質評価
| 指標 | Gemini 1.5 Flash | LocalLLM (GPT-OSS 20B) | 達成率 |
|------|------------------|------------------------|--------|
| 平均品質スコア | 52点 | 38点 | 73% |
| 処理速度 | 4.5秒 | 17秒 | - |
| コスト | $0.00015/記事 | $0 | 100%削減 |
| 英語混入率 | 0% | 0%（処理後） | ✅ |
| 統一フォーマット対応 | 100% | 100% | ✅ |

### 実用性判定
✅ **実用レベル達成** - 以下の条件をクリア：
- 品質スコアがGeminiの70%以上
- 英語混入を完全に除去可能
- 統一フォーマット（Version 5）に対応

## 2. 必要な設定

### 2.1 システムプロンプト（完全日本語版）

LocalLLMサーバーに以下のシステムプロンプトを設定してください：

```
あなたは日本語技術記事分析の専門家です。

厳守事項：
・出力は完全に日本語のみ（技術用語も可能な限り日本語またはカタカナ表記）
・思考過程は一切出力しない
・指定された形式のみを直接出力する

出力形式１（要約とタグ）：
要約：80から120文字の日本語要約
タグ：技術タグを3から5個、カンマ区切り

出力形式２（詳細分析）：
・記事の主題は、主要トピックと技術的背景
・解決しようとしている問題は、具体的な課題
・提示されている解決策は、提案されたアプローチ
・実装方法の詳細については、実装の詳細
・期待される効果は、期待される利点
・実装時の注意点は、重要な考慮事項

各項目は50から150文字で記述。
完全な文で終了すること。

品質基準：
・技術的正確性
・問題と解決策の明確な記述
・著者紹介は除外
・メタコメントなし

注意：直接出力のみ。思考を声に出さない。
```

### 2.2 環境変数設定

`.env`ファイルに以下を追加：

```bash
# LocalLLM設定
LOCAL_LLM_URL="http://192.168.11.7:1234"
LOCAL_LLM_MODEL="openai/gpt-oss-20b"
LOCAL_LLM_MAX_TOKENS="2000"
USE_LOCAL_LLM="false"  # trueに変更で有効化
```

## 3. 実装に必要なコード

### 3.1 英語除去メソッド

LocalLLMは出力の冒頭に英語の思考過程が混入するため、以下のクリーンアップ処理が必須です：

```typescript
/**
 * LocalLLMの出力から英語の思考過程を除去
 * @param output - LocalLLMからの生の出力
 * @returns クリーンアップされた日本語出力
 */
function cleanLocalLLMOutput(output: string): string {
  // ケース1: 「一覧要約:」が含まれる場合
  if (output.includes('一覧要約:') || output.includes('一覧要約：')) {
    // 「一覧要約:」より前のすべてを削除（同一行の英語も含む）
    const summaryMatch = output.match(/(一覧要約[:：][\s\S]*)/);
    if (summaryMatch) {
      return summaryMatch[1].trim();
    }
  }
  
  // ケース2: 「一覧要約:」がない場合（詳細要約から始まるパターン）
  const lines = output.split('\n');
  const filteredLines = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Need/We needで始まる行をスキップ
    if (/^(Need|We need)/i.test(trimmed)) {
      continue;
    }
    // 純粋な英語行をスキップ（日本語が含まれる行は保持）
    if (/^[A-Za-z][A-Za-z\s.,!?0-9-]*$/.test(trimmed) && 
        !/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(trimmed)) {
      continue;
    }
    filteredLines.push(line);
  }
  
  return filteredLines.join('\n').trim();
}
```

### 3.2 LocalLLMクライアントの修正箇所

`lib/ai/local-llm.ts`の`callAPI`メソッド内で、レスポンスを返す前にクリーンアップを適用：

```typescript
private async callAPI(messages: ChatMessage[]): Promise<string> {
  // ... 既存のコード ...
  
  const data = await response.json() as ChatCompletionResponse;
  
  if (!data.choices || data.choices.length === 0) {
    throw new Error('No response from Local LLM');
  }
  
  // クリーンアップ処理を追加
  const rawOutput = data.choices[0].message.content;
  return cleanLocalLLMOutput(rawOutput);
}
```

## 4. 検証で判明した問題と対策

### 問題1: 英語の思考過程混入
**パターン例:**
- `Need to output in required format.一覧要約:`
- `We need output in Japanese only, no thoughts.`

**対策:** 上記のクリーンアップメソッドで100%除去可能

### 問題2: 処理速度
- LocalLLM: 平均17秒/記事
- Gemini: 平均4.5秒/記事

**対策:** 
- バッチ処理では問題なし（Rate Limitがないため並列処理可能）
- リアルタイム処理が必要な場合はGeminiを使用

### 問題3: 要約文字数制御
- 時々130文字を超える要約を生成（最大256文字）

**対策:**
- プロンプトで文字数を強調
- 後処理で切り詰め

## 5. 移行戦略

### Phase 1: テスト環境（1週間）
- `USE_LOCAL_LLM=true`で一部の処理をLocalLLMに切り替え
- エラー率と品質を監視

### Phase 2: 段階的移行（2週間）
- 新規記事の20%をLocalLLMで処理
- A/Bテストで品質比較

### Phase 3: 本格運用
- 問題がなければ全面移行
- またはハイブリッド運用（重要記事はGemini、その他はLocalLLM）

## 6. 運用上の注意事項

### メモリ使用量
- GPT-OSS 20Bは約40GB のVRAMを使用
- サーバーのリソース監視が必要

### 可用性
- LocalLLMサーバーの死活監視を設定
- フォールバックとしてGemini APIを準備

### 品質管理
- 定期的な品質スコアのモニタリング
- 英語混入のチェック（クリーンアップ失敗の検知）

## 7. テストスクリプト

検証用スクリプトは以下のディレクトリに保存されています：

```
scripts/manual/
├── test-local-llm-connection.ts    # 接続確認
├── test-japanese-system-prompt.ts  # システムプロンプトテスト
├── analyze-english-patterns.ts     # 英語パターン分析
├── check-full-output.ts           # 出力構造分析
├── test-cleanup-method.ts         # クリーンアップメソッドテスト
└── validate-local-llm-quality.ts  # 品質検証
```

## 8. 今後の改善案

1. **ファインチューニング**
   - 日本語技術記事に特化したファインチューニング
   - 統一フォーマット出力の学習

2. **プロンプトエンジニアリング**
   - Few-shot学習の導入
   - より詳細な指示の追加

3. **モデルのアップグレード**
   - より新しいLocalLLMモデルへの移行
   - 日本語特化モデルの検討

## 9. 結論

LocalLLM（GPT-OSS 20B）は、適切な設定とクリーンアップ処理により、Gemini APIの実用的な代替として機能することが確認されました。特に以下の点で優位性があります：

- **コスト削減**: 完全無料（電気代除く）
- **Rate Limit回避**: 無制限の処理が可能
- **プライバシー**: データが外部に送信されない

品質面ではGeminiの73%程度ですが、大量の記事処理において十分実用的なレベルです。

---
*最終更新: 2025年1月11日*