# Scripts ディレクトリ管理ガイドライン

## ディレクトリ構造

```
scripts/
├── scheduled/     # 定期実行スクリプト（恒久的）
├── manual/        # 手動実行スクリプト（恒久的）
├── maintenance/   # メンテナンススクリプト（恒久的）
├── utils/         # ユーティリティスクリプト（恒久的）
└── temp/          # 一時的スクリプト（.gitignore対象）
    ├── fixes/     # 修正系スクリプト
    ├── checks/    # 検証系スクリプト
    ├── tests/     # テスト系スクリプト
    └── misc/      # その他の一時的スクリプト
```

## スクリプト管理ルール

### 1. スクリプトの分類

#### 恒久的スクリプト
- **定期実行（scheduled/）**: PM2やcronで定期実行されるスクリプト
- **手動実行（manual/）**: 必要時に手動で実行するツール
- **メンテナンス（maintenance/）**: システムメンテナンス用のスクリプト
- **ユーティリティ（utils/）**: シェルスクリプトや補助ツール

#### 一時的スクリプト（temp/）
- **修正系（fixes/）**: 一時的な修正・パッチ適用スクリプト
- **検証系（checks/）**: デバッグや検証用スクリプト
- **テスト系（tests/）**: 実験的なテストスクリプト
- **その他（misc/）**: 上記に分類されない一時的なスクリプト

### 2. 作成時のルール

#### 恒久的スクリプトの作成
1. 適切なディレクトリ（scheduled/、manual/、maintenance/、utils/）に配置
2. 機能を表す明確な名前を付ける（例: `collect-feeds.ts`、`generate-summaries.ts`）
3. スクリプトの用途と使用方法をコメントで記載
4. package.jsonにスクリプトコマンドを追加（必要に応じて）

#### 一時的スクリプトの作成
1. **必ず** temp/配下の適切なサブディレクトリに配置
2. プレフィックスを付けた名前にする
   - 修正系: `fix-*.ts`
   - 検証系: `check-*.ts`
   - テスト系: `test-*.ts`
3. スクリプト冒頭に作成日と削除予定日をコメントで記載

### 3. 削除タイミング

#### 一時的スクリプト
- 作業完了後、即座に削除することを推奨
- 最長でも1ヶ月以内に削除
- 定期的なクリーンアップ（月1回）を実施

#### 恒久的スクリプト
- 使用されなくなった場合は、削除前に十分な検討を行う
- 削除時は関連するpackage.jsonのコマンドも更新

### 4. 命名規則

#### 恒久的スクリプト
- ケバブケース（kebab-case）を使用
- 動詞で始まる（例: `collect-`, `generate-`, `clean-`）
- 対象を明確にする（例: `collect-feeds.ts`、`generate-tags.ts`）

#### 一時的スクリプト
- プレフィックス + 具体的な内容
- 例: `fix-short-summaries.ts`、`check-article-quality.ts`

### 5. Git管理

#### 恒久的スクリプト
- 通常通りGit管理
- 変更時は適切なコミットメッセージを記載

#### 一時的スクリプト（temp/）
- .gitignoreで除外されているため、Git管理されない
- 重要な修正内容は、恒久的スクリプトに反映後に削除

## 主要スクリプト一覧

### scheduled/ - 定期実行
- `collect-feeds.ts` - 各種フィードの収集
- `generate-tags.ts` - タグの自動生成
- `quality-check.ts` - 記事品質のチェック
- `auto-regenerate.ts` - 自動再生成処理
- `delete-low-quality-articles.ts` - 低品質記事の削除

### manual/ - 手動実行
- `generate-summaries-claude.ts` - Claude APIを使用した要約生成
- `compare-summaries.ts` - 要約の比較ツール
- `generate-tags-claude-batch.ts` - Claude APIでのバッチタグ生成

### maintenance/ - メンテナンス
- `generate-summaries.ts` - 通常の要約生成処理

### utils/ - ユーティリティ
- `docker-dev.sh` - Docker開発環境セットアップ
- `cleanup-db.sh` - データベースクリーンアップ
- `backup.sh` - バックアップスクリプト

## package.json スクリプトコマンド

主要なスクリプトコマンド:
```json
{
  "scripts:collect": "tsx scripts/scheduled/collect-feeds.ts",
  "scripts:summarize": "tsx scripts/maintenance/generate-summaries.ts",
  "claude:summarize": "tsx scripts/manual/generate-summaries-claude.ts",
  "claude:compare": "tsx scripts/manual/compare-summaries.ts"
}
```

## 注意事項

1. **temp/ディレクトリの内容はGit管理されません**
   - 重要な変更は恒久的スクリプトに反映してください

2. **定期的なクリーンアップ**
   - 月1回、temp/ディレクトリをクリーンアップしてください

3. **ドキュメント更新**
   - 新しい恒久的スクリプトを追加した際は、このREADMEを更新してください

4. **依存関係の確認**
   - スクリプトを移動・削除する際は、他のスクリプトやpackage.jsonとの依存関係を確認してください

## 問い合わせ

スクリプト管理に関する質問や提案がある場合は、プロジェクトリーダーまでご連絡ください。