# E2Eテスト改善実装ドキュメント

## 概要
2025年9月11日実施のE2Eテスト改善作業の記録。テスト成功率向上とCI/CDパイプラインの安定化を目的とした修正。

## 問題点と解決策

### 1. タイムアウト問題

#### 問題
- commit 66ba370でタイムアウトが30秒→3-5秒に短縮されていた
- CI環境でのテスト失敗が頻発

#### 解決策
```typescript
// waitForUrlParam関数の修正
// 最小5秒のタイムアウトを保証
{ timeout: Math.max(5000, timeout / maxRetries), polling }
```

### 2. Strict Mode違反

#### 問題
- filter-persistence.spec.tsで複数要素が存在する場合のエラー
- `Error: locator.toHaveValue: Error: strict mode violation`

#### 解決策
```typescript
// .first()を追加して最初の要素を明示的に選択
await expect(page.locator('[data-testid="search-box-input"]').first()).toHaveValue('');
```

### 3. ソース選択解除の同期問題

#### 問題
- source-exclude.spec.tsでチェックボックスの状態がURLに反映されない

#### 解決策
```typescript
// クリック後の待機時間追加とデバッグログ
await sourceCheckbox.locator('button[role="checkbox"]').click();
await page.waitForTimeout(500);
console.log('Deselected sources:', sourcesToDeselect);
console.log('Selected sources in URL:', selectedSources);
```

## 修正ファイル一覧

1. **e2e/helpers/wait-utils.ts**
   - waitForUrlParam: タイムアウト計算の改善
   - waitForArticles: allowEmptyオプション追加

2. **__tests__/e2e/filter-persistence.spec.ts**
   - 検索ボックスのStrict Mode対応

3. **__tests__/e2e/specs/source-exclude.spec.ts**
   - チェックボックス操作の安定化
   - デバッグログ追加

4. **__tests__/e2e/date-range-filter.spec.ts**
   - 記事リスト待機処理の改善

5. **__tests__/e2e/recommendation.spec.ts**
   - 非表示要素のチェック改善

## テスト結果

### 改善前（2025年9月11日午前）
- 成功率: 94.89% (93/98)
- 失敗: 5テスト

### 改善後（2025年9月11日夕方）
- date-range-filter.spec.ts: ✅ 成功
- filter-persistence.spec.ts: ⚠️ Flaky（部分的改善）
- source-exclude.spec.ts: ⚠️ Flaky（調査継続中）

## 関連コミット

- `66ba370`: タイムアウト削減（問題の原因）
- `2677720`: infinite scrollテスト修正
- `a9f0673`: CI実行時間最適化 Phase 3
- `1cc2d90`: 残存タイムアウト問題の追加修正（最新）

## 今後の課題

1. **Flakyテストの完全解消**
   - filter-persistenceの検索ボックスリセット
   - source-excludeのURL同期問題

2. **認証フローテストの安定化**
   - password-change-improved.spec.ts
   - login-improved.spec.ts

3. **CI環境固有の問題**
   - ネットワーク遅延対策
   - リソース制限への対応

## 推奨事項

1. **タイムアウト戦略**
   - CI環境: 長めのタイムアウト（10-20秒）
   - ローカル: 短めのタイムアウト（3-5秒）
   - 環境変数での切り替え実装

2. **デバッグ機能**
   - CI失敗時のスクリーンショット自動保存
   - 詳細なログ出力オプション

3. **テストの独立性**
   - 各テストの完全な初期化
   - 前のテストの影響を受けない設計

## 実装詳細

### waitForUrlParam関数の改善

```typescript
export async function waitForUrlParam(
  page: Page,
  param: string,
  value?: string,
  options: { timeout?: number; polling?: number } = {}
): Promise<void> {
  const timeout = options.timeout ?? getTimeout('long');
  const polling = options.polling ?? 100;
  const maxRetries = 3;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await page.waitForFunction(
        ({ param, value }) => {
          const url = new URL(window.location.href);
          const paramValue = url.searchParams.get(param);
          return value === undefined ? paramValue !== null : paramValue === value;
        },
        { param, value },
        { timeout: Math.max(5000, timeout / maxRetries), polling }
      );
      return;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await page.waitForTimeout(1000);
    }
  }
}
```

### テスト実行コマンド

```bash
# 全E2Eテスト実行
npm run test:e2e

# 特定テストのみ実行
npm run test:e2e -- date-range-filter.spec.ts

# デバッグモード
npm run test:e2e:debug

# UIモード（インタラクティブ）
npm run test:e2e:ui
```

## メンテナンス履歴

- 2025-09-11 17:00: タイムアウト問題修正、Strict Mode対応
- 2025-09-11 15:00: 初期調査、問題特定
- 2025-09-11 10:00: テスト改善要求受領

---

作成日: 2025年9月11日
作成者: Claude Code
バージョン: 1.0.0