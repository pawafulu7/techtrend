# Weekly Cleanup

週次でプロジェクトをクリーンアップし、最適化する。ユーザー確認なしで安全に実行。

## 実行内容

### 1. Serenaメモリの整理
- 重複している情報を持つメモリの特定
- 30日以上更新されていない古いメモリのリストアップ
- 統合可能なメモリの提案（実際の統合は手動確認後）

### 2. 深度のあるコード分析
- 各ディレクトリのファイルサイズ統計
- 500行を超える大きなファイルの特定
- 重複コードパターンの検出
- 未使用のexportの検出

### 3. 依存関係の健全性チェック
- `npm audit`でセキュリティ脆弱性確認
- 未使用の依存関係の検出
- メジャーバージョンアップデートの確認

### 4. プロジェクト構造の最適化提案
- リファクタリングが必要な箇所
- ディレクトリ構造の改善提案
- 命名規則の一貫性チェック

### 5. 包括的なレポート生成
週次レポートをSerenaメモリに保存：
- weekly_report_[YYYY_WW]
- 改善された項目
- 新たに検出された課題
- 推奨アクションのリスト

## 実行タイミング
- 毎週月曜日の朝
- スプリント終了時
- リリース準備前

## 出力例
```
=== Weekly Cleanup Report ===
📅 Week: 2025-W06

🧹 Memory Cleanup:
  - Outdated memories: 5
  - Duplicates found: 2
  - Suggested merges: 3

📊 Code Health:
  - Large files (>500 lines): 8
  - Duplicate patterns: 12
  - Unused exports: 23

🔒 Security:
  - Vulnerabilities: 0 critical, 2 moderate
  - Outdated packages: 15

✨ Improvements since last week:
  - Resolved TODOs: 8
  - Performance optimizations: 3
  - Test coverage: +5%

📋 Action items saved to: weekly_report_2025_W06
```

各セクションで問題が検出された場合、具体的な対処方法を提案する。