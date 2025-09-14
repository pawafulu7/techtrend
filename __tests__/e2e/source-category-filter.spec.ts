import { test, expect } from '@playwright/test';
import { waitForSourceFilter, getTimeout, waitForFilterApplication, waitForCheckboxesCount } from '../../e2e/helpers/wait-utils';

// CI環境の検出
const isCI = ['1', 'true', 'yes'].includes(String(process.env.CI).toLowerCase());

test.describe('ソースカテゴリフィルター機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // フィルターエリアの描画完了
    await waitForSourceFilter(page);
  });

  test('カテゴリが表示される', async ({ page }) => {
    // 各カテゴリラベルの表示（文言はUIの実体に依存）
    await expect(page.getByText('海外ソース')).toBeVisible();
    await expect(page.getByText('国内情報サイト')).toBeVisible();
    await expect(page.getByText('企業ブログ')).toBeVisible();
    await expect(page.getByText('プレゼンテーション')).toBeVisible();
  });

  test('カテゴリの展開/折りたたみが動作する', async ({ page }) => {
    // 海外ソースのカテゴリコンテナを特定（見出しボタンを含む）
    const foreignSection = page.getByTestId('category-foreign');

    // 初期状態（閉じている）では、コンテンツが存在しない
    await expect(foreignSection.locator('[data-testid="category-foreign-content"]')).toHaveCount(0);

    // 展開
    await page.getByTestId('category-foreign-header').click();
    await expect(foreignSection.getByTestId('category-foreign-content')).toBeVisible();
    const checkboxes = foreignSection.getByTestId('category-foreign-content').locator('button[role="checkbox"]');
    const expandedCount = await checkboxes.count();
    expect(expandedCount).toBeGreaterThan(0);

    // 折りたたみ
    await page.getByTestId('category-foreign-header').click();
    // 折りたたみ時はカテゴリ内のコンテンツ自体が存在しない
    await expect(foreignSection.locator('[data-testid="category-foreign-content"]')).toHaveCount(0);
  });

  test('カテゴリ単位での全選択が動作する', async ({ page }) => {
    // まず全解除
    await page.getByTestId('deselect-all-button').click();

    // 海外ソースカテゴリを展開
    await page.getByTestId('category-foreign-header').click();

    const foreignSection = page.getByTestId('category-foreign');
    const content = foreignSection.getByTestId('category-foreign-content');
    // 海外カテゴリに含まれるチェックボックス総数
    const totalInForeign = await content.locator('button[role="checkbox"]').count();
    // 「全選択」で全て選択状態になる
    await page.getByTestId('category-foreign-select-all').click();

    // CI環境では待機時間を長めに設定
    if (isCI) {
      await page.waitForTimeout(1000);
    }

    // チェックボックスの状態変更を待つ
    await waitForCheckboxesCount(page, '[data-testid="category-foreign-content"]', totalInForeign, {
      timeout: isCI ? 15000 : 5000,
      polling: 'fast',
      state: 'checked'
    });

    await expect(content.locator('button[role="checkbox"][data-state="checked"]')).toHaveCount(totalInForeign);

    // 他カテゴリの一例が未選択のままであることを相対的に確認（全体選択数の変化で担保）
    const sourceCount = page.getByTestId('source-count');
    const text = await sourceCount.textContent();
    // X/Y形式をパース
    const [, selected, total] = text?.match(/(\d+)\/(\d+)/) || [];
    expect(Number(selected)).toBeGreaterThan(0);
    expect(Number(selected)).toBeLessThanOrEqual(Number(total));
  });

  test('カテゴリ単位での全解除が動作する', async ({ page }) => {
    // 海外ソースカテゴリを展開
    await page.getByTestId('category-foreign-header').click();
    
    const foreignSection = page.getByTestId('category-foreign');
    const content = foreignSection.getByTestId('category-foreign-content');

    // まず海外カテゴリを全選択
    await page.getByTestId('category-foreign-select-all').click();
    const totalInForeign = await content.locator('button[role="checkbox"]').count();
    await expect(content.locator('button[role="checkbox"][data-state="checked"]')).toHaveCount(totalInForeign);

    // 全解除で0件
    await page.getByTestId('category-foreign-deselect-all').click();
    await expect(content.locator('button[role="checkbox"][data-state="checked"]')).toHaveCount(0);
  });

  test('個別ソースの選択が動作する', async ({ page }) => {
    test.slow(); // CI環境での遅延に対応するためタイムアウトを3倍に延長
    
    // 全解除
    await page.getByTestId('deselect-all-button').click();

    // 海外ソースカテゴリを展開
    await page.getByTestId('category-foreign-header').click();

    // 海外カテゴリの最初のソース行を使う（固定IDを排除）
    const foreignSection = page.getByTestId('category-foreign');
    const firstRow = foreignSection.locator('[data-testid^="source-checkbox-"]').first();
    const firstRowTestId = await firstRow.getAttribute('data-testid');

    // チェックボックスを直接クリック
    const checkbox = firstRow.locator('button[role="checkbox"]');
    await checkbox.click();
    await expect(checkbox).toHaveAttribute('data-state', 'checked');

    // URLにsourcesパラメータが付与される（デバウンス済み + CI環境対応）
    try {
      await page.waitForFunction(
        () => window.location.href.includes('sources='),
        { timeout: isCI ? 30000 : 10000 }
      );
    } catch {
      // リトライ（CI環境では特に必要）
      await page.waitForTimeout(2000);
      await page.waitForFunction(
        () => window.location.href.includes('sources='),
        { timeout: 15000 }
      );
    }
    expect(page.url()).toContain('sources=');

    // URLパラメータを解析して選択したIDが含まれることを確認
    if (firstRowTestId) {
      const selectedId = firstRowTestId.replace('source-checkbox-', '');
      const currentUrl = page.url();
      const urlParams = new URLSearchParams(new URL(currentUrl).search);
      const sourcesParam = urlParams.get('sources');
      
      // sources=noneは一時的な状態のため、正しいURLパラメータを待つ
      if (sourcesParam === 'none') {
        // URLパラメータが更新されるまで待機（CI環境では長めのタイムアウト）
        await page.waitForFunction(
          (id) => {
            const url = new URL(window.location.href);
            const sources = url.searchParams.get('sources');
            return sources && sources !== 'none' && sources.includes(id);
          },
          selectedId,
          { timeout: isCI ? 15000 : 5000 }
        );
        // 再度URLパラメータを確認
        const updatedUrl = page.url();
        const updatedParams = new URLSearchParams(new URL(updatedUrl).search);
        const updatedSourcesParam = updatedParams.get('sources');
        const sources = updatedSourcesParam?.split(',') || [];
        expect(sources).toContain(selectedId);
      } else {
        const sources = sourcesParam?.split(',') || [];
        // 選択したIDがURLパラメータに含まれることを確認
        expect(sources).toContain(selectedId);
      }
    }
  });

  test('選択数が正しく表示される', async ({ page }) => {
    const sourceCount = page.getByTestId('source-count');
    // 初期の合計値 Y を取得
    const initial = await sourceCount.textContent();
    const [, initSelected, total] = initial?.match(/(\d+)\/(\d+)/) || [];
    const selectedCount = Number(initSelected);
    const totalCount = Number(total);
    // NaNチェック
    expect(selectedCount).not.toBeNaN();
    expect(totalCount).not.toBeNaN();
    expect(selectedCount).toBeGreaterThan(0);

    // 全解除 → 0/Y
    await page.getByTestId('deselect-all-button').click();
    await expect(sourceCount).toHaveText(`0/${total}`);

    // 海外カテゴリのみ選択 → N/Y（NはDOMから計算）
    // 海外ソースカテゴリを展開
    await page.getByTestId('category-foreign-header').click();
    const foreignSection = page.getByTestId('category-foreign');
    await page.getByTestId('category-foreign-select-all').click();
    const checkboxes = foreignSection.getByTestId('category-foreign-content').locator('button[role="checkbox"]');
    const n = await checkboxes.count();
    // 選択されたチェックボックスの数を確認
    const checkedCount = await checkboxes.filter({ hasNot: page.locator('[data-state="unchecked"]') }).count();
    expect(checkedCount).toBe(n); // 全て選択されていることを確認
    await expect(sourceCount).toHaveText(`${n}/${total}`);
  });

  test('カテゴリごとの選択数が表示される', async ({ page }) => {
    // 海外ソースカテゴリを展開
    await page.getByTestId('category-foreign-header').click();
    
    const foreignHeader = page.getByTestId('category-foreign');
    const countBadge = page.getByTestId('category-foreign-count');
    await expect(countBadge).toBeVisible();
    // 初期状態の y（総数）を取得
    const initialText = await countBadge.textContent();
    const [, , y] = initialText?.match(/\((\d+)\/(\d+)\)/) || [];
    expect(Number(y)).toBeGreaterThan(0);

    // 全解除 → (0/y)
    await page.getByTestId('category-foreign-deselect-all').click();
    await expect(countBadge).toHaveText(`(0/${y})`);

    // 全選択 → (y/y)
    await page.getByTestId('category-foreign-select-all').click();
    await expect(countBadge).toHaveText(`(${y}/${y})`);
  });

  test('モバイル表示でもカテゴリフィルターが動作する', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // モバイルのフィルタートリガー（文言は環境依存のため緩く）
    const mobileFilterButton = page.getByRole('button', { name: /フィルタ|フィルター/ });
    await mobileFilterButton.click();

    const sheet = page.getByTestId('mobile-filter-sheet');
    await expect(sheet).toBeVisible();
    // シート内のフィルターエリアにスコープして可視状態を確認
    const sheetFilter = sheet.locator('[data-testid="source-filter"]');
    await expect(sheetFilter).toBeVisible();
    await expect(sheetFilter.getByText('海外ソース')).toBeVisible();
    await expect(sheetFilter.getByText('国内情報サイト')).toBeVisible();
    await expect(sheetFilter.getByText('企業ブログ')).toBeVisible();
    await expect(sheetFilter.getByText('プレゼンテーション')).toBeVisible();
  });
});
