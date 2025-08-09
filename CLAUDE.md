# TechTrend - CLAUDE.md

このファイルは、Claude Codeがこのプロジェクトで作業する際の重要な注意事項とガイドラインです。

**重要: 修正作業を行う前に、必ず `CODE-MAINTENANCE-GUIDE.md` を確認してください。**
このガイドには、影響範囲の把握方法、関連箇所の確認手順、検証方法が詳しく記載されています。

## データベース接続

**重要: 必ず以下のデータベースパスを使用すること**
- 正しいDBパス: `prisma/dev.db`
- SQLiteコマンド例: `sqlite3 prisma/dev.db`
- 間違い: `techtrend.db`、`.prisma/dev.db`（これらは存在しない）

```bash
# 正しい使用例
echo "SELECT COUNT(*) FROM Article;" | sqlite3 prisma/dev.db

# テーブル一覧確認
echo ".tables" | sqlite3 prisma/dev.db

# スキーマ確認
echo ".schema Article" | sqlite3 prisma/dev.db
```

## 重要な運用ルール

### 1. 記事要約の生成

**絶対に守るべきルール：**
- すべてのフェッチャーで `summary: undefined` を設定すること
- 要約は必ず `generate-summaries.ts` スクリプトで日本語生成すること
- フェッチャー内で要約を生成してはいけない（英語要約や本文切り抜きになるため）

**影響を受けるフェッチャー：**
- `lib/fetchers/devto.ts` - ✅ 修正済み
- `lib/fetchers/zenn.ts` - ✅ 修正済み
- `lib/fetchers/qiita.ts` - ✅ 修正済み
- その他すべてのフェッチャー

### 2. 記事品質フィルタリング と 取得件数

**Dev.to:**
- 反応数（positive_reactions_count）10以上
- 読了時間（reading_time_minutes）2分以上
- 日別トップ記事（top=1）を優先取得
- 最大30件/回

**Qiita:**
- ストック数10以上（stocks:>10）
- 24時間以内の記事
- 最大30件/回

**Zenn:**
- デイリートレンドフィード使用
- 複数トピックから取得（ZennExtendedFetcher使用時）
- 最大30件/回

**はてなブックマーク:**
- テクノロジーカテゴリ
- 最大40件/回

**Speaker Deck:**
- 日本語プレゼンテーション
- トレンドページから最大30件/回

### 3. スケジューラー設定

**RSS系ソース（1時間ごと更新）:**
- はてなブックマーク
- Qiita
- Zenn
- Dev.to
- Publickey
- Stack Overflow Blog
- Think IT

**スクレイピング系ソース（12時間ごと更新 - 0時・12時）:**
- Speaker Deck

設定ファイル: `scheduler-v2.ts`
PM2設定: `ecosystem.config.js`

### 4. 記事コンテンツの保存

**Dev.to:**
- `description` を `content` フィールドに保存
- APIから個別記事の詳細取得が可能（`scripts/update-devto-content.ts`）

### 5. データベース管理

**低品質記事の削除基準:**
- Dev.to: 反応数0の記事
- 全ソース: 3ヶ月以上前の記事

削除スクリプト: `scripts/delete-low-quality-articles.ts`

## よくある問題と対処法

### 問題1: 要約が英語になる / 本文がそのまま表示される

**原因:** フェッチャーで要約を生成している
**対処:** フェッチャーの `summary` を `undefined` に設定

### 問題2: Dev.toの要約が「記事内容が提示されていない」となる

**原因:** content フィールドが空
**対処:** `scripts/update-devto-content.ts` で記事詳細を取得

### 問題3: 低品質な記事が混入する

**原因:** フィルタリング条件が緩い
**対処:** 各フェッチャーの品質フィルタリング条件を強化

## 開発時の注意事項

1. 新しいフェッチャーを追加する際は、必ず `summary: undefined` を設定
2. 要約生成は `generate-summaries.ts` に任せる
3. スケジューラーに新ソースを追加する際は、RSS系かスクレイピング系かを判断
4. 品質フィルタリングを適切に設定する
5. **重要：機能の追加・修正・削除を行った場合は、作業内容の保持のため都度コミットする**


## Claude Code統合機能

### 概要
Claude Codeを使用した要約生成・品質比較機能が利用可能です。Gemini APIのRate Limit問題を回避したい場合や、高品質な要約が必要な場合に使用してください。

### 使用方法

**1. Claude Code要約生成（対話的）**
```bash
npm run claude:summarize
```
- 記事一覧から選択して要約を生成
- Claude Codeが対話的に要約とタグを生成
- 生成結果をデータベースに保存

**2. 品質比較ツール**
```bash
npm run claude:compare
```
- GeminiとClaudeの要約品質を比較
- スコアリングシステム（100点満点）で評価
- 複数記事での平均品質を算出

### 運用ガイドライン

**推奨使用シーン：**
- Gemini APIがRate Limitエラーを返す場合
- 特定の重要記事に高品質な要約が必要な場合
- 要約品質の検証・改善を行いたい場合
- 少量の記事を即座に処理したい場合

**注意事項：**
- Claude Codeセッション中のみ動作
- 大量バッチ処理には不向き（対話的処理のため）
- 基本的な大量処理はGemini APIを使用

### ハイブリッドアプローチ

1. **通常運用**: Gemini API（自動バッチ処理）
2. **補完運用**: Claude Code（少量・高品質処理）

## 統一フォーマット要約の再生成

### コマンド

```bash
# 未処理記事のみ再生成（推奨）
npm run regenerate:all-unified

# 中断後の再開（処理済みをスキップ）
npm run regenerate:all-unified -- --continue

# 全記事を強制再生成（処理済みも含む）
npm run regenerate:all-unified -- --force

# ドライラン（実際の更新なし）
npm run regenerate:all-unified -- --dry-run

# 件数制限
npm run regenerate:all-unified -- --limit=100

# 組み合わせ
npm run regenerate:all-unified -- --continue --limit=50
```

### 処理済みフラグ
- `summaryVersion: 5` = 統一フォーマット処理済み
- `articleType: 'unified'` = 統一タイプ

### Rate Limit対策
- 通常: 5秒間隔で実行
- 100件ごと: 30秒の長期待機
- Rate Limitエラー時: 60秒待機して再試行
- 継続オプション: `--continue`で中断箇所から再開

## Claude Codeカスタムコマンド

### 概要
`.claude/commands/` ディレクトリに自然言語で記述したカスタムコマンドを配置。プロジェクトメンテナンスを効率化。

### 主要コマンド

**日常メンテナンス:**
```bash
/run quick-check        # 軽量チェック（1分）
/run daily-maintenance  # 日次メンテナンス（2-3分）
/run weekly-cleanup     # 週次クリーンアップ（5分）
```

**個別実行:**
```bash
/run update-serena-memory  # Serenaメモリ更新
/run analyze-code-quality  # コード品質分析
/run sync-project-docs     # ドキュメント同期
/run check-todo-items      # TODO管理
```

詳細: `.claude/docs/custom-commands-guide.md`

## テストコマンド

```bash
# 特定ソースのみ収集
npx tsx scripts/collect-feeds.ts "Dev.to"

# 要約生成（Gemini API）
npm run scripts:summarize

# 要約生成（Claude Code）
npm run claude:summarize

# 品質比較
npm run claude:compare

# 記事品質チェック
npx tsx scripts/check-article-quality.ts

# 低品質記事削除
npx tsx scripts/delete-low-quality-articles.ts
```