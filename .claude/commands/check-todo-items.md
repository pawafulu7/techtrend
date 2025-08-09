# Check TODO Items

プロジェクト内のTODO項目を収集し、優先度付けして管理する。

実行手順：

1. TODO/FIXME/HACK/NOTEコメントを全ファイルから検索：
   - TypeScript/JavaScriptファイル（.ts, .tsx, .js, .jsx）
   - CSSファイル（.css, .scss）
   - Markdownファイル（.md）

2. 各TODO項目を分類：
   - 緊急度: FIXME > TODO > HACK > NOTE
   - 影響範囲: コア機能 > UI > テスト > ドキュメント
   - 実装難易度: 高/中/低

3. 既存のSerenaメモリと照合：
   - 前回のTODOリストと比較
   - 解決済みの項目を特定
   - 新規追加された項目を特定

4. TODO管理メモリを更新：
   - immediate_action_items_[YYYYMM]
   - technical_debt_and_refactoring
   - 必要に応じて新規メモリ作成

5. レポート生成：
   - 未解決のTODO総数
   - カテゴリ別の内訳
   - 優先度が高い上位10項目
   - 解決済み項目の数

6. 推奨アクション：
   - すぐに対処すべき項目
   - 次のスプリントで対処すべき項目
   - 長期的に検討すべき項目

進捗状況を表示し、各ステップの結果を明確に報告する。