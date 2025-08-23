# /implement - Worktree並行開発での実装

## 目的
plan.mdに基づきタスク単位で実装を行う。**独立したworktree環境**で他のタスクと並行して作業可能。

## 注意事項
- 常にultrathinkでしっかりと考えて作業を行うこと
- コード中に絵文字は使用されるべきではありません
- 必要であればserenaMCPを用いて、プロジェクトの全体概要を確認し、対象の詳細調査を行うこと

## 必要な入力ファイル
- `.claude/docs/plan/plan_{TIMESTAMP}.md` - 実装計画書
- 関連する既存ファイル・コード

## 実行手順

### 1. 実装開始準備
- ユーザの指示を理解し、実装開始をコンソールで通知
- 最新の `.claude/docs/plan/plan_{TIMESTAMP}.md` ファイルを読み込み、実装計画を確認

### 2. Worktree環境を自動作成
- `./worktree.sh auto "{タスク説明}"` を実行
- 自動的にブランチ名生成（feature/xxx-YYYYMMDD-HHMMSS）
- 独立した作業ディレクトリ作成

### 3. 作業ディレクトリに移動
- `cd ../techtrend-feature-xxx` で移動
- この環境は完全に独立（他タスクに影響なし）

### 4. プランに従った実装を段階的に実行
- 通常通りファイル編集
- `npm run dev` でローカルサーバー起動（ポート自動割当）
- 必要に応じて依存関係追加
- コミットは適切な粒度で実行

### 5. テスト実行
- `npm test` でユニットテスト
- `npm run test:e2e` でE2Eテスト
- 手動での動作確認

### 6. 実装内容の記録
- 実装内容の詳細を `.claude/docs/implement/implement_{TIMESTAMP}.md` に記録
- 関連するplanファイル、実装詳細ファイルをコンソール出力

### 7. Pull Request作成
- `../techtrend/worktree.sh pr "{PR タイトル}"` を実行
- 自動的に詳細なPR説明を生成
- GitHub上でPRが開く

### 8. クリーンアップ（オプション）
- PRマージ後、`./worktree.sh cleanup feature-xxx` で環境削除

## 出力ファイル
- `.claude/docs/implement/implement_{TIMESTAMP}.md` - 実装詳細記録

## 最終出力形式
必ず以下の三つの形式で出力を行ってください

### 実装完了の場合
```
status: SUCCESS
next: TEST
details: "実装完了。implement_{TIMESTAMP}.mdに詳細記録。テストフェーズへ移行。"
```

### 追加作業が必要な場合
```
status: NEED_MORE
next: IMPLEMENT
details: "依存関係の実装が必要。implement_{TIMESTAMP}.mdに詳細記録。タスク継続。"
```

### プラン見直しが必要な場合
```
status: NEED_REPLAN
next: PLAN
details: "設計変更が必要。implement_{TIMESTAMP}.mdに詳細記録。プランフェーズに戻る。"
```

## 重要事項

- **並行作業可能**: 複数の/implementタスクを同時実行できます
- **環境分離**: 各worktreeは独立したnode_modules、ポート番号を持ちます
- **PR自動生成**: 変更統計、コミット履歴、チェックリストを含むPRを自動作成
- **mainブランチは変更しない**: 常に新しいブランチで作業

## 使用例

```
ユーザー: /implement ユーザー認証機能を追加してください

実行内容:
1. 計画書確認（plan_20250823_180000.md）
2. ./worktree.sh auto "ユーザー認証機能を追加"
3. cd ../techtrend-feature-user-auth-20250823-180000
4. 認証関連ファイルの作成・編集
5. npm test でテスト実行
6. git commit -m "feat: ユーザー認証機能の実装"
7. implement_20250823_180000.mdに詳細記録
8. ../techtrend/worktree.sh pr "feat: ユーザー認証機能を追加"

status: SUCCESS
next: TEST
details: "実装完了。implement_20250823_180000.mdに詳細記録。テストフェーズへ移行。"
```

## 他のコマンドとの使い分け

- `/investigate`: mainブランチで調査（worktree不要）
- `/plan`: mainブランチで計画作成（worktree不要）
- `/implement`: **worktreeで実装**（このコマンド）
- `/fix`: worktreeでバグ修正
- `/improve`: worktreeで改善