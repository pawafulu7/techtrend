# E2Eテストデバッグガイド

## 重要：テスト失敗時の対応原則

**❌ やってはいけないこと**
- タイムアウトを延長する
- 実際のページを確認せずに推測で修正する
- 小手先の修正を繰り返す

**✅ 正しいアプローチ**
- 実際のページ構造を確認する
- コンポーネントの実装を理解する
- 正確なセレクタを使用する

## 1. 実際のページ構造の確認方法

### 方法1: エラー出力の活用
Playwrightのエラー出力には実際のDOM構造が含まれています：
```
test-results/__tests__-e2e-{test-name}/error-context.md
```

### 方法2: デバッグスクリプトの作成
```javascript
// /tmp/debug-page.mjs
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

// DOM構造の確認
const filterArea = await page.$('[data-testid="filter-area"]');
console.log('filter-area found:', !!filterArea);

// スクリーンショット保存
await page.screenshot({ path: '/tmp/debug.png', fullPage: true });
await browser.close();
```

### 方法3: Playwright UIモード
```bash
npm run test:e2e:ui
```
インタラクティブにセレクタを確認できます。

## 2. よくある問題と解決策

### 問題1: data-testid属性が見つからない
**原因**: shadcn/ui（Radix UI）などのコンポーネントライブラリは属性を伝播しない

**解決策**: role属性を使用
```typescript
// ❌ 間違い
await page.locator('[data-testid="date-range-filter"]');

// ✅ 正しい
await page.locator('[role="combobox"]');
```

### 問題2: 要素が表示されない
**原因**: レスポンシブデザインで特定のビューポートでのみ表示

**解決策**: 適切なビューポートサイズを設定
```typescript
test.use({
  viewport: { width: 1280, height: 720 } // デスクトップサイズ
});
```

### 問題3: タイムアウトエラー
**原因**: ほとんどの場合、セレクタが間違っている

**解決策**:
1. 実際のDOM構造を確認
2. 正しいセレクタを使用
3. タイムアウトは延長しない

## 3. セレクタの優先順位

1. **role属性**（最も安定）
   ```typescript
   page.locator('[role="combobox"]')
   page.locator('[role="button"]')
   ```

2. **data-testid**（明示的）
   ```typescript
   page.locator('[data-testid="filter-area"]')
   ```

3. **テキストコンテンツ**（ユーザー視点）
   ```typescript
   page.getByText('全期間')
   page.locator('button').filter({ hasText: 'Submit' })
   ```

## 4. 実例：date-range-filterテストの修正

### 失敗したアプローチ（2025年1月）
```typescript
// ❌ 実装を確認せずに何度も修正
// ❌ タイムアウトを延長しようとした
// ❌ 結果：時間の無駄
```

### 成功したアプローチ
```typescript
// ✅ エラー出力からDOM構造を確認
// ✅ shadcn/ui Selectがrole="combobox"でレンダリングされることを発見
// ✅ role属性ベースのセレクタに変更

const combobox = filterArea.locator('[role="combobox"]').first();
await combobox.click();

const dropdown = page.locator('[role="listbox"]');
await dropdown.locator('[role="option"]').filter({ hasText: '今日' }).click();
```

## 5. デバッグチェックリスト

- [ ] エラーメッセージのDOM構造を確認した
- [ ] 実際のページをブラウザで確認した
- [ ] コンポーネントの実装コードを読んだ
- [ ] UIライブラリの特性を理解した
- [ ] ビューポートサイズは適切か確認した
- [ ] セレクタが実際の要素を指しているか確認した

## 6. 便利なデバッグコマンド

```bash
# デバッグモード
PWDEBUG=1 npm run test:e2e

# UIモード（推奨）
npm run test:e2e:ui

# ヘッドレスモード無効化
npm run test:e2e:headed

# 特定のテストのみ実行
npm run test:e2e -- path/to/test.spec.ts --reporter=list
```

## まとめ

**黄金律：推測するな、確認せよ**

E2Eテストの失敗は、ほぼ全てのケースで：
1. セレクタが間違っている
2. 要素が存在しない/表示されない
3. 非同期処理のタイミング

のいずれかが原因です。タイムアウトを延長しても問題は解決しません。
必ず実際のページ構造を確認してから修正してください。

---
最終更新: 2025年1月
作成理由: date-range-filter E2Eテストの修正で時間を無駄にした教訓から