# TechTrend データベース設計（2025年2月）

## データベース基本情報
- **DBMS**: SQLite
- **ORM**: Prisma v6.12.0
- **マイグレーション**: Prisma Migrate
- **ファイル**: `prisma/dev.db`

## スキーマ定義（prisma/schema.prisma）

### Article（記事）テーブル
```prisma
model Article {
  id              String   @id @default(cuid())
  title           String
  url             String   @unique
  summary         String?
  thumbnail       String?
  content         String?
  publishedAt     DateTime
  sourceId        String
  bookmarks       Int      @default(0)
  qualityScore    Float    @default(0)
  userVotes       Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  difficulty      String?
  detailedSummary String?
  articleType     String?
  summaryVersion  Int      @default(1)
  source          Source   @relation(fields: [sourceId], references: [id])
  tags            Tag[]    @relation("ArticleToTag")
}
```

**フィールド説明**:
- `id`: CUID形式の一意識別子
- `title`: 記事タイトル
- `url`: 記事URL（ユニーク制約）
- `summary`: AI生成要約（60-80文字）
- `thumbnail`: サムネイル画像URL
- `content`: 記事本文（一部ソースのみ）
- `publishedAt`: 公開日時
- `sourceId`: ソースへの外部キー
- `bookmarks`: ブックマーク数
- `qualityScore`: 品質スコア（0-100）
- `userVotes`: ユーザー投票数
- `difficulty`: 難易度（beginner/intermediate/advanced）
- `detailedSummary`: 詳細要約（将来実装用）
- `articleType`: 記事タイプ（5種類）
  - release: リリース・更新情報
  - problem-solving: 問題解決
  - tutorial: チュートリアル
  - tech-intro: 技術紹介
  - implementation: 実装例
- `summaryVersion`: 要約バージョン管理

### Source（ソース）テーブル
```prisma
model Source {
  id        String    @id @default(cuid())
  name      String    @unique
  type      String
  url       String
  enabled   Boolean   @default(true)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  articles  Article[]
}
```

**フィールド説明**:
- `id`: CUID形式の一意識別子
- `name`: ソース名（ユニーク制約）
- `type`: ソースタイプ（rss/api/scraping）
- `url`: ソースのベースURL
- `enabled`: 有効/無効フラグ
- `articles`: 関連記事（1対多）

### Tag（タグ）テーブル
```prisma
model Tag {
  id       String    @id @default(cuid())
  name     String    @unique
  category String?
  articles Article[] @relation("ArticleToTag")
}
```

**フィールド説明**:
- `id`: CUID形式の一意識別子
- `name`: タグ名（ユニーク制約）
- `category`: タグカテゴリ
- `articles`: 関連記事（多対多）

## インデックス設計

### 実装済みインデックス
1. **Article.url**: ユニークインデックス（重複防止）
2. **Article.sourceId**: 外部キーインデックス
3. **Article.publishedAt**: 日付ソート用
4. **Article.qualityScore**: 品質ソート用
5. **Source.name**: ユニークインデックス
6. **Tag.name**: ユニークインデックス

### パフォーマンスインデックス（2025/08/01追加）
```sql
-- 複合インデックス
CREATE INDEX idx_articles_source_published ON Article(sourceId, publishedAt DESC);
CREATE INDEX idx_articles_quality_published ON Article(qualityScore DESC, publishedAt DESC);

-- カバリングインデックス
CREATE INDEX idx_articles_list_view ON Article(
  publishedAt DESC, 
  qualityScore, 
  sourceId
) INCLUDE (title, summary, thumbnail);
```

## 全文検索（FTS5）

### articles_fts テーブル
```sql
CREATE VIRTUAL TABLE articles_fts USING fts5(
  id UNINDEXED,
  title,
  summary,
  content,
  content=Article,
  tokenize='unicode61'
);
```

**検索対象フィールド**:
- title: 記事タイトル
- summary: 要約
- content: 本文

**トリガー設定**:
- INSERT時: 自動インデックス追加
- UPDATE時: インデックス更新
- DELETE時: インデックス削除

## リレーション設計

### 1対多リレーション
- Source → Article: 1つのソースが複数記事を持つ
- カスケード削除: ソース削除時に関連記事も削除

### 多対多リレーション
- Article ↔ Tag: 中間テーブル自動生成（_ArticleToTag）
- 記事は複数タグを持ち、タグは複数記事に付与される

## データ整合性

### 制約
- **ユニーク制約**: Article.url, Source.name, Tag.name
- **NOT NULL制約**: 必須フィールド（title, url, publishedAt等）
- **デフォルト値**: qualityScore=0, bookmarks=0, enabled=true

### トランザクション
- 記事作成時: 記事、タグ、関連をトランザクション内で処理
- バッチ更新: 複数記事の更新を1トランザクションで実行

## マイグレーション履歴

### 初期スキーマ（2025/07/26）
- 基本テーブル作成
- 基本インデックス設定

### 品質スコア追加（2025/07/28）
- qualityScoreフィールド追加
- デフォルト値0設定

### 難易度レベル追加（2025/07/28）
- difficultyフィールド追加

### 詳細要約追加（2025/07/30）
- detailedSummaryフィールド追加

### タグカテゴリ追加（2025/08/01）
- Tag.categoryフィールド追加

### パフォーマンスインデックス（2025/08/01）
- 複合インデックス追加
- カバリングインデックス追加

### 記事タイプ追加（2025/08/04）
- articleTypeフィールド追加
- summaryVersionフィールド追加

## データ量と成長予測

### 現在のデータ量（2025年2月）
- Article: 約10,000件
- Source: 17件
- Tag: 約500件
- 日次増加: 約200-300記事

### ストレージ最適化
- TEXT型フィールドの圧縮
- 古い記事の定期削除（3ヶ月以上）
- サムネイルURLの外部化検討

## バックアップ戦略
- 日次バックアップ: SQLiteファイルコピー
- 週次エクスポート: JSON形式
- バックアップスクリプト: `scripts/backup.sh`

## パフォーマンス考慮事項
1. **N+1問題**: Prismaのinclude/selectで対策
2. **大量データ**: ページネーション必須
3. **検索性能**: FTS5インデックス活用
4. **キャッシュ**: Redisで頻繁アクセスデータを保持