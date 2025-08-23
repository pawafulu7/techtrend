# /implement - Worktree並行開発での実装

## 概要
新機能や改善を**独立したworktree環境**で実装します。他のタスクと並行して作業可能です。

## 実行手順

1. **Worktree環境を自動作成**
   - `./worktree.sh auto "{タスク説明}"` を実行
   - 自動的にブランチ名生成（feature/xxx-YYYYMMDD-HHMMSS）
   - 独立した作業ディレクトリ作成

2. **作業ディレクトリに移動**
   - `cd ../techtrend-feature-xxx` で移動
   - この環境は完全に独立（他タスクに影響なし）

3. **実装作業**
   - 通常通りファイル編集
   - `npm run dev` でローカルサーバー起動（ポート自動割当）
   - 必要に応じて依存関係追加

4. **テスト実行**
   - `npm test` でユニットテスト
   - `npm run test:e2e` でE2Eテスト
   - 手動での動作確認

5. **コミット**
   - `git add .`
   - `git commit -m "feat: {実装内容}"`
   - 適切なコミットメッセージを使用

6. **Pull Request作成**
   - `../techtrend/worktree.sh pr "{PR タイトル}"` を実行
   - 自動的に詳細なPR説明を生成
   - GitHub上でPRが開く

7. **クリーンアップ（オプション）**
   - PRマージ後、`./worktree.sh cleanup feature-xxx` で環境削除

## 重要事項

- **並行作業可能**: 複数の/implementタスクを同時実行できます
- **環境分離**: 各worktreeは独立したnode_modules、ポート番号を持ちます
- **PR自動生成**: 変更統計、コミット履歴、チェックリストを含むPRを自動作成
- **mainブランチは変更しない**: 常に新しいブランチで作業

## 使用例

```
ユーザー: /implement ユーザー認証機能を追加してください

実行内容:
1. ./worktree.sh auto "ユーザー認証機能を追加"
2. cd ../techtrend-feature-user-auth-20250823-180000
3. 認証関連ファイルの作成・編集
4. npm test でテスト実行
5. git commit -m "feat: ユーザー認証機能の実装"
6. ../techtrend/worktree.sh pr "feat: ユーザー認証機能を追加"
```

## 他のコマンドとの使い分け

- `/investigate`: mainブランチで調査（worktree不要）
- `/plan`: mainブランチで計画作成（worktree不要）
- `/implement`: **worktreeで実装**（このコマンド）
- `/fix`: worktreeでバグ修正
- `/improve`: worktreeで改善