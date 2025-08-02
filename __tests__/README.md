# TechTrend テストガイド

## テスト構造

```
__tests__/
├── unit/           # 単体テスト
│   ├── utils/      # ユーティリティ関数のテスト
│   ├── lib/        # ライブラリのテスト
│   └── types/      # 型定義のテスト
├── integration/    # 統合テスト
│   └── api/        # APIエンドポイントのテスト
├── e2e/            # E2Eテスト（将来的に実装）
├── __mocks__/      # モック定義
└── test-utils.tsx  # テストユーティリティ
```

## テストの実行

```bash
# すべてのテストを実行
npm test

# ウォッチモードでテストを実行
npm run test:watch

# カバレッジレポートを生成
npm run test:coverage

# 特定のテストファイルを実行
npm test -- quality-score.test.ts

# 特定のテストスイートを実行
npm test -- --testNamePattern="calculateQualityScore"
```

## テストの書き方

### 単体テスト

```typescript
import { calculateQualityScore } from '@/lib/utils/quality-score';
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
2. 環境変数が設定されているか確認（jest.setup.js）
3. 依存関係が最新か確認（npm install）

### カバレッジが低い場合

1. テストされていないファイルを特定
2. エッジケースのテストを追加
3. エラーハンドリングのテストを追加