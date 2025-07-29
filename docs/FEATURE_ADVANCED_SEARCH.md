# 高度な検索機能 - 詳細設計書

作成日: 2025-01-29

## 1. 機能概要

### 目的
ユーザーが蓄積された記事から効率的に必要な情報を見つけられるようにする。

### 主な機能
- 全文検索（タイトル、要約、コンテンツ）
- タグによるフィルタリング（複数選択可）
- ソース（メディア）によるフィルタリング
- 期間指定検索
- 難易度フィルタリング
- 並び替え（関連度、新着順、人気順）
- 検索履歴の保存（ローカル）
- 検索条件の保存機能

## 2. 技術設計

### 2.1 検索エンジン

#### 方式1: SQLiteの全文検索（FTS5）- 推奨
- SQLiteの組み込み全文検索機能を使用
- メリット: 
  - 追加のインフラ不要
  - 高速な全文検索
  - 日本語対応（適切なトークナイザー設定で）
- デメリット:
  - 高度な検索機能には限界

#### 方式2: クライアントサイド検索
- Fuse.jsなどのJavaScriptライブラリを使用
- メリット: 
  - サーバー負荷なし
  - リアルタイム検索
- デメリット:
  - 大量データでパフォーマンス低下
  - 初期ロードが重い

### 2.2 データベース設計

#### FTS5テーブルの作成
```sql
CREATE VIRTUAL TABLE articles_fts USING fts5(
  id,
  title,
  summary,
  content,
  tags,
  source,
  publishedAt,
  difficulty,
  content=Article,
  tokenize='unicode61'
);
```

#### インデックス追加
```sql
CREATE INDEX idx_articles_published_at ON Article(publishedAt);
CREATE INDEX idx_articles_source_id ON Article(sourceId);
CREATE INDEX idx_articles_difficulty ON Article(difficulty);
```

### 2.3 API設計

#### 検索エンドポイント
```typescript
// GET /api/articles/search
interface SearchQuery {
  q?: string;              // 検索クエリ
  tags?: string[];         // タグフィルター
  sources?: string[];      // ソースフィルター
  difficulty?: string[];   // 難易度フィルター
  dateFrom?: string;       // 開始日
  dateTo?: string;         // 終了日
  sortBy?: 'relevance' | 'date' | 'popularity';
  page?: number;
  limit?: number;
}

interface SearchResponse {
  articles: ArticleWithRelations[];
  totalCount: number;
  facets: {
    tags: { name: string; count: number }[];
    sources: { name: string; count: number }[];
    difficulty: { level: string; count: number }[];
  };
}
```

### 2.4 UI/UX設計

#### 検索インターフェース
1. **検索バー**
   - ヘッダーに常時表示
   - オートコンプリート機能
   - 検索履歴サジェスト

2. **フィルターパネル**
   - サイドバーまたはドロップダウン
   - 選択中のフィルターを視覚的に表示
   - フィルターのクリアボタン

3. **検索結果**
   - ハイライト表示
   - ファセット検索（結果の絞り込み）
   - 無限スクロール

4. **検索履歴・保存検索**
   - ローカルストレージに保存
   - よく使う検索条件の保存

## 3. 実装計画

### Phase 1: 基本検索機能
1. FTS5テーブルの作成
2. 検索APIエンドポイントの実装
3. 基本的な検索UIの実装

### Phase 2: フィルター機能
1. タグ・ソース・難易度フィルター
2. 期間指定フィルター
3. ファセット検索

### Phase 3: 高度な機能
1. 検索履歴の保存
2. 検索条件の保存
3. オートコンプリート

## 4. パフォーマンス考慮事項

### 4.1 インデックス最適化
- 適切なインデックスの作成
- 定期的なVACUUM実行

### 4.2 キャッシング
- 検索結果のメモリキャッシュ
- よく使われる検索条件の結果をキャッシュ

### 4.3 ページネーション
- 大量の検索結果に対応
- 無限スクロールの実装

## 5. 実装チェックリスト

### データベース
- [ ] FTS5テーブルの作成
- [ ] インデックスの追加
- [ ] 既存データのマイグレーション

### API
- [ ] 検索エンドポイントの実装
- [ ] クエリパラメータの検証
- [ ] ファセット集計の実装
- [ ] ページネーションの実装

### フロントエンド
- [ ] 検索バーコンポーネント
- [ ] フィルターパネルコンポーネント
- [ ] 検索結果コンポーネント
- [ ] 検索履歴管理
- [ ] キーボードショートカット

### テスト
- [ ] 検索精度のテスト
- [ ] パフォーマンステスト
- [ ] エッジケースのテスト

## 6. 検索クエリ例

### 基本検索
- "React hooks" - React hooksに関する記事
- "TypeScript OR JavaScript" - どちらかを含む記事
- "Next.js -routing" - routingを含まない記事

### 高度な検索
- タグ: ["React", "TypeScript"] かつ 難易度: "intermediate"
- ソース: "Zenn" かつ 期間: 過去7日間
- "performance" かつ タグ: "optimization"