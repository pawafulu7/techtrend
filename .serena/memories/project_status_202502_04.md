# TechTrend プロジェクト詳細情報 (2025年2月4日更新)

## プロジェクト概要
TechTrendは、複数の技術系メディアから記事を収集・集約・分析するWebアプリケーションです。

### 技術スタック
- **フロントエンド**: Next.js 14+ (App Router)、React、TypeScript
- **バックエンド**: Next.js API Routes、Prisma ORM
- **データベース**: PostgreSQL/SQLite (Prisma経由)
- **キャッシュ**: Redis（ローカル環境移行済み）
- **AI**: OpenAI API（要約生成）
- **プロセス管理**: PM2
- **開発環境**: WSL2 Ubuntu

## アーキテクチャ

### 1. データ収集システム

#### フェッチャー一覧（17種類）
```
RSS系（1時間ごと更新）:
- DevToFetcher: Dev.to記事（反応数10以上、読了時間2分以上）
- QiitaPopularFetcher: Qiita人気記事（ストック数10以上）
- ZennExtendedFetcher: Zennトレンド記事
- HatenaExtendedFetcher: はてなブックマーク技術記事
- PublickeyFetcher: Publickey記事
- StackOverflowBlogFetcher: Stack Overflow Blog
- ThinkITFetcher: Think IT記事
- InfoQJapanFetcher: InfoQ Japan
- GoogleAIFetcher: Google AI Blog
- GoogleDevBlogFetcher: Google Developers Blog
- HuggingFaceFetcher: Hugging Face Blog
- AWSFetcher: AWS公式ブログ
- SREFetcher: SRE Weekly
- RailsReleasesFetcher: Rails Releases
- CorporateTechBlogFetcher: 企業技術ブログ

スクレイピング系（12時間ごと更新）:
- SpeakerDeckFetcher: Speaker Deck日本語プレゼン
```

#### スケジューラー設定
- **ファイル**: `scheduler-v2.ts`
- **cronジョブ**:
  - `0 * * * *`: RSS系ソース更新（毎時0分）
  - `0 0,12 * * *`: スクレイピング系更新（0時・12時）
  - `0 2 * * *`: 要約生成（毎日2時）
  - `0 2 * * 0`: 品質スコア再計算（日曜2時）
  - `0 3 * * *`: 低品質記事削除（毎日3時）
  - `5 5,17 * * *`: Redis状態チェック（5時5分・17時5分）

### 2. データ処理パイプライン

#### 処理フロー
1. **記事収集**: 各フェッチャーが外部ソースから記事取得
2. **品質フィルタリング**: ソース別の基準で低品質記事を除外
3. **データ保存**: Prisma経由でDBに保存（重複チェック含む）
4. **要約生成**: `generate-summaries.ts`で日本語要約を生成（OpenAI API使用）
5. **品質スコア計算**: 記事の質を数値化（0-100）
6. **タグ分類**: 記事のタグを自動カテゴライズ

### 3. CLI管理ツール

#### メインコマンド: `npm run techtrend`
```
サブコマンド:
- feeds: フィード管理（collect, sources, stats）
- summaries: 要約管理（generate, regenerate, check）
- quality-scores: 品質スコア管理（calculate, fix, stats）
- cleanup: クリーンアップ（articles, tags, stats）
- tags: タグ管理（list, stats, clean, categorize）
```

### 4. データモデル（Prisma Schema概要）

#### 主要エンティティ
- **Article**: 記事（ID、URL、タイトル、要約、コンテンツ、品質スコア等）
- **Source**: ソース（名前、タイプ、有効/無効状態）
- **Tag**: タグ（名前、カテゴリ）
- **User**: ユーザー
- **Favorite**: お気に入り
- **ReadingList**: 読みリスト

### 5. Web UI

#### ページ構成（App Router）
```
app/
├── (dashboard)/        # ダッシュボード
├── analytics/          # 分析ページ
├── articles/           # 記事詳細
├── favorites/          # お気に入り
├── popular/            # 人気記事
├── reading-list/       # 読みリスト
├── search/            # 検索
├── sources/           # ソース一覧
├── stats/             # 統計
├── tags/              # タグ一覧
└── trends/            # トレンド
```

### 6. 品質管理システム

#### 品質フィルタリング基準
- **Dev.to**: 反応数10以上、読了時間2分以上
- **Qiita**: ストック数10以上、24時間以内
- **Zenn**: デイリートレンドフィード使用
- **Speaker Deck**: 日本語、Views数基準

#### 品質スコア計算要素
- ソースの信頼性
- 記事の反応数/ストック数
- 公開からの経過時間
- コンテンツ長
- タグの質

### 7. 最近の更新状況

#### 2025年2月の主な変更
1. **Redis移行完了**: ローカルRedis環境への完全移行
2. **Speaker Deck機能改善**: Views数/日付フィルタリング実装
3. **キャッシュ機能強化**: ステータスヘッダー修正
4. **テスト追加**: Redis移行後のintegrationテスト

#### 技術的負債と改善計画
- serenaメモリに詳細な改善計画あり
- Phase 0リファクタリング進行中
- テストインフラの改善が必要

### 8. 運用上の重要事項

#### 絶対守るべきルール
1. **要約生成**: フェッチャーで `summary: undefined` 設定必須
2. **要約は必ず日本語**: `generate-summaries.ts`でのみ生成
3. **作業後のコミット**: 機能追加・修正後は都度コミット

#### デバッグ用スクリプト
```bash
# 特定ソースのみ収集
npx tsx scripts/collect-feeds.ts "Dev.to"

# 要約生成
npm run scripts:summarize

# 品質チェック
npx tsx scripts/check-article-quality.ts

# 低品質記事削除
npx tsx scripts/delete-low-quality-articles.ts
```

## プロジェクト構成の特徴

### 強み
- 多様なソースからの自動収集
- 品質フィルタリングによる質の担保
- 日本語要約による価値向上
- CLIによる柔軟な管理
- スケジューラーによる自動化

### 課題
- テストカバレッジ不足
- エラーハンドリングの改善余地
- パフォーマンス最適化の余地
- ドキュメント整備の必要性

## 開発環境情報
- Node.js: nvm管理
- パッケージマネージャー: npm
- TypeScript設定: tsconfig.json
- ESLint設定: eslint.config.mjs
- Jest設定: jest.config.js（単体）、jest.config.integration.js（統合）
- PM2設定: ecosystem.config.js