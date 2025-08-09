# Quick Check

プロジェクトの状態を素早くチェックする軽量版メンテナンスコマンド。ユーザー確認なしで実行。

## 実行内容（1分以内で完了）

### 1. 基本情報の収集
- 最新5件のgitコミットを確認
- 本日変更されたファイルのリスト
- 現在のブランチと状態確認

### 2. 簡易品質チェック
- TypeScriptエラーの有無を確認（エラー数のみ）
- TODO/FIXMEコメントの総数カウント
- package.jsonの最終更新日確認

### 3. Serenaメモリの状態確認
- メモリ総数の確認
- 最新のメモリ3つを表示
- 30日以上更新されていないメモリの検出

## 出力形式

```
=== Quick Check Results ===
📊 Project Status:
  - Current branch: main
  - Recent commits: 5
  - Files changed today: 12

⚠️ Quality Metrics:
  - TypeScript errors: 0
  - TODO items: 23
  - FIXME items: 5

📝 Serena Memory:
  - Total memories: 35
  - Outdated (>30 days): 3
  - Latest update: techtrend_project_overview_202501

✅ All checks completed in 45 seconds
```

## 使用場面
- 作業開始前の状態確認
- プルリクエスト作成前のチェック
- デイリースタンドアップ前の情報収集

詳細な分析が必要な場合は `daily-maintenance` コマンドを使用すること。