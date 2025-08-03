# TechTrend プロジェクト詳細調査レポート (2025年2月3日)

## 調査サマリー
serenaMCPを使用した詳細調査により、前回（2025年2月）の調査から更に詳細な技術的課題と改善機会を特定。

## 1. パフォーマンス問題の詳細分析

### /api/articles エンドポイントの問題
```typescript
// 問題のコード（app/api/articles/route.ts）
const total = await prisma.article.count({ where }); // 毎回実行
const articles = await prisma.article.findMany({
  include: {
    source: { select: {...} }, // N+1の可能性
    tags: { select: {...} },   // N+1の可能性
  },
  // ...
});
```

**問題点:**
- 毎回count()クエリを実行（キャッシュなし）
- tags、sourceをincludeしているためN+1問題の可能性
- RedisCache実装は存在するが未使用

**解決策:**
```typescript
// RedisCacheを活用した実装例
const cache = new RedisCache(redis, {
  defaultTTL: 300, // 5分
  namespace: '@techtrend/cache:api'
});

const cacheKey = cache.generateCacheKey('articles', {
  page, limit, sortBy, sortOrder, sourceId, tag, search
});

const result = await cache.getOrSet(cacheKey, async () => {
  // 既存のクエリ処理
});
```

### /api/sources での成功例
- RedisCacheが実装済みで正常に動作
- X-Cache-Statusヘッダーでキャッシュヒット/ミスを返却
- 1時間のTTLで効果的にキャッシュ

## 2. テストインフラの問題分析

### テスト失敗の原因
```
Sources error: TypeError: Cannot read properties of undefined (reading 'map')
at map (/home/tomoaki/work/techtrend/app/api/sources/route.ts:83:38)
```

**原因:** モックデータの不整合
- Prismaのモックが正しくセットアップされていない
- findMany()の戻り値がundefined

### テストカバレッジの現状
- 13個中2個のテストスイートが失敗
- CLIテストはdescribe.skipでスキップ状態
- 実際のカバレッジ数値は未確認（npm run test:coverageで確認可能）

## 3. ログシステムの詳細

### 現状の実装
- lib/cli/utils/logger.tsにログレベル制御あり
- 環境変数LOG_LEVELで制御可能
- しかし126箇所でconsole.log/error/warnを直接使用

### 主な使用箇所
```
lib/ai/: 4箇所（エラーログ）
lib/reading-list/hooks.ts: 11箇所（エラーログ）
lib/cli/commands/: 多数（表示用）
lib/fetchers/: 多数（デバッグ・エラーログ）
```

### 構造化ログ導入計画
1. winston または pino の選定
2. 既存logger.tsを拡張して構造化ログ対応
3. 段階的な置換（優先度: エラーログ → デバッグログ → 表示用）

## 4. 具体的な改善提案

### 🔴 最優先（1週間以内）

#### 1. articles APIのキャッシュ実装
```typescript
// 実装ステップ
1. lib/cache/redis-cache.tsをインポート
2. キャッシュキー生成ロジック実装
3. getOrSetパターンで実装
4. キャッシュ無効化戦略の設計（新記事追加時等）
```

#### 2. テスト修正
```typescript
// __tests__/setup/node.jsでのPrismaモック改善
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    source: {
      findMany: jest.fn().mockResolvedValue([
        { id: '1', name: 'Test Source', /* ... */ }
      ]),
      count: jest.fn().mockResolvedValue(1)
    },
    // 他のモデルも同様に
  }))
}));
```

### 🟡 高優先度（1ヶ月以内）

#### 1. 構造化ログの導入
```bash
npm install winston winston-daily-rotate-file
```

```typescript
// lib/logger/index.ts
import winston from 'winston';

export const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

#### 2. N+1問題の根本解決
- PrismaのfindMany最適化
- DataLoaderパターンの導入検討
- includeの選択的使用

### 🟢 中優先度（3ヶ月以内）

#### 1. パフォーマンスモニタリング
- OpenTelemetryの導入
- メトリクス収集（応答時間、キャッシュヒット率等）
- ダッシュボード構築

#### 2. E2Eテスト基盤
- Playwrightの導入
- 主要ユーザーフローのテスト
- CI/CDへの統合

## 5. アーキテクチャの良い点（維持すべき）

1. **エラーハンドリングの統一**
   - ExternalAPIError等の専用エラークラス
   - formatErrorResponseでの一貫した形式

2. **フェッチャーアーキテクチャ**
   - 基底クラスによる共通化
   - 各ソースごとの拡張性

3. **CLIツールへの移行**
   - Commander.jsの活用
   - 段階的な統合アプローチ

4. **ドキュメントの充実**
   - docs/ディレクトリの体系的な文書
   - 移行ガイドの存在

## 6. 次回調査時の確認ポイント

1. キャッシュ実装の効果測定
2. テストカバレッジの数値変化
3. ログ出力の構造化進捗
4. パフォーマンスメトリクスの変化
5. 新規技術的負債の発生有無