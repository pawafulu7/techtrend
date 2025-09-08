# E2E テスト改善戦略

## 概要

このドキュメントは、E2Eテストの安定性改善に関する戦略と、CodeRabbitレビューへの対応方針を記載しています。

## 背景

### CodeRabbitからの提案（2025年1月）

CodeRabbitは以下の改善を提案しました：

1. **状態ベースの待機**
   - `waitForTimeout()` を `waitForSelector()` や `waitForFunction()` に置き換え
   - 条件が満たされるまで待機する実装

2. **セレクタの改善**
   - `data-testid` 属性の積極的な使用
   - より具体的で安定したセレクタの使用

3. **リトライメカニズム**
   - `safeClick()` 関数によるクリックのリトライ
   - エクスポネンシャルバックオフの実装

4. **環境対応のタイムアウト**
   - CI/ローカル環境に応じたタイムアウト値の調整
   - 環境変数による設定

### 実際の適用結果

**2025年1月7日の改善試行:**
- **Before**: 9 failed, 6 flaky
- **After改善**: 11 failed, 16 flaky（悪化）
- **Rollback後**: 1 failed, ほぼflaky解消（大幅改善）

## 学んだ教訓

### 1. CI環境とローカル環境の差異

CI環境（GitHub Actions）では：
- 処理速度が遅い
- タイミングが不安定
- 複雑な条件評価でタイムアウトしやすい

### 2. シンプルさの重要性

```typescript
// ❌ 複雑だが不安定
await page.waitForFunction(
  () => {
    const checkboxes = document.querySelectorAll('[data-testid^="source-checkbox-"] button[role="checkbox"]');
    return Array.from(checkboxes).every(cb => cb.getAttribute('data-state') === 'unchecked');
  },
  { timeout: 5000 }
);

// ✅ シンプルだが安定
await page.waitForTimeout(500);
```

### 3. セレクタの問題

```typescript
// ❌ CI環境で不安定
await page.waitForSelector(`[data-testid^="source-checkbox-"]:nth-of-type(1)`, {
  state: 'visible',
  timeout: 5000
});

// ✅ CI環境でも安定
await page.waitForTimeout(300);
const firstCheckbox = page.locator('[data-testid^="source-checkbox-"]').first();
```

## 改善戦略

### Phase 1: 現状維持と監視（現在）

1. **安定性の維持**
   - 現在のwaitForTimeout使用を維持
   - 成功率94.6%を基準として監視

2. **ドキュメント化**
   - 問題と解決策の記録
   - CI環境での注意事項の明記

### Phase 2: 段階的改善（今後）

1. **個別テストの改善**
   - 最も安定しているテストから1つずつ
   - 各改善後にCI環境で検証
   - 問題があれば即座にロールバック

2. **改善対象の優先順位**
   ```
   高優先度: 失敗しているテスト（tag-search.spec.ts）
   中優先度: 時々失敗するテスト
   低優先度: 安定しているテスト
   ```

3. **改善方法**
   ```typescript
   // Step 1: 最小限の改善
   await page.waitForTimeout(300);
   await page.waitForSelector('[data-testid="element"]', { state: 'visible' });
   
   // Step 2: 検証後、徐々に条件を追加
   await page.waitForSelector('[data-testid="element"]', { state: 'visible' });
   await page.waitForFunction(() => /* simple condition */);
   ```

### Phase 3: 長期的な最適化（将来）

1. **CI専用設定**
   ```typescript
   const timeout = process.env.CI ? 10000 : 5000;
   const retries = process.env.CI ? 3 : 1;
   ```

2. **テスト環境の改善**
   - GitHub ActionsのRunnerスペック向上
   - 並列実行の最適化

## 現在のwaitForTimeout使用箇所

現在51箇所のwaitForTimeoutが残っていますが、これらは：
- ✅ 安定して動作している
- ✅ CI環境でも問題ない
- ✅ 理解しやすく保守しやすい

## 推奨事項

### DO ✅

1. **段階的な改善**
   - 一度に1つのテストファイルのみ変更
   - CI環境で必ず検証

2. **シンプルな実装**
   - 複雑な条件より単純な待機
   - 読みやすさを優先

3. **適切なタイムアウト**
   ```typescript
   // アニメーション待機
   await page.waitForTimeout(300);  // OK
   
   // データ読み込み待機
   await page.waitForTimeout(500);  // OK
   
   // 重い処理の待機
   await page.waitForTimeout(1000); // 必要に応じて
   ```

### DON'T ❌

1. **避けるべきパターン**
   - 全テストを一度に変更
   - 未検証の複雑な条件
   - CI環境を考慮しない最適化

2. **問題のあるセレクタ**
   - `:nth-of-type()` の多用
   - 深いネストのセレクタ
   - 動的に変わる属性への依存

## 結論

CodeRabbitの提案は理論的には正しいですが、実際のCI環境では：
- **安定性 > パフォーマンス**
- **シンプルさ > 理想的な実装**
- **段階的改善 > 一括変更**

現在の実装は最適ではないかもしれませんが、**安定して動作する**ことが最も重要です。

## 参考資料

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [GitHub Actions環境変数](https://docs.github.com/en/actions/learn-github-actions/environment-variables)
- PR #42: E2Eテスト安定性改善の経緯