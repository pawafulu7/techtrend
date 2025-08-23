# Container Use Guide for TechTrend

## 概要

Container Useは、Claude Codeが独立したコンテナ環境で作業できるようにするツールです。
ローカルファイルは変更されず、作業完了後に変更をレビューしてからマージできます。

## セットアップ完了

Container Useは既にインストール済みで、`.mcp.json`に設定済みです。
Claude Codeを再起動すると、自動的にContainer Useツールが利用可能になります。

## 基本的な使い方

### Container Use MCPツール（Claude Code内から使用）

Claude Codeを再起動後、以下のMCPツールが利用可能になります：

- `container_use_create` - 新しいコンテナ環境を作成
- `container_use_exec` - コンテナ内でコマンドを実行
- `container_use_list` - 環境一覧を表示
- `container_use_diff` - 変更内容を確認
- `container_use_merge` - 変更をマージ

### コマンドライン操作（ターミナルから）

```bash
# 環境一覧を表示
container-use list
# または短縮形
cu list

# 特定環境の詳細を表示
container-use show {id}

# 変更内容を確認
container-use diff {id}

# 変更をマージ（gitコミット付き）
container-use merge {id}

# 変更を適用（gitコミットなし）
container-use apply {id}

# 環境を削除
container-use remove {id}
```

## Claude Codeでの使用例

### シナリオ1: 新機能開発

Claude Codeで：
1. 「認証機能を実装してください」と依頼
2. Claude Codeが自動的にコンテナ環境を作成
3. コンテナ内で開発作業を実行
4. 完了後、`container-use diff {id}`で変更確認
5. 問題なければ`container-use merge {id}`でマージ

### シナリオ2: 複数タスクの並行実行

複数のClaude Codeセッションで：
- セッション1: 「バグ修正をしてください」
- セッション2: 「パフォーマンス改善をしてください」
- セッション3: 「新機能を追加してください」

各タスクが独立したコンテナで実行され、干渉なし。

## 利点

1. **安全性** - ローカルファイルは変更されない
2. **並行作業** - 複数タスクを同時実行可能
3. **レビュー** - 変更を確認してから適用
4. **MCP統合** - Claude Codeとシームレスに連携
5. **Git統合** - 自動的にコミットメッセージ生成

## トラブルシューティング

### Q: Container Useツールが表示されない

Claude Codeを再起動してください。`.mcp.json`の設定が反映されます。

### Q: コンテナが起動しない

Dockerが起動していることを確認：
```bash
docker ps
```

### Q: 変更をマージできない

コンフリクトがある場合は、手動で解決が必要：
```bash
container-use diff {id}  # 変更内容確認
git status               # 現在の状態確認
```

## 高度な使用方法

### 環境変数の設定

```bash
# Container Use経由で環境変数を渡す
container-use exec {id} --env KEY=value npm test
```

### カスタムDockerイメージ

`.container-use/config.yml`を作成：
```yaml
image: node:20
volumes:
  - ./data:/data
```

### セキュリティ設定

特定のツールを制限：
```bash
container-use --restrict-tools create {title}
```

## まとめ

Container Useにより：
- Claude Codeが安全に独立環境で作業
- 複数タスクの並行実行が可能
- 変更のレビューとマージが簡単
- 自前スクリプトのメンテナンス不要

詳細は[公式ドキュメント](https://container-use.com)を参照してください。