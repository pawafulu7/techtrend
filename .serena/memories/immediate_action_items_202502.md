# TechTrend 即座に実施すべき改善項目 (2025年2月)

## 1. articles APIのRedisキャッシュ実装（最優先）

### 実装コード例
```typescript
// app/api/articles/route.ts の修正
import { redis } from '@/lib/rate-limiter';
import { RedisCache } from '@/lib/cache';

// キャッシュインスタンスを初期化（5分TTL）
const cache = new RedisCache(redis, {
  defaultTTL: 300,
  namespace: '@techtrend/cache:api'
});

export async function GET(request: NextRequest) {
  try {
    // ... パラメータ解析は既存のまま ...

    // キャッシュキー生成
    const cacheKey = cache.generateCacheKey('articles', {
      page: page.toString(),
      limit: limit.toString(),
      sortBy,
      sortOrder,
      ...(sourceId && { sourceId }),
      ...(tag && { tag }),
      ...(search && { search })
    });

    // キャッシュから取得または新規取得
    const result = await cache.getOrSet(cacheKey, async () => {
      // 既存のcount()とfindMany()処理
      const total = await prisma.article.count({ where });
      const articles = await prisma.article.findMany({
        // ... 既存のクエリ ...
      });

      return {
        items: articles,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    });

    // キャッシュステータスをヘッダーに追加
    const response = NextResponse.json({
      success: true,
      data: result,
    });
    
    response.headers.set('X-Cache-Status', result ? 'HIT' : 'MISS');
    return response;
  } catch (error) {
    // ... 既存のエラーハンドリング ...
  }
}
```

### キャッシュ無効化戦略
```typescript
// 新規記事追加時（POST /api/articles）
await cache.invalidatePattern('articles:*');

// 特定タグの記事更新時
await cache.invalidatePattern(`articles:*tag=${tagName}*`);
```

## 2. テストのPrismaモック修正（緊急）

### __tests__/setup/node.js の修正
```javascript
// Prismaモックの正しい実装
const mockPrismaClient = {
  article: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  source: {
    findMany: jest.fn().mockResolvedValue([
      {
        id: 'test-source-1',
        name: 'Test Source 1',
        type: 'rss',
        url: 'https://example.com/feed',
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    ]),
    count: jest.fn().mockResolvedValue(1),
  },
  tag: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn((fn) => fn(mockPrismaClient)),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrismaClient),
}));
```

## 3. 構造化ログの段階的導入

### Step 1: Winstonのインストール
```bash
npm install winston winston-daily-rotate-file
```

### Step 2: 統一ログインターフェース
```typescript
// lib/logger/index.ts
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'techtrend' },
  transports: [
    // コンソール出力（開発環境）
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
      silent: process.env.NODE_ENV === 'test'
    }),
    // ファイル出力（本番環境）
    ...(process.env.NODE_ENV === 'production' ? [
      new DailyRotateFile({
        filename: 'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxFiles: '14d'
      }),
      new DailyRotateFile({
        filename: 'logs/combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '7d'
      })
    ] : [])
  ]
});

// 既存のconsole.*との互換性
export const log = {
  error: (message: string, ...args: any[]) => logger.error(message, ...args),
  warn: (message: string, ...args: any[]) => logger.warn(message, ...args),
  info: (message: string, ...args: any[]) => logger.info(message, ...args),
  debug: (message: string, ...args: any[]) => logger.debug(message, ...args),
};
```

### Step 3: 優先順位別の置換計画

1. **最優先: エラーログ（1日）**
   ```bash
   # 一括置換スクリプト
   find lib -name "*.ts" -type f -exec sed -i 's/console\.error/log.error/g' {} +
   ```

2. **高優先: APIエンドポイント（3日）**
   ```typescript
   // app/api/**/route.ts のすべてで
   import { log } from '@/lib/logger';
   // console.error → log.error
   ```

3. **中優先: フェッチャー（1週間）**
   ```typescript
   // lib/fetchers/*.ts で段階的に置換
   ```

## 4. 実行コマンドリスト

```bash
# 1. テスト修正確認
npm test -- --verbose

# 2. キャッシュ実装後のパフォーマンステスト
curl -w "@curl-format.txt" -o /dev/null -s "http://localhost:3000/api/articles"

# 3. ログ出力確認
LOG_LEVEL=debug npm run dev

# 4. テストカバレッジ確認
npm run test:coverage
```

## 5. 効果測定指標

1. **パフォーマンス**
   - articles API応答時間: 現在 ~500ms → 目標 <100ms（キャッシュヒット時）
   - キャッシュヒット率: 目標 >80%

2. **テスト**
   - テスト成功率: 現在 84.6% → 目標 100%
   - カバレッジ: 現在 ~15% → 目標 >20%

3. **運用性**
   - 構造化ログ採用率: 現在 0% → 目標 100%（エラーログ）
   - ログ検索効率: JSON形式により大幅改善