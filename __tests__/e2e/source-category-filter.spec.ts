import { test, expect } from '@playwright/test';

test.describe('ソースカテゴリフィルター機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // ページ読み込み完了を待つ
    await page.waitForSelector('[data-testid="filter-area"]');
  });

  test('カテゴリが表示される', async ({ page }) => {
    // 各カテゴリが表示されることを確認
    await expect(page.locator('text=海外ソース')).toBeVisible();
    await expect(page.locator('text=国内情報サイト')).toBeVisible();
    await expect(page.locator('text=企業ブログ')).toBeVisible();
    await expect(page.locator('text=プレゼンテーション')).toBeVisible();
  });

  test('カテゴリの展開/折りたたみが動作する', async ({ page }) => {
    // 海外ソースカテゴリのトリガーを取得
    const foreignCategory = page.locator('text=海外ソース').first();
    
    // 初期状態では展開されている（Dev.toが見える）
    await expect(page.locator('text=Dev.to')).toBeVisible();
    
    // カテゴリをクリックして折りたたむ
    await foreignCategory.click();
    
    // Dev.toが非表示になることを確認
    await expect(page.locator('text=Dev.to')).toBeHidden();
    
    // 再度クリックして展開
    await foreignCategory.click();
    
    // Dev.toが再び表示されることを確認
    await expect(page.locator('text=Dev.to')).toBeVisible();
  });

  test('カテゴリ単位での全選択が動作する', async ({ page }) => {
    // 海外ソースカテゴリが展開されていることを確認
    await expect(page.locator('text=Dev.to')).toBeVisible();
    
    // まず全解除ボタンをクリック（すべてを解除）
    const deselectAllButton = page.locator('[data-testid="deselect-all-button"]');
    await deselectAllButton.click();
    
    // 少し待つ
    await page.waitForTimeout(500);
    
    // 海外ソースカテゴリ内の「全選択」ボタンを見つけてクリック
    // カテゴリ内の全選択ボタンは複数あるので、海外ソースセクション内のものを特定
    const foreignSection = page.locator('div:has(> div:has-text("海外ソース"))');
    const categorySelectAllButton = foreignSection.locator('button:has-text("全選択")').last();
    await categorySelectAllButton.click();
    
    // 海外ソースのチェックボックスが選択されることを確認
    const devtoCheckbox = page.locator('[data-testid="source-checkbox-cmdq3nww70003tegxm78oydnb"] input[type="checkbox"]');
    await expect(devtoCheckbox).toBeChecked();
    
    // 国内情報サイトのチェックボックスは選択されていないことを確認
    const qiitaCheckbox = page.locator('[data-testid="source-checkbox-cmdq440c90000tewuti7ng0un"] input[type="checkbox"]');
    await expect(qiitaCheckbox).not.toBeChecked();
  });

  test('カテゴリ単位での全解除が動作する', async ({ page }) => {
    // 初期状態では全て選択されている
    const devtoCheckbox = page.locator('[data-testid="source-checkbox-cmdq3nww70003tegxm78oydnb"] input[type="checkbox"]');
    await expect(devtoCheckbox).toBeChecked();
    
    // 海外ソースカテゴリ内の「全解除」ボタンをクリック
    const foreignSection = page.locator('div:has(> div:has-text("海外ソース"))');
    const categoryDeselectAllButton = foreignSection.locator('button:has-text("全解除")').last();
    await categoryDeselectAllButton.click();
    
    // 海外ソースのチェックボックスが解除されることを確認
    await expect(devtoCheckbox).not.toBeChecked();
  });

  test('個別ソースの選択が動作する', async ({ page }) => {
    // 全解除してからテスト
    const deselectAllButton = page.locator('[data-testid="deselect-all-button"]');
    await deselectAllButton.click();
    
    // Dev.toのチェックボックスをクリック
    const devtoRow = page.locator('[data-testid="source-checkbox-cmdq3nww70003tegxm78oydnb"]');
    await devtoRow.click();
    
    // チェックボックスが選択されることを確認
    const devtoCheckbox = devtoRow.locator('input[type="checkbox"]');
    await expect(devtoCheckbox).toBeChecked();
    
    // URLパラメータが更新されることを確認
    await page.waitForTimeout(200); // デバウンス処理を待つ
    const url = page.url();
    expect(url).toContain('sources=');
    expect(url).toContain('cmdq3nww70003tegxm78oydnb');
  });

  test('選択数が正しく表示される', async ({ page }) => {
    // 全選択状態での選択数を確認
    const sourceCount = page.locator('[data-testid="source-count"]');
    await expect(sourceCount).toHaveText('21/21');
    
    // 全解除
    const deselectAllButton = page.locator('[data-testid="deselect-all-button"]');
    await deselectAllButton.click();
    await page.waitForTimeout(200); // デバウンス処理を待つ
    await expect(sourceCount).toHaveText('0/21');
    
    // 海外ソースカテゴリのみ選択
    const foreignSection = page.locator('div:has(> div:has-text("海外ソース"))');
    const categorySelectAllButton = foreignSection.locator('button:has-text("全選択")').last();
    await categorySelectAllButton.click();
    
    // 海外ソースの数が12個なので12/21となるはず
    await expect(sourceCount).toHaveText('12/21');
  });

  test('カテゴリごとの選択数が表示される', async ({ page }) => {
    // 海外ソースカテゴリの選択数表示を確認
    const foreignCategoryHeader = page.locator('text=海外ソース').first();
    const foreignCountText = foreignCategoryHeader.locator('..').locator('text=/(\\d+)\\/(\\d+)/');
    
    // 初期状態では全選択（12/12）
    await expect(foreignCountText).toContainText('12/12');
    
    // 海外ソースカテゴリを全解除
    const foreignSection = page.locator('div:has(> div:has-text("海外ソース"))');
    const categoryDeselectAllButton = foreignSection.locator('button:has-text("全解除")').last();
    await categoryDeselectAllButton.click();
    
    // 0/12になることを確認
    await expect(foreignCountText).toContainText('0/12');
  });

  test('モバイル表示でもカテゴリフィルターが動作する', async ({ page }) => {
    // モバイルサイズに変更
    await page.setViewportSize({ width: 375, height: 667 });
    
    // モバイルフィルターボタンをクリック
    const mobileFilterButton = page.locator('button:has-text("フィルター")');
    await mobileFilterButton.click();
    
    // フィルターシートが開くのを待つ
    await page.waitForSelector('[data-testid="filter-area"]');
    
    // カテゴリが表示されることを確認
    await expect(page.locator('text=海外ソース')).toBeVisible();
    await expect(page.locator('text=国内情報サイト')).toBeVisible();
    await expect(page.locator('text=企業ブログ')).toBeVisible();
    await expect(page.locator('text=プレゼンテーション')).toBeVisible();
  });
});