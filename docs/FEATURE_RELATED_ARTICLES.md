# 関連記事レコメンド機能 - 詳細設計書

作成日: 2025-01-29

## 1. 機能概要

### 目的
ユーザーが読んでいる記事に関連する他の記事を自動的に推薦し、関連する技術情報の発見を支援する。

### 主な機能
- 記事詳細ページに「関連記事」セクションを追加
- タグベースの類似度計算
- コンテンツベースの類似度計算（将来的拡張）
- 最大10件の関連記事を表示

## 2. 技術設計

### 2.1 アルゴリズム

#### 基本アプローチ: タグベース類似度
```typescript
// 類似度計算の基本ロジック
function calculateSimilarity(articleA: Article, articleB: Article): number {
  const tagsA = new Set(articleA.tags.map(t => t.id));
  const tagsB = new Set(articleB.tags.map(t => t.id));
  
  // Jaccard係数を使用
  const intersection = new Set([...tagsA].filter(x => tagsB.has(x)));
  const union = new Set([...tagsA, ...tagsB]);
  
  return intersection.size / union.size;
}
```

#### 拡張アプローチ: 重み付き類似度
- タグの重要度による重み付け
- 記事の品質スコアによる調整
- 時系列による減衰（新しい記事を優先）

### 2.2 データベース設計

既存のスキーマを活用し、新しいテーブルは追加しない。

#### 利用する既存テーブル
- `Article`: 記事情報
- `Tag`: タグ情報
- `_ArticleToTag`: 記事とタグの関連

#### インデックス最適化
```sql
-- タグベースの検索を高速化
CREATE INDEX idx_article_tag_lookup ON _ArticleToTag(B, A);
```

### 2.3 API設計

#### エンドポイント
```
GET /api/articles/[id]/related
```

#### レスポンス
```typescript
interface RelatedArticlesResponse {
  articles: Array<{
    id: string;
    title: string;
    summary: string;
    url: string;
    source: string;
    publishedAt: string;
    qualityScore: number;
    tags: Array<{
      id: string;
      name: string;
    }>;
    similarity: number; // 0-1の類似度スコア
  }>;
  metadata: {
    algorithm: string;
    timestamp: string;
  };
}
```

### 2.4 実装計画

#### Phase 1: 基本実装
1. APIエンドポイントの作成
2. タグベース類似度計算の実装
3. 基本的なフィルタリング（同一ソース除外など）

#### Phase 2: 最適化
1. キャッシュ機構の実装
2. バッチ処理による事前計算
3. パフォーマンスチューニング

#### Phase 3: 拡張
1. コンテンツベース類似度の追加
2. ユーザー行動に基づく学習
3. パーソナライズ化

## 3. フロントエンド設計

### 3.1 コンポーネント構造

```typescript
// components/RelatedArticles.tsx
interface RelatedArticlesProps {
  articleId: string;
  maxItems?: number;
}

export function RelatedArticles({ articleId, maxItems = 10 }: RelatedArticlesProps) {
  // 実装
}
```

### 3.2 UI/UXデザイン

#### 表示位置
- 記事本文の下部
- サイドバー（デスクトップ表示時）

#### 表示形式
- カード形式での表示
- タイトル、要約、タグ、類似度スコアを表示
- ホバー時にプレビュー表示（将来的機能）

### 3.3 レスポンシブデザイン
- モバイル: 縦スクロールリスト
- タブレット: 2カラムグリッド
- デスクトップ: 3カラムグリッドまたはサイドバー

## 4. パフォーマンス考慮事項

### 4.1 キャッシュ戦略
- Redisを使用した結果キャッシュ（将来的実装）
- ブラウザキャッシュの活用
- キャッシュ有効期限: 1時間

### 4.2 最適化
- 類似度計算の事前実行
- インデックスの適切な配置
- N+1問題の回避

## 5. テスト計画

### 5.1 単体テスト
- 類似度計算アルゴリズムのテスト
- APIエンドポイントのテスト
- エッジケースの処理

### 5.2 統合テスト
- 実際のデータでの動作確認
- パフォーマンステスト
- UIコンポーネントのテスト

## 6. 監視・分析

### 6.1 メトリクス
- API応答時間
- キャッシュヒット率
- クリック率（CTR）

### 6.2 ログ
- エラーログ
- パフォーマンスログ
- ユーザー行動ログ

## 7. セキュリティ考慮事項

- SQLインジェクション対策（Prismaで自動的に対応）
- レート制限の実装
- 適切なエラーハンドリング

## 8. 実装チェックリスト

- [ ] APIエンドポイントの作成
- [ ] 類似度計算ロジックの実装
- [ ] データベースインデックスの追加
- [ ] フロントエンドコンポーネントの作成
- [ ] スタイリングの実装
- [ ] 単体テストの作成
- [ ] 統合テストの作成
- [ ] パフォーマンステスト
- [ ] ドキュメントの更新
- [ ] コードレビュー
- [ ] デプロイ