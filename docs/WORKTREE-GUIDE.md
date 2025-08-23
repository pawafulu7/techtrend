# Git Worktree 並行開発ガイド

## 概要

`worktree.sh`を使用して、複数の開発タスクを並行して実行できます。
各タスクは独立した作業ディレクトリとブランチを持ち、相互に干渉しません。

## セットアップ

### 前提条件

- Git 2.5以上
- Node.js / npm
- GitHub CLI (`gh`)
- GitHub認証設定

### 初期設定

```bash
# GitHub CLI認証（初回のみ）
gh auth login

# スクリプトに実行権限付与（初回のみ）
chmod +x worktree.sh
```

## 基本的な使い方

### 1. 新しいタスクを開始

```bash
# 自動でブランチ名生成・環境作成
./worktree.sh auto "認証機能を実装"

# 結果:
# - ブランチ: feature/auth-implementation-20250823-180034
# - ディレクトリ: ../techtrend-feature-auth-implementation-20250823-180034
# - ポート: 3100（自動割当）
```

### 2. 作業ディレクトリに移動

```bash
cd ../techtrend-feature-auth-implementation-20250823-180034
```

### 3. 開発作業

```bash
# 通常通り開発
npm run dev  # ポート3100で起動

# ファイル編集
# テスト実行
npm test

# コミット
git add .
git commit -m "feat: 認証機能の実装"
```

### 4. Pull Request作成

```bash
# 詳細なPR説明付きで作成
../techtrend/worktree.sh pr "feat: 認証機能の実装"

# 自動的に:
# - git push
# - PR作成（詳細な説明付き）
# - ブラウザでPRページを開く
```

### 5. クリーンアップ

```bash
# メインディレクトリに戻る
cd ../techtrend

# worktreeを削除
./worktree.sh cleanup feature-auth-implementation-20250823-180034
```

## PR説明の自動生成

PRを作成すると、以下の情報が自動的に含まれます：

- **概要**: タスクの種別と説明
- **目的**: なぜこの変更が必要か
- **変更内容**: 
  - コミット数、変更ファイル数
  - 追加/削除行数
  - コミット履歴
  - 変更ファイル一覧
- **影響範囲**: 既存機能への影響
- **チェックリスト**: テスト、コード品質、ドキュメント

## 並行開発の例

### 3つのタスクを同時に実行

```bash
# ターミナル1: バグ修正
./worktree.sh auto "ログイン検証のバグを修正"
cd ../techtrend-fix-login-bug-20250823-180100
npm run dev  # ポート3100

# ターミナル2: 新機能
./worktree.sh auto "ダッシュボード機能を追加"
cd ../techtrend-feature-dashboard-add-20250823-180200
npm run dev  # ポート3101

# ターミナル3: パフォーマンス改善
./worktree.sh auto "APIレスポンスを最適化"
cd ../techtrend-improve-api-optimize-20250823-180300
npm run dev  # ポート3102
```

## Claude Codeでの使用

Claude Codeは自動的にこのスクリプトを使用して並行開発を管理できます：

```bash
# Claude Code: "認証機能を実装します"
./worktree.sh auto "認証機能を実装"

# Claude Code: 自動的に作業ディレクトリに移動
cd ../techtrend-feature-auth-implementation-xxxxx

# Claude Code: 開発作業を実施
# ... ファイル編集 ...

# Claude Code: テスト実行
npm test

# Claude Code: コミット
git add .
git commit -m "feat: 認証機能の実装"

# Claude Code: PR作成
../techtrend/worktree.sh pr

# Claude Code: クリーンアップ（オプション）
cd ../techtrend
./worktree.sh cleanup feature-auth-implementation-xxxxx
```

## コマンドリファレンス

| コマンド | 説明 | 例 |
|---------|------|-----|
| `auto <description>` | タスク説明から自動でworktree作成 | `./worktree.sh auto "バグ修正"` |
| `create <branch>` | 指定ブランチ名でworktree作成 | `./worktree.sh create feature/new-api` |
| `list` | 既存のworktree一覧表示 | `./worktree.sh list` |
| `pr [title]` | 現在のブランチからPR作成 | `./worktree.sh pr "feat: 新機能"` |
| `finish [title]` | PR作成してworktreeクリーンアップ | `./worktree.sh finish` |
| `cleanup <name>` | 指定worktreeを削除 | `./worktree.sh cleanup feature-xxx` |

## ブランチ名の自動生成ルール

タスク説明から自動的にブランチ名を生成：

| タスク説明 | 生成されるブランチ名 |
|-----------|-------------------|
| "認証機能を実装" | `feature/auth-implementation-20250823-180034` |
| "ログインバグを修正" | `fix/loginbug-fix-20250823-180034` |
| "パフォーマンスを改善" | `improve/performance-improve-20250823-180034` |
| "テストを追加" | `feature/test-add-20250823-180034` |

## トラブルシューティング

### Q: worktreeが作成できない

```bash
# Gitのバージョン確認
git --version  # 2.5以上が必要

# 既存のworktree確認
git worktree list
```

### Q: ポートが使用中

スクリプトは自動的に空いているポートを探しますが、手動指定も可能：

```bash
echo "PORT=3200" > .env.local
```

### Q: PR作成に失敗

```bash
# GitHub CLI認証確認
gh auth status

# 手動でPR作成
git push -u origin feature/xxx
# ブラウザでGitHubを開いてPR作成
```

### Q: worktreeを削除できない

```bash
# 強制削除
git worktree remove --force ../techtrend-xxx

# 手動クリーンアップ
rm -rf ../techtrend-xxx
git worktree prune
```

## ベストプラクティス

1. **タスクごとにworktree作成**
   - 各機能・バグ修正を独立した環境で

2. **定期的なクリーンアップ**
   ```bash
   # 不要なworktree一覧
   git worktree list
   
   # pruneで削除済みworktreeをクリーン
   git worktree prune
   ```

3. **わかりやすいタスク説明**
   - 日本語OK: "ユーザー認証機能を実装"
   - 英語OK: "Implement user authentication"

4. **PR作成前にテスト実行**
   ```bash
   npm test
   npm run lint
   npm run build
   ```

5. **並行作業の管理**
   - 各worktreeのポート番号をメモ
   - `./worktree.sh list`で状態確認

## まとめ

`worktree.sh`により：
- ✅ 複数タスクの並行開発
- ✅ 環境の完全分離
- ✅ 自動的なブランチ管理
- ✅ 詳細なPR説明の自動生成
- ✅ Claude Codeとの完全統合

これで効率的な並行開発が可能になります！