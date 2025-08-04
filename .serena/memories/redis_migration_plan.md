# ローカルRedis移行計画

## 概要
現在のUpstash Redis（マネージドサービス）から、開発環境でローカルRedis、本番環境で選択可能な構成への移行計画。

## 現状分析

### 既存実装
- **RedisCacheクラス**: 汎用的なキャッシュ層として実装済み
- **Upstash Redis SDK**: `@upstash/redis` を使用
- **モックサーバー**: `scripts/local-redis-mock.js` （開発用）

### 課題
1. 外部サービス（Upstash）への依存
2. 開発環境でのネットワークレイテンシ
3. Upstashの制限（SCAN非対応など）

## 移行アーキテクチャ

### 1. Redis接続の抽象化レイヤー

```typescript
// lib/redis/types.ts
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { ex?: number }): Promise<void>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  scan(cursor: string, options?: { match?: string }): Promise<[string, string[]]>;
}

// lib/redis/upstash-adapter.ts
import { Redis } from '@upstash/redis';
export class UpstashAdapter implements RedisClient {
  // Upstash Redis用の実装
}

// lib/redis/ioredis-adapter.ts
import Redis from 'ioredis';
export class IORedisAdapter implements RedisClient {
  // ioredis用の実装
}
```

### 2. 環境別設定

```typescript
// lib/redis/factory.ts
export function createRedisClient(): RedisClient {
  const redisType = process.env.REDIS_TYPE || 'auto';
  
  switch (redisType) {
    case 'local':
      return new IORedisAdapter({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      });
    
    case 'upstash':
      return new UpstashAdapter({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
    
    case 'auto':
    default:
      // 環境に応じて自動選択
      if (process.env.NODE_ENV === 'production' && process.env.UPSTASH_REDIS_REST_URL) {
        return new UpstashAdapter(...);
      }
      return new IORedisAdapter(...);
  }
}
```

### 3. Docker Compose設定

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: techtrend
      POSTGRES_PASSWORD: techtrend
      POSTGRES_DB: techtrend
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru

volumes:
  postgres-data:
  redis-data:
```

## 実装手順

### Phase 1: 準備（1週間）
1. ✅ 現状調査（完了）
2. ioredisパッケージのインストール
3. Redis接続抽象化レイヤーの実装
4. Docker Compose設定の作成

### Phase 2: 開発環境移行（2週間）
1. ローカルRedis環境のセットアップ
2. 開発環境での動作確認
3. 既存テストの修正
4. 開発者向けドキュメント作成

### Phase 3: 本番環境対応（2週間）
1. 環境変数による切り替え実装
2. 本番環境での段階的移行
3. パフォーマンス計測
4. ロールバック計画の準備

## 利点

1. **開発効率向上**
   - ローカル環境での高速なキャッシュアクセス
   - ネットワーク依存の削減

2. **コスト最適化**
   - 開発環境でのUpstash使用料削減
   - 本番環境での選択肢拡大

3. **機能拡張**
   - Redis全機能の利用（SCAN、Lua Script等）
   - より高度なキャッシュ戦略の実装可能

4. **保守性向上**
   - 統一されたRedis操作インターフェース
   - 環境別の設定管理の簡素化

## リスクと対策

### リスク
1. 本番環境での移行ミス
2. パフォーマンス劣化
3. データ整合性の問題

### 対策
1. 段階的移行とフィーチャーフラグ
2. 詳細なパフォーマンス計測
3. キャッシュ無効化戦略の明確化

## 成功指標

- 開発環境でのAPI応答時間: 30%改善
- Upstash使用料: 50%削減（開発環境分）
- 開発者体験: セットアップ時間の短縮