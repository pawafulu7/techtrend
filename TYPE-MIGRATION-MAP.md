# 型定義移行マップ

## 概要

このドキュメントは、TechTrendプロジェクトの型定義移行に関するマッピングと進捗を記録します。

## 移行済み型定義

### 1. `/types/models.ts`
- ✅ Prismaモデルの再エクスポート
- ✅ 関連を含むモデル型（ArticleWithRelations, SourceWithCount等）
- ✅ Create/Update入力型
- ✅ Where/OrderBy条件型

### 2. `/types/api.ts`
- ✅ ApiResponse型
- ✅ PaginatedResponse型
- ✅ 各種パラメータ型（SearchParams, StatsResponse等）
- ✅ エラーレスポンス型

### 3. `/types/fetchers.ts`
- ✅ CreateArticleInput型
- ✅ FetchResult型
- ✅ RSS/API/スクレイピング関連型

### 4. `/types/components.ts`
- ✅ 各種コンポーネントProps型
- ✅ FilterOptions型
- ✅ UI関連の型定義

### 5. `/types/utils.ts`
- ✅ ユーティリティ型（PartialRequired, DeepPartial等）
- ✅ 共通インターフェース（DateRange, Result等）

## any型の置換状況

### 修正済み
- ✅ `app/api/articles/search/route.ts`: whereConditions
- ✅ `app/api/articles/search/advanced/route.ts`: whereConditions
- ✅ `app/api/articles/[id]/route.ts`: updateData
- ✅ `app/api/ai/summarize/route.ts`: whereClause
- ✅ `lib/ai/gemini.ts`: model
- ✅ `scripts/core/manage-summaries.ts`: query objects
- ✅ `scripts/core/manage-quality-scores.ts`: query objects
- ✅ `app/components/tags/TagStats.tsx`: tag
- ✅ `app/trends/page.tsx`: timeline
- ✅ `app/favorites/page.tsx`: value (onValueChange)
- ✅ `app/favorites/feed/page.tsx`: v (setSortBy)
- ✅ `app/search/advanced/page.tsx`: value (onValueChange)

### 修正予定
- ⏳ `app/api/feeds/collect/route.ts`: summary
- ⏳ `app/api/trends/analysis/route.ts`: dayData
- ⏳ `app/api/articles/popular/route.ts`: cache data
- ⏳ `lib/favorites/hooks.ts`: f (map callbacks)

## 型定義の使用方法

### インポート例

```typescript
// Prismaモデルと関連型
import { Article, ArticleWithRelations, ArticleCreateInput } from '@types/models';

// API型
import { ApiResponse, PaginatedResponse, SearchParams } from '@types/api';

// フェッチャー型
import { FetchResult, CreateArticleInput } from '@types/fetchers';

// コンポーネント型
import { ArticleCardProps, FilterOptions } from '@types/components';

// ユーティリティ型
import { Result, AsyncResult, DeepPartial } from '@types/utils';

// または一括インポート
import * as Types from '@types/index';
```

### 型定義の適用例

```typescript
// Before (any型)
const whereConditions: any = {};
const updateData: any = {};

// After (型安全)
const whereConditions: Prisma.ArticleWhereInput = {};
const updateData: Prisma.ArticleUpdateInput = {};
```

## 今後の作業

1. **Phase 1 残り作業**
   - 残りのany型をすべて型安全な実装に置換
   - 既存の重複型定義を統一
   - 型定義のドキュメント作成

2. **Phase 2での作業**
   - 型チェックの厳密化
   - 型ガードの実装
   - 実行時型検証の追加

## 注意事項

- Prismaの自動生成型を優先的に使用
- カスタム型は必要最小限に留める
- 型の重複定義を避ける
- any型の使用は原則禁止