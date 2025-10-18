# キャッシュ無効化ポリシー

## 1. 概要

このドキュメントは、TechTrendプロジェクトにおけるキャッシュ無効化戦略を定義します。
DBアクセス最適化Phase 3.3の実装において、データの一貫性とパフォーマンスの両立を実現します。

## 2. キャッシュレイヤー構成

### 2.1 階層構造

```
┌─────────────────────────────────────┐
│     クライアント (Browser)           │
└─────────────────────────────────────┘
                ↓
┌─────────────────────────────────────┐
│   L1: Memory Cache (Request Scope)  │  TTL: 60秒
└─────────────────────────────────────┘
                ↓
┌─────────────────────────────────────┐
│      L2: Redis Cache (Shared)       │  TTL: 5-30分
└─────────────────────────────────────┘
                ↓
┌─────────────────────────────────────┐
│        Database (PostgreSQL)        │
└─────────────────────────────────────┘
```

### 2.2 各レイヤーの役割

| レイヤー | 用途 | TTL | スコープ |
|---------|------|-----|----------|
| Memory Cache | リクエスト内での重複排除 | 60秒 | リクエスト |
| Redis Cache | ユーザー間での共有 | 5-30分 | アプリケーション全体 |
| Database | 永続化層 | - | - |

## 3. キャッシュ種別とTTL戦略

### 3.1 データ種別ごとのTTL設定

| データ種別 | TTL | 理由 |
|-----------|-----|------|
| タグマッピング | 15分 | 変更頻度が低い |
| ソースマッピング | 30分 | ほぼ静的データ |
| 記事一覧 | 5分 | 更新頻度が中程度 |
| お気に入り状態 | 1分 | ユーザー操作で即時変更 |
| 既読状態 | 1分 | ユーザー操作で即時変更 |
| 記事総数 | 5分 | パフォーマンス重視 |
| 人気タグ | 60分 | 計算コストが高い |

### 3.2 TTL決定の原則

1. **更新頻度ベース**: 更新頻度が低いデータほど長いTTL
2. **計算コストベース**: 計算コストが高いデータほど長いTTL
3. **ユーザー体験優先**: ユーザーが変更したデータは短いTTL

## 4. 無効化トリガーと戦略

### 4.1 即時無効化（Immediate Invalidation）

#### 対象操作
- お気に入りの追加/削除
- 既読状態の更新
- 記事の追加/更新/削除
- タグの追加/更新/削除

#### 実装方法

```typescript
// 例: お気に入り更新時の無効化
async function updateFavorite(userId: string, articleId: string) {
  // 1. データベース更新
  await prisma.favorite.upsert({...});

  // 2. 関連キャッシュの無効化
  await Promise.all([
    cache.delete(`favorites:${userId}:*`),        // ユーザーのお気に入り
    cache.delete(`article:${articleId}:favorites`), // 記事のお気に入り数
    cache.delete(`user:${userId}:stats`),         // ユーザー統計
  ]);

  // 3. 全ノードへの通知（Redis Pub/Sub）
  await redis.publish('cache:invalidate', {
    type: 'favorite',
    userId,
    articleId,
  });
}
```

### 4.2 遅延無効化（Lazy Invalidation）

#### 対象データ
- 統計情報
- 集計データ
- ランキング

#### 実装方法
- TTL期限切れによる自動無効化
- バックグラウンドジョブによる定期更新

### 4.3 部分無効化（Partial Invalidation）

#### 対象シナリオ
- タグフィルタ変更
- ソースフィルタ変更
- 検索条件変更

#### 実装方法

```typescript
// パターンマッチングによる部分無効化
async function invalidateByPattern(pattern: string) {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

// 例: 特定タグを含むキャッシュのみ無効化
await invalidateByPattern(`articles:*:tags:${tagId}:*`);
```

## 5. 分散環境での同期

### 5.1 Redis Pub/Sub による通知

```typescript
// パブリッシャー側
class CacheInvalidator {
  async invalidate(event: InvalidationEvent) {
    // ローカルキャッシュクリア
    this.localCache.clear(event.pattern);

    // 他ノードへ通知
    await redis.publish('cache:invalidation', event);
  }
}

// サブスクライバー側
class CacheSubscriber {
  constructor() {
    redis.subscribe('cache:invalidation');
    redis.on('message', (channel, message) => {
      const event = JSON.parse(message);
      this.localCache.clear(event.pattern);
    });
  }
}
```

### 5.2 イベント種別

| イベント | 説明 | ペイロード |
|---------|------|-----------|
| article.created | 記事作成 | `{ articleId, sourceId, tags }` |
| article.updated | 記事更新 | `{ articleId, changes }` |
| article.deleted | 記事削除 | `{ articleId }` |
| favorite.changed | お気に入り変更 | `{ userId, articleId, action }` |
| view.marked | 既読マーク | `{ userId, articleId }` |
| tag.updated | タグ更新 | `{ tagId, name }` |

## 6. キャッシュキー設計

### 6.1 命名規則

```
namespace:entity:identifier:filter:version
```

例:
- `@techtrend/cache:articles:list:page1:v1`
- `@techtrend/cache:tags:mapping:all:v1`
- `@techtrend/cache:user:123:favorites:v1`

### 6.2 バージョニング戦略

- スキーマ変更時はバージョンをインクリメント
- 古いバージョンは自動的にTTLで削除
- マイグレーション期間中は両バージョンを並行運用

## 7. モニタリングとメトリクス

### 7.1 監視対象メトリクス

| メトリクス | 閾値 | アラート |
|-----------|------|----------|
| キャッシュヒット率 | < 70% | Warning |
| キャッシュミス率 | > 30% | Warning |
| 無効化頻度 | > 100/分 | Info |
| Redis メモリ使用率 | > 80% | Critical |
| 無効化遅延 | > 100ms | Warning |

### 7.2 ログ出力

```typescript
// キャッシュ操作のログ
logger.info({
  action: 'cache_invalidate',
  pattern: pattern,
  affected_keys: count,
  duration: elapsed,
  trigger: 'user_action',
});
```

## 8. エラーハンドリング

### 8.1 キャッシュ障害時の動作

1. **Redis接続エラー**: データベースへ直接アクセス（フォールバック）
2. **部分的な無効化失敗**: リトライ後、全キャッシュクリア
3. **Pub/Sub通信エラー**: ローカルキャッシュのみクリア、ログ記録

### 8.2 リトライ戦略

```typescript
const retryOptions = {
  attempts: 3,
  delay: 100,  // ms
  multiplier: 2,  // exponential backoff
  maxDelay: 1000,
};
```

## 9. パフォーマンス最適化

### 9.1 バッチ無効化

```typescript
// 複数キーの一括無効化
async function batchInvalidate(keys: string[]) {
  const chunks = chunk(keys, 100);  // 100キーずつ処理
  await Promise.all(
    chunks.map(chunk => redis.del(...chunk))
  );
}
```

### 9.2 非同期無効化

```typescript
// クリティカルパス外での無効化
async function asyncInvalidate(pattern: string) {
  // 即座にレスポンスを返す
  setImmediate(async () => {
    await invalidateByPattern(pattern);
  });
}
```

## 10. テスト戦略

### 10.1 単体テスト

- キャッシュヒット/ミスのシナリオ
- TTL期限切れの動作
- 無効化パターンのマッチング

### 10.2 統合テスト

- 分散環境での同期テスト
- 障害時のフォールバック
- パフォーマンステスト

### 10.3 負荷テスト

- 高頻度更新時の動作
- 大量キー無効化の性能
- メモリ使用量の監視

## 11. 運用手順

### 11.1 手動キャッシュクリア

```bash
# 全キャッシュクリア
redis-cli FLUSHDB

# パターンによるクリア
redis-cli --scan --pattern "@techtrend/cache:articles:*" | xargs redis-cli DEL

# 特定ユーザーのキャッシュクリア
redis-cli --scan --pattern "*:user:123:*" | xargs redis-cli DEL
```

### 11.2 キャッシュ統計の確認

```bash
# ヒット率の確認
redis-cli INFO stats | grep keyspace_hits

# メモリ使用量
redis-cli INFO memory | grep used_memory_human

# キー数の確認
redis-cli DBSIZE
```

## 12. 今後の改善検討事項

1. **キャッシュウォーミング**: 起動時の事前ロード
2. **スマート無効化**: 依存関係グラフによる最小限の無効化
3. **キャッシュ圧縮**: 大容量データの圧縮保存
4. **地理的分散**: エッジキャッシュの活用
5. **機械学習**: アクセスパターンによるTTL自動調整