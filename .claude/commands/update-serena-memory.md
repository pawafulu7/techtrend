# Update Serena Memory

プロジェクトの最新情報をSerena MCPのメモリに反映させる。

以下の手順で実行：

1. まず現在のSerenaメモリ一覧を確認する
2. プロジェクト構造の最新情報を収集：
   - ディレクトリ構造の確認（lib/, scripts/, app/, components/）
   - 主要ファイルの更新状況確認
   - package.jsonのdependenciesの確認

3. 最近の重要な変更を収集：
   - git logで最新10件のコミットを確認
   - 変更されたファイルの一覧を確認
   - 新しく追加された機能や修正を特定

4. 技術的な改善点を収集：
   - TODOやFIXMEコメントの検索
   - TypeScriptエラーの確認
   - テストカバレッジの状況

5. 収集した情報をもとに、以下のSerenaメモリを更新：
   - techtrend_project_overview_[YYYYMM]
   - techtrend_recent_improvements_[YYYYMM]
   - 必要に応じて新しいメモリを作成

6. 古いメモリで不要になったものを削除

実行時は進捗を表示し、各ステップで何を行っているか明確にする。