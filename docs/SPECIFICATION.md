# TechTrend システム仕様書

最終更新日: 2025年1月28日

## 目次

1. [システム概要](#システム概要)
2. [アーキテクチャ](#アーキテクチャ)
3. [機能一覧](#機能一覧)
4. [データベース設計](#データベース設計)
5. [API仕様](#api仕様)
6. [スケジューラー仕様](#スケジューラー仕様)
7. [品質管理仕様](#品質管理仕様)
8. [運用・保守](#運用保守)

## システム概要

TechTrendは、複数の技術情報源から最新の記事を収集し、AIによる要約・タグ付け・品質評価を行い、ユーザーに提供するWebアプリケーションです。

### 主な特徴

- **多様な情報源**: 15種類の技術ブログ・フィードから記事を収集
- **AI要約**: Gemini APIを使用した日本語要約の自動生成
- **品質管理**: 記事の品質スコアリング（0-100点）と低品質記事の自動フィルタリング
- **タグシステム**: AI生成タグとマルチタグフィルタリング（AND/OR検索）
- **トレンド分析**: 急上昇キーワードと人気タグの可視化
- **難易度判定**: 記事の技術レベルを初級・中級・上級に自動分類

### 技術スタック

- **フロントエンド**: Next.js 15 (App Router), React 19, Tailwind CSS
- **バックエンド**: Next.js API Routes, Prisma ORM
- **データベース**: SQLite
- **AI/ML**: Google Gemini API (gemini-1.5-flash)
- **スケジューラー**: Node.js + node-cron
- **プロセス管理**: PM2

## アーキテクチャ

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   情報源        │     │   スケジューラー  │     │   Webアプリ     │
│   (15種類)      │◀────│   (node-cron)   │────▶│   (Next.js)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         │                       ▼                       ▼
         │              ┌─────────────────┐     ┌─────────────────┐
         └─────────────▶│   Gemini API    │     │   SQLite DB     │
                        └─────────────────┘     └─────────────────┘
```

## 機能一覧

### 1. 記事収集機能

#### 対応情報源（15種類）

**RSS系（毎時更新）**
- はてなブックマーク (テクノロジーカテゴリ)
- Zenn (トレンド記事)
- Dev.to (最新記事)
- Publickey
- Stack Overflow Blog
- Think IT
- Rails Releases
- AWS (Security, What's New, Blog統合)
- SRE (複数ソース統合)
- Google Developers Blog

**スクレイピング系（12時間ごと更新）**
- Speaker Deck (トレンド＋有名スピーカー)

**特殊更新**
- Qiita Popular (5:05, 17:05更新)

### 2. AI処理機能

#### 要約生成
- Gemini APIを使用した60-80文字の日本語要約
- 「本記事は」などの枕詞を自動削除
- 文頭の句読点を修正

#### タグ生成
- 記事内容から3-5個の技術タグを自動生成
- タグの正規化（例: javascript → JavaScript）
- 取得元情報はタグに含めない

### 3. 品質管理機能

#### 品質スコアリング（100点満点）
- タグの質と量（30点）
- 要約の充実度（20点）
- ソースの信頼性（20点）
- 新鮮さ（15点）
- エンゲージメント（15点）
- クリックベイトペナルティ（減点）
- ユーザー投票ボーナス（加点）

#### フィルタリング
- 品質スコア30点未満の記事を自動的に非表示
- 重複記事の検出（Levenshtein距離ベース）

### 4. 難易度判定機能

記事の内容とタグから技術レベルを判定：
- **初級（beginner）**: 入門、基礎、チュートリアルなど
- **中級（intermediate）**: 実装、設計、最適化など
- **上級（advanced）**: アーキテクチャ、内部実装、研究など

### 5. ユーザー機能

#### 検索・フィルタリング
- キーワード検索（タイトル・要約対象）
- ソース別フィルタ
- タグフィルタ（複数選択、AND/OR切り替え）
- 難易度フィルタ

#### インタラクション
- ユーザー投票（いいねボタン）
- ページネーション（20件/ページ）
- レスポンシブデザイン

### 6. 統計・分析機能

#### 統計ページ
- 総記事数、ソース数、タグ数の表示
- 日別記事数推移（30日間、積み上げ棒グラフ）
- ソース別記事分布（円グラフ）
- 人気タグクラウド

#### トレンド分析ページ
- 急上昇キーワード（成長率表示）
- 新規タグ（過去24時間）
- 人気タグランキング

## データベース設計

### テーブル構成

#### Source（情報源）
```prisma
model Source {
  id        String    @id @default(cuid())
  name      String    @unique
  type      SourceType
  url       String
  enabled   Boolean   @default(true)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  articles  Article[]
}
```

#### Article（記事）
```prisma
model Article {
  id           String    @id @default(cuid())
  title        String
  url          String    @unique
  summary      String?
  thumbnail    String?
  description  String?
  content      String?
  publishedAt  DateTime
  sourceId     String
  bookmarks    Int       @default(0)
  qualityScore Float     @default(0)
  userVotes    Int       @default(0)
  difficulty   String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  source       Source    @relation(fields: [sourceId], references: [id])
  tags         Tag[]     @relation("ArticleToTag")
}
```

#### Tag（タグ）
```prisma
model Tag {
  id       String    @id @default(cuid())
  name     String    @unique
  articles Article[] @relation("ArticleToTag")
}
```

### インデックス
- Article.url (UNIQUE)
- Article.sourceId
- Article.publishedAt
- Article.qualityScore
- Tag.name (UNIQUE)

## API仕様

### エンドポイント一覧

#### 記事関連
- `GET /api/articles` - 記事一覧取得
  - Query Parameters:
    - `page`: ページ番号
    - `search`: 検索キーワード
    - `sourceId`: ソースID
    - `tags`: タグ名（カンマ区切り）
    - `tagMode`: AND/OR
    - `difficulty`: 難易度フィルタ

- `POST /api/articles/[id]/vote` - 記事に投票

#### 統計関連
- `GET /api/stats` - 統計情報取得

#### トレンド関連
- `GET /api/trends/keywords` - 急上昇キーワード取得
- `GET /api/trends/analysis` - トレンド分析データ取得

#### フィード収集
- `POST /api/feeds/collect` - 手動フィード収集

## スケジューラー仕様

### 更新スケジュール

| タイミング | 処理内容 | 対象 |
|-----------|---------|------|
| 毎時0分 | 記事収集→要約生成→品質評価→難易度判定 | RSS系ソース |
| 0時・12時 | 記事収集→要約生成→品質評価→難易度判定 | スクレイピング系 |
| 5:05・17:05 | 記事収集→要約生成→品質評価→難易度判定 | Qiita Popular |
| 毎日3時 | 低品質記事削除、タグクリーンアップ | 全記事 |

### 処理フロー

1. **記事収集** (`collect-feeds.ts`)
   - 各フェッチャーが情報源から記事を取得
   - URLベースの重複チェック
   - タイトルの類似性チェック（85%閾値）

2. **要約・タグ生成** (`generate-summaries.ts`)
   - 要約がない記事、英語要約、途切れた要約、タグなし記事を対象
   - Gemini APIでバッチ処理（3件ずつ）
   - レート制限対策（2秒待機）

3. **品質スコア計算** (`calculate-quality-scores.ts`)
   - 全記事の品質スコアを再計算
   - スコア分布の統計表示

4. **難易度判定** (`calculate-difficulty-levels.ts`)
   - キーワードベースで難易度を判定
   - 既存の難易度は上書きしない

5. **クリーンアップ** 
   - 品質スコア30未満の記事を削除
   - 使用されていないタグを削除
   - 空のタグ名を削除

## 品質管理仕様

### 品質スコア計算ロジック

```typescript
function calculateQualityScore(article) {
  let score = 0;
  
  // タグの質（最大30点）
  const tagCount = article.tags.length;
  if (tagCount >= 5) score += 30;
  else if (tagCount >= 3) score += 20;
  else if (tagCount >= 1) score += 10;
  
  // 要約の質（最大20点）
  if (summary && summary.length >= 50) score += 20;
  else if (summary && summary.length >= 30) score += 10;
  
  // ソースの信頼性（最大20点）
  const reliableSources = ['Publickey', 'AWS', 'Google Developers Blog'];
  if (reliableSources.includes(source.name)) score += 20;
  else score += 10;
  
  // 新鮮さ（最大15点）
  const ageInDays = (now - publishedAt) / (1000 * 60 * 60 * 24);
  if (ageInDays <= 1) score += 15;
  else if (ageInDays <= 3) score += 10;
  else if (ageInDays <= 7) score += 5;
  
  // エンゲージメント（最大15点）
  if (bookmarks >= 100) score += 15;
  else if (bookmarks >= 50) score += 10;
  else if (bookmarks >= 10) score += 5;
  
  // クリックベイトペナルティ
  if (title.includes('!!') || title.includes('？？')) score -= 10;
  
  // ユーザー投票ボーナス
  score += Math.min(userVotes * 2, 20);
  
  return Math.max(0, Math.min(100, score));
}
```

### 重複検出

- Levenshtein距離による類似度計算
- タイトルの80%以上が一致する場合は重複と判定
- キーワードの重複率も考慮

## 運用・保守

### 起動方法

#### 開発環境
```bash
# Webアプリケーション
npm run dev

# スケジューラー
npm run scheduler:v2
```

#### 本番環境
```bash
# Webアプリケーション
npm run build
npm run start

# スケジューラー（PM2）
npm run scheduler:start
```

### ログ管理

PM2によるログ管理：
- エラーログ: `logs/scheduler-error.log`
- 標準出力: `logs/scheduler-out.log`
- 統合ログ: `logs/scheduler-combined.log`

### 環境変数

必須の環境変数（`.env.local`）：
```
DATABASE_URL="file:./prisma/dev.db"
GEMINI_API_KEY="your-api-key-here"
```

### メンテナンスコマンド

```bash
# データベースマイグレーション
npm run prisma:migrate

# 手動での記事収集
npm run scripts:collect

# 手動での要約生成
npm run scripts:summarize

# 品質スコア再計算
npx tsx scripts/calculate-quality-scores.ts

# 低品質記事のクリーンアップ
npx tsx scripts/cleanup-low-quality-articles.ts
```

### バックアップ

SQLiteデータベースファイルの定期バックアップを推奨：
- `prisma/dev.db`
- `prisma/dev.db-journal`（存在する場合）

### パフォーマンス最適化

1. **インデックス**: 主要なクエリパスに対してインデックスを設定済み
2. **ページネーション**: 大量データの表示には20件ずつのページネーションを使用
3. **キャッシュ**: Next.jsの自動キャッシュ機能を活用
4. **バッチ処理**: AI API呼び出しは3件ずつのバッチで処理

### セキュリティ

1. **API保護**: Gemini APIキーは環境変数で管理
2. **入力検証**: Prismaによる自動的な入力検証
3. **SQLインジェクション対策**: Prismaの型安全なクエリビルダーを使用
4. **XSS対策**: Reactの自動エスケープ機能を活用

### 今後の拡張可能性

1. **コミュニティ機能**: コメント、ブックマーク、共有機能
2. **パーソナライゼーション**: ユーザーの興味に基づくレコメンデーション
3. **通知機能**: 特定のタグやキーワードの新着記事通知
4. **多言語対応**: 英語記事の日本語翻訳
5. **外部連携**: Slack、Discord等への自動投稿