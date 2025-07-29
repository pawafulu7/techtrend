# TechTrend - CLAUDE.md

このファイルは、Claude Codeがこのプロジェクトで作業する際の重要な注意事項とガイドラインです。

**重要: 修正作業を行う前に、必ず `CODE-MAINTENANCE-GUIDE.md` を確認してください。**
このガイドには、影響範囲の把握方法、関連箇所の確認手順、検証方法が詳しく記載されています。

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

## テストコマンド

```bash
# 特定ソースのみ収集
npx tsx scripts/collect-feeds.ts "Dev.to"

# 要約生成
npm run scripts:summarize

# 記事品質チェック
npx tsx scripts/check-article-quality.ts

# 低品質記事削除
npx tsx scripts/delete-low-quality-articles.ts
```