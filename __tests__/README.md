# TechTrend テストガイド

## テスト構造

テストはソースと同じパスに置く（`lib/tags/tag-service.ts` → `__tests__/lib/tags/tag-service.test.ts`）。置き場所の基準の全体は [docs/architecture/06-directory-structure.md](../docs/architecture/06-directory-structure.md#テスト)。

```
__tests__/
├── lib/ app/ scripts/ types/   単体テスト（ソースと同じパス）
├── api/                        API のルート（app/api/）のテスト
├── components/ hooks/          画面の部品（app/components/）・フック（app/hooks/）のテスト
├── integration/                実際の DB と Redis を使う結合テスト
├── e2e/                        Playwright の E2E（helpers/・utils/・constants/ は E2E の補助）
├── performance/                性能の計測
├── helpers/ fixtures/          テストの補助とデータ
└── __mocks__/                  テスト用のモック（node_modules のモックはルートの __mocks__/）
```

ソースの隣の `__tests__/`（`lib/ai/service/__tests__/` など）に置いてもよい。

| 設定 | 対象 |
|------|------|
| `jest.config.node.js` | `*.test.ts`（Node 環境）。`*.db.test.ts` はテスト用の DB を使う |
| `jest.config.dom.js` | `*.test.tsx`（jsdom） |
| `jest.config.integration.js` | `__tests__/integration/` |
| `playwright.config.ts` | `__tests__/e2e/**/*.spec.ts` |

## テストの実行

テスト用の DB（マイグレーションとシード済み）を前提にするので、Docker の中で流す。

```bash
npm run docker:build:ci                                   # ソースやテストを変えたらイメージを作り直す
TEST_FILE=__tests__/lib/tags/tag-service.test.ts npm run docker:test:file          # Node 環境
TEST_FILE=__tests__/components/ArticleCard.test.tsx npm run docker:test:react:file # DOM 環境
E2E_FILE=__tests__/e2e/specs/home.spec.ts npm run docker:e2e:file:fast             # E2E（Chromium）
```

## テストの書き方

### 単体テスト

```typescript
import { calculateQualityScore } from '@/lib/articles/quality-score';
import { createMockArticle } from '../../__mocks__/prisma';

describe('calculateQualityScore', () => {
  it('高品質な記事に高いスコアを付与する', () => {
    const article = createMockArticle({
      publishedAt: new Date(),
      summary: '詳細な要約',
      bookmarks: 100,
    });
    
    const score = calculateQualityScore(article);
    expect(score).toBeGreaterThan(70);
  });
});
```

### APIテスト

```typescript
import { GET } from '@/app/api/articles/route';
import { prismaMock } from '../../__mocks__/prisma';

describe('Articles API', () => {
  it('記事一覧を返す', async () => {
    prismaMock.article.findMany.mockResolvedValue([]);
    
    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});
```

### Reactコンポーネントテスト

```typescript
import { render, screen } from '../test-utils';
import { ArticleCard } from '@/app/components/article/card';

describe('ArticleCard', () => {
  it('記事情報を表示する', () => {
    render(<ArticleCard article={mockArticle} />);
    
    expect(screen.getByText('Test Article')).toBeInTheDocument();
  });
});
```

## モックの使用

### Prismaモック

```typescript
import { prismaMock, createMockArticle } from '../__mocks__/prisma';

// モックデータの作成
const article = createMockArticle({
  title: 'Custom Title',
  qualityScore: 85,
});

// Prismaメソッドのモック
prismaMock.article.findMany.mockResolvedValue([article]);
```

### Next.jsナビゲーションモック

```typescript
import { mockNextNavigation } from '../__mocks__/next-navigation';

// ナビゲーションのモック
mockNextNavigation.mockRouter.push.mockImplementation((url) => {
  console.log(`Navigating to: ${url}`);
});

// モックのリセット
afterEach(() => {
  mockNextNavigation.reset();
});
```

## ベストプラクティス

1. **テストの独立性を保つ**
   - 各テストは他のテストに依存しない
   - beforeEach/afterEachでモックをリセット

2. **明確なテスト名**
   - 何をテストしているか一目でわかる名前
   - 日本語でもOK

3. **AAA原則に従う**
   - Arrange: テストデータの準備
   - Act: テスト対象の実行
   - Assert: 結果の検証

4. **適切なアサーション**
   - 具体的な値の検証
   - エラーケースのテスト
   - 境界値のテスト

5. **モックの適切な使用**
   - 外部依存はモック化
   - 実装の詳細に依存しない

## カバレッジ目標

- 全体: 30%以上（段階的に向上予定）
- ユーティリティ関数: 80%以上
- APIルート: 70%以上
- Reactコンポーネント: 60%以上

## トラブルシューティング

### テストが失敗する場合

1. モックが正しく設定されているか確認
2. 環境変数が設定されているか確認（jest.setup.node.js）
3. 依存関係が最新か確認（npm install）

### カバレッジが低い場合

1. テストされていないファイルを特定
2. エッジケースのテストを追加
3. エラーハンドリングのテストを追加