# テストガイドライン

## 🚨 重要：新機能追加時の必須事項

**新機能を追加する前に、必ず既存機能の回帰テストを実行すること**

### 2025年8月19日の教訓

キーボードショートカット機能とプレビュー機能の追加により、無限スクロールが壊れる事例が発生。
**原因**: 新機能のコンポーネントが既存のレイアウト構造に影響を与えた
**結果**: 20件以上の記事を読み込むとページトップに戻る問題
**教訓**: 機能追加前のテスト実行の重要性

## テスト戦略

### 1. 開発前（TDD - Test Driven Development）

```bash
# 1. 既存機能の動作確認
npm run test:e2e

# 2. 新機能のテストを先に書く
# e2e/new-feature.spec.ts を作成

# 3. テストが失敗することを確認
npm run test:e2e -- new-feature.spec.ts

# 4. 機能を実装

# 5. テストが成功することを確認
npm run test:e2e -- new-feature.spec.ts

# 6. 回帰テストを実行
npm run test:e2e -- regression-test.spec.ts
```

### 2. 必須テストカバレッジ

#### コア機能（破壊厳禁）
- [ ] 記事一覧表示
- [ ] 無限スクロール
- [ ] フィルター機能（ソース、タグ、日付）
- [ ] 検索機能
- [ ] ソート機能
- [ ] 表示モード切り替え

#### E2Eテストファイル
- `e2e/regression-test.spec.ts` - 既存機能の回帰テスト
- `e2e/infinite-scroll.spec.ts` - 無限スクロール専用テスト
- `e2e/source-filter-cookie.spec.ts` - フィルター永続化テスト
- `e2e/multiple-source-filter.spec.ts` - 複数ソースフィルター

### 3. CI/CDパイプライン設定

```yaml
# .github/workflows/test.yml
name: E2E Tests
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install
      - run: npm run test:e2e
```

## テストコマンド

### 基本コマンド

```bash
# 全テスト実行
npm run test          # 単体テスト
npm run test:e2e      # E2Eテスト（全ブラウザ）

# 特定のテスト実行
npm run test:e2e -- infinite-scroll.spec.ts
npm run test:e2e -- regression-test.spec.ts

# ブラウザ別実行
npm run test:e2e:chromium
npm run test:e2e:firefox

# デバッグモード
npm run test:e2e:debug
npm run test:e2e:ui      # UIモード（インタラクティブ）
npm run test:e2e:headed  # ブラウザ表示あり

# カバレッジ測定
npm run test:coverage
```

### 新機能追加時のチェックリスト

```bash
# 1. 現在のブランチで全テストがパスすることを確認
git checkout main
npm run test:e2e

# 2. 新機能ブランチを作成
git checkout -b feature/new-feature

# 3. 新機能のテストを作成
# e2e/new-feature.spec.ts

# 4. 実装

# 5. 単体テストを実行
npm run test

# 6. E2Eテストを実行
npm run test:e2e

# 7. 回帰テストを必ず実行
npm run test:e2e -- regression-test.spec.ts

# 8. パフォーマンステスト
npm run test:e2e -- regression-test.spec.ts -g "パフォーマンス"
```

## テスト作成のベストプラクティス

### 1. データ属性の使用

```tsx
// ❌ 悪い例
const button = page.locator('.btn-primary');

// ✅ 良い例
const button = page.locator('[data-testid="submit-button"]');
```

### 2. 適切な待機処理

```typescript
// ❌ 悪い例
await page.waitForTimeout(5000);

// ✅ 良い例
await page.waitForSelector('[data-testid="article-card"]');
await expect(page.locator('[data-testid="loading"]')).not.toBeVisible();
```

### 3. テストの独立性

```typescript
// 各テストは独立して実行可能にする
test.beforeEach(async ({ page }) => {
  // 初期状態をセットアップ
  await page.goto('/');
  await page.waitForSelector('[data-testid="article-card"]');
});
```

### 4. エラーケースのテスト

```typescript
test('ネットワークエラー時の処理', async ({ page }) => {
  await page.route('**/api/articles*', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.error-message')).toContainText('エラー');
});
```

## よくある問題と対処法

### 問題1: テストがランダムに失敗する

**原因**: タイミング依存の問題
**対処**:
```typescript
// waitForSelectorやexpectの適切な使用
await page.waitForSelector('[data-testid="article-card"]', {
  state: 'visible',
  timeout: 10000
});
```

### 問題2: 新機能で既存テストが失敗

**原因**: DOM構造やレイアウトの変更
**対処**:
1. 回帰テストを先に実行して影響範囲を特定
2. data-testid属性を使用して、構造変更に強いテストにする
3. 必要に応じてテストを更新（ただし、機能が壊れていないことを確認）

### 問題3: テストが遅い

**原因**: 不必要な待機や重複したテスト
**対処**:
```typescript
// 並列実行の活用
// playwright.config.ts
export default {
  workers: 4, // 並列実行数を増やす
  fullyParallel: true,
};
```

## モニタリングとレポート

### テスト結果の確認

```bash
# HTMLレポートの生成
npx playwright show-report

# JUnitレポート（CI用）
npm run test:e2e -- --reporter=junit

# カスタムレポート
npm run test:e2e -- --reporter=list
```

### パフォーマンス指標

- 初期読み込み: 3秒以内
- 無限スクロール応答: 1秒以内
- フィルター適用: 500ms以内
- 検索実行: 1秒以内

## 継続的改善

### 月次レビュー項目

1. テストカバレッジの確認
2. 失敗頻度の高いテストの改善
3. 新機能に対するテストの追加
4. パフォーマンス指標の確認

### テスト負債の管理

```bash
# TODOコメントの確認
grep -r "TODO" e2e/
grep -r "FIXME" __tests__/

# スキップされているテストの確認
grep -r "test.skip" e2e/
grep -r "xit\|xdescribe" __tests__/
```

## 参考リンク

- [Playwright Documentation](https://playwright.dev/)
- [Jest Documentation](https://jestjs.io/)
- [Testing Library](https://testing-library.com/)
- [TDD Best Practices](https://martinfowler.com/bliki/TestDrivenDevelopment.html)