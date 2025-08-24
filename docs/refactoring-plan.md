# リファクタリング計画 - manage-summaries.ts

## 現状
- ファイルサイズ: 920行
- 責務: 要約生成、再生成、テキスト処理、タグ処理、CLIインターフェース
- 問題: 単一ファイルに多すぎる責務

## 提案する分割構造

### 1. lib/services/summary-generation/
```
summary-generation/
├── index.ts              # メインエクスポート
├── generator.ts          # 要約生成ロジック
├── regenerator.ts        # 再生成ロジック
├── text-processor.ts     # テキスト処理ユーティリティ
├── tag-parser.ts         # タグ解析
└── types.ts             # 型定義
```

### 2. 分割後の責務

#### generator.ts (約200行)
- generateSummaryAndTags()
- Gemini API連携
- Rate Limit処理

#### regenerator.ts (約150行)
- regenerateSummaries()
- バッチ処理ロジック
- 進捗管理

#### text-processor.ts (約150行)
- cleanupText()
- finalCleanup()
- normalizeDetailedSummary()

#### tag-parser.ts (約100行)
- parseSummaryAndTags()
- タグ正規化

#### scripts/scheduled/manage-summaries.ts (約300行)
- CLIインターフェース
- main()関数
- 引数パース

## メリット
1. **保守性向上**: 各ファイル300行以下
2. **テスタビリティ**: 機能単位でテスト可能
3. **再利用性**: 他のスクリプトから機能を利用可能
4. **責務の明確化**: Single Responsibility Principle遵守

## 実装優先度
1. text-processor.ts（最も独立性が高い）
2. tag-parser.ts
3. generator.ts
4. regenerator.ts
5. CLIインターフェース整理

## 推定作業時間
- 分割作業: 2-3時間
- テスト追加: 1-2時間
- 動作確認: 1時間
- 合計: 4-6時間