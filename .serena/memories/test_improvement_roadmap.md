# テスト改善ロードマップ

## 優先度別アクションアイテム

### 🔴 最優先（今すぐ実施）

#### 1. 品質スコア計算のテスト実装
**対象ファイル**: `lib/utils/quality-score.ts`
**理由**: ビジネスロジックの中核、バグが収益に直結
**実装内容**:
- 各スコア要素の計算テスト
- 境界値テスト
- 異常値のハンドリングテスト

#### 2. Jest設定の改善
```javascript
// jest.config.js の更新
coverageThreshold: {
  global: {
    branches: 20,
    functions: 20,
    lines: 20,
    statements: 20,
  },
},
```

### 🟡 高優先度（1週間以内）

#### 1. フェッチャーの基本テスト
**対象**: 主要3フェッチャー（Dev.to, Qiita, Zenn）
**テスト内容**:
- APIレスポンスのモック
- データ変換の正確性
- エラーハンドリング
- レート制限の遵守

#### 2. CI/CDへのテスト統合
```yaml
# .github/workflows/test.yml
- name: Run tests
  run: npm test
- name: Upload coverage
  uses: codecov/codecov-action@v3
```

### 🟢 中優先度（1ヶ月以内）

#### 1. APIエンドポイントテスト
**優先順位**:
1. `/api/articles` - 最も使用頻度が高い
2. `/api/sources/[id]` - N+1問題の検証
3. `/api/tags` - パフォーマンス改善の効果測定

#### 2. React Componentテスト
**優先コンポーネント**:
1. ArticleCard - 表示ロジックが複雑
2. TagFilter - 状態管理が複雑
3. ShareButton - 外部連携

### 🔵 低優先度（3ヶ月以内）

#### 1. E2Eテスト基盤構築
```bash
npm install -D @playwright/test
npx playwright install
```

#### 2. パフォーマンステスト
- Lighthouseの自動実行
- バンドルサイズの監視

## テスト作成のベストプラクティス

### 1. AAA パターンの徹底
```typescript
test('should calculate quality score correctly', () => {
  // Arrange
  const article = createMockArticle({ reactions: 100 });
  
  // Act
  const score = calculateQualityScore(article);
  
  // Assert
  expect(score).toBe(85);
});
```

### 2. テストデータビルダーの活用
```typescript
// __tests__/builders/article.builder.ts
export class ArticleBuilder {
  private article: Partial<Article> = {};
  
  withHighQuality() {
    this.article.reactions = 100;
    this.article.views = 1000;
    return this;
  }
  
  build(): Article {
    return { ...defaultArticle, ...this.article };
  }
}
```

### 3. カスタムマッチャーの作成
```typescript
// __tests__/matchers/article.matchers.ts
expect.extend({
  toBeHighQuality(received: Article) {
    const score = calculateQualityScore(received);
    const pass = score >= 80;
    return {
      pass,
      message: () => `expected article to ${pass ? 'not ' : ''}be high quality`
    };
  }
});
```

## 成功指標

### 短期（1ヶ月）
- カバレッジ 5% → 20%
- 重要ユーティリティ関数のテスト完了
- CI/CDでのテスト自動実行

### 中期（3ヶ月）
- カバレッジ 20% → 40%
- APIテストの完備
- テスト実行時間 < 3分

### 長期（6ヶ月）
- カバレッジ 40% → 60%
- E2Eテストの導入
- テスト駆動開発の文化定着

## リソース見積もり

### 人的リソース
- 初期セットアップ: 1人 × 3日
- 既存コードのテスト: 2人 × 2週間
- 継続的なテスト作成: 全開発者の作業時間の20%

### ツールコスト
- 基本ツール（Jest, RTL）: 無料
- カバレッジサービス（Codecov）: 無料〜$10/月
- E2Eテスト（Playwright）: 無料

### ROI（投資対効果）
- バグ修正時間の削減: 30%
- リグレッションの防止: 80%
- 開発速度の向上: 20%（長期）