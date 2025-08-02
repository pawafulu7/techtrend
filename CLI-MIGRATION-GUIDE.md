# TechTrend CLI 移行ガイド

## 概要

TechTrendの管理スクリプトが統合CLIツールに移行されました。
以前は個別のスクリプトファイルを実行していましたが、現在は `techtrend` コマンドで統一的に管理できます。

## インストール

```bash
npm install
```

## 基本的な使い方

```bash
# ヘルプの表示
npm run techtrend -- --help

# サブコマンドのヘルプ
npm run techtrend -- summaries --help
```

## コマンド一覧

### 1. 要約管理（summaries）

```bash
# 要約生成
npm run techtrend -- summaries generate
npm run techtrend -- summaries generate --source "Dev.to"
npm run techtrend -- summaries generate --limit 50 --batch-size 5

# 要約再生成
npm run techtrend -- summaries regenerate
npm run techtrend -- summaries regenerate --source "Qiita" --days 30

# 要約状態チェック
npm run techtrend -- summaries check
```

### 2. 品質スコア管理（quality-scores）

```bash
# スコア計算
npm run techtrend -- quality-scores calculate
npm run techtrend -- quality-scores calculate --source "AWS" --recalculate

# ゼロスコア修正
npm run techtrend -- quality-scores fix

# 統計情報表示
npm run techtrend -- quality-scores stats
```

### 3. クリーンアップ（cleanup）

```bash
# 低品質記事の削除
npm run techtrend -- cleanup articles
npm run techtrend -- cleanup articles --dry-run
npm run techtrend -- cleanup articles --days 60 --score 20

# タグのクリーンアップ
npm run techtrend -- cleanup tags
npm run techtrend -- cleanup tags --dry-run

# クリーンアップ統計
npm run techtrend -- cleanup stats
```

### 4. フィード管理（feeds）

```bash
# フィード収集
npm run techtrend -- feeds collect "Dev.to" "Qiita"
npm run techtrend -- feeds collect --all

# ソース一覧
npm run techtrend -- feeds sources

# 収集統計
npm run techtrend -- feeds stats
npm run techtrend -- feeds stats --days 30
```

### 5. タグ管理（tags）

```bash
# タグ一覧
npm run techtrend -- tags list
npm run techtrend -- tags list --category "frontend" --limit 100

# タグ統計
npm run techtrend -- tags stats

# 空タグのクリーンアップ
npm run techtrend -- tags clean
npm run techtrend -- tags clean --dry-run

# カテゴリ分類（開発中）
npm run techtrend -- tags categorize
```

## 移行対応表

| 旧コマンド | 新コマンド |
|-----------|-----------|
| `npx tsx scripts/generate-summaries.ts` | `npm run techtrend -- summaries generate` |
| `npx tsx scripts/core/manage-summaries.ts generate` | `npm run techtrend -- summaries generate` |
| `npx tsx scripts/core/manage-summaries.ts regenerate` | `npm run techtrend -- summaries regenerate` |
| `npx tsx scripts/core/manage-quality-scores.ts calculate` | `npm run techtrend -- quality-scores calculate` |
| `npx tsx scripts/core/manage-quality-scores.ts fix` | `npm run techtrend -- quality-scores fix` |
| `npx tsx scripts/delete-low-quality-articles.ts` | `npm run techtrend -- cleanup articles` |
| `npx tsx scripts/clean-tags.ts` | `npm run techtrend -- cleanup tags` |
| `npx tsx scripts/collect-feeds.ts "Dev.to"` | `npm run techtrend -- feeds collect "Dev.to"` |

## スケジューラーの更新について

scheduler-v2.ts内の呼び出しも、段階的に新しいCLIコマンドに移行する予定です。
現在は既存のスクリプトを子プロセスとして呼び出していますが、将来的には直接CLIコマンドを実行するように変更されます。

## トラブルシューティング

### エラー: コマンドが見つからない

```bash
# package.jsonのスクリプトを使用
npm run techtrend -- [command]

# または直接実行
npx tsx lib/cli/index.ts [command]
```

### デバッグモード

環境変数 `DEBUG=1` を設定すると、詳細なログが出力されます：

```bash
DEBUG=1 npm run techtrend -- summaries generate
```

## 今後の開発予定

- [ ] より詳細なオプションの追加
- [ ] インタラクティブモードの実装
- [ ] 設定ファイルのサポート
- [ ] プログレスバーの改善
- [ ] エラーハンドリングの強化