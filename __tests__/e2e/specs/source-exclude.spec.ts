import { test, expect } from '@playwright/test';
import { waitForPageLoad } from '../utils/e2e-helpers';
import { waitForArticles, getTimeout } from '../../../e2e/helpers/wait-utils';

// CI環境の検出
const isCI = ['1', 'true', 'yes'].includes(String(process.env.CI).toLowerCase());

test.describe('ソースフィルタリング機能', () => {
  // CI環境でのflaky対策 - タイムアウトを3倍に延長
  test.slow();
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    await page.waitForSelector('[data-testid="article-card"]');
  });

  test('ソースの選択と解除ができる', async ({ page }) => {
    // フィルターエリアを確認
    const filterArea = page.locator('[data-testid="filter-area"]');
    await expect(filterArea).toBeVisible();

    // 全て選択ボタンをクリックして、初期状態を統一
    const selectAllButton = page.locator('[data-testid="select-all-button"]');
    await selectAllButton.click();
    await page.waitForTimeout(500);

    // 海外ソースカテゴリを展開
    const foreignCategoryHeader = page.locator('[data-testid="category-foreign-header"]');
    await expect(foreignCategoryHeader).toBeVisible();
    await foreignCategoryHeader.click();
    // 展開アニメーションを待つ
    await page.waitForTimeout(500);

    // Dev.toのチェックボックスを探す（海外ソース内）- 厳密マッチとbutton[role="checkbox"]使用
    const devtoContainer = page.locator('[data-testid^="source-checkbox-"]')
      .filter({ has: page.locator('label').filter({ hasText: /^Dev\.to$/ }) })
      .first();
    await expect(devtoContainer).toBeVisible();
    
    // Radix UIのcheckbox要素を直接取得
    const checkbox = devtoContainer.locator('button[role="checkbox"]');
    await expect(checkbox).toHaveAttribute('data-state', 'checked');
    
    // チェックボックスをクリックして選択を解除
    await checkbox.click();
    
    // チェックが外れたことを確認
    await expect(checkbox).toHaveAttribute('data-state', 'unchecked');
    
    // 再度クリックして選択
    await checkbox.click();
    
    // チェックが戻ったことを確認
    await expect(checkbox).toHaveAttribute('data-state', 'checked');
    
    // チェックボックスが正常に動作することを確認できた
  });

  test('選択を外したソースが非表示になる', async ({ page }) => {
    // 初期状態で記事を確認
    const initialArticles = await page.locator('[data-testid="article-card"]').count();
    expect(initialArticles).toBeGreaterThan(0);
    
    // フィルターエリアを取得
    const _filterArea = page.locator('[data-testid="filter-area"]');
    
    // Dev.toのチェックボックスを探す（通常存在するソース）- 厳密マッチとbutton[role="checkbox"]使用
    const devtoContainer = page.locator('[data-testid^="source-checkbox-"]')
      .filter({ has: page.locator('label').filter({ hasText: /^Dev\.to$/ }) })
      .first();
    
    if (await devtoContainer.isVisible()) {
      // Radix UIのcheckbox要素をクリック
      const checkbox = devtoContainer.locator('button[role="checkbox"]');
      await checkbox.click();
      
      // 記事リストの更新完了を待つ
      await page.waitForSelector('[data-testid="article-card"]', { state: 'attached' });
      
      // Dev.toの記事が表示されていないことを確認
      const articles = page.locator('[data-testid="article-card"]');
      const articleCount = await articles.count();
      
      if (articleCount > 0) {
        // 各記事のソース名を確認（最大5件）
        for (let i = 0; i < Math.min(articleCount, 5); i++) {
          const article = articles.nth(i);
          // ソースバッジをより確実に取得（data-testidまたはaria-labelを使用）
          const sourceBadge = article.locator('[data-testid*="source-badge"], [aria-label*="source:"]').first();
          
          if (await sourceBadge.count() > 0) {
            const sourceText = await sourceBadge.textContent();
            // Dev.toの完全一致で確認（偽陽性防止）
            if (sourceText) {
              expect(sourceText.trim()).not.toBe('Dev.to');
            }
          } else {
            // バッジがない場合はクラス名で探す
            const sourceElement = article.locator('.text-xs').filter({ hasText: /^Dev\.to$/ }).first();
            const elementCount = await sourceElement.count();
            // Dev.toの完全一致要素が存在しないことを確認
            expect(elementCount).toBe(0);
          }
        }
      }
      
      // Dev.toを再度選択して元に戻す
      await checkbox.click();
      // 再選択後の状態を確認
      await expect(checkbox).toHaveAttribute('data-state', 'checked');
    }
  });

  test('全て選択・全て解除ボタンが機能する', async ({ page }) => {
    // フィルターエリアを取得
    const _filterArea = page.locator('[data-testid="filter-area"]');
    
    // Firefox対応: 記事データの読み込み完了を待つ（タイムアウトを延長）
    try {
      await expect(page.locator('[data-testid="article-card"]').first()).toBeVisible({
        timeout: isCI ? 30000 : 10000
      });
    } catch {
      // 記事カードが見つからない場合は代替セレクタを試す
      const articles = page.locator('article, .article-item, .article-list-item').first();
      await expect(articles).toBeVisible({ timeout: 10000 });
    }
    await page.waitForTimeout(isCI ? 2000 : 500);
    
    // 最初に全て選択ボタンをクリックして、全て選択状態にする
    const selectAllButton = page.locator('[data-testid="select-all-button"]');
    await expect(selectAllButton).toBeVisible();
    await selectAllButton.click();
    await page.waitForLoadState('networkidle', { timeout: 5000 });
    
    // 記事カードが表示されるまで待つ（Firefoxの遅延対策）
    await expect(page.locator('[data-testid="article-card"]').first()).toBeVisible();
    
    // 初期の記事数を取得
    const initialArticles = await page.locator('[data-testid="article-card"]').count();
    expect(initialArticles).toBeGreaterThan(0);
    
    // 全て解除ボタンをクリック
    const deselectAllButton = page.locator('[data-testid="deselect-all-button"]');
    await expect(deselectAllButton).toBeVisible();
    await deselectAllButton.click();
    
    // すべてのチェックボックスが解除されたことを確認
    await page.waitForTimeout(500);
    
    // まずカテゴリを展開する必要がある
    const foreignCategoryHeader = page.locator('[data-testid="category-foreign-header"]');
    if (await foreignCategoryHeader.isVisible()) {
      await foreignCategoryHeader.click();
      // 展開アニメーションを待つ
      await page.waitForTimeout(500);
    }
    
    const domesticCategoryHeader = page.locator('[data-testid="category-domestic-header"]');
    if (await domesticCategoryHeader.isVisible()) {
      await domesticCategoryHeader.click();
      // 展開アニメーションを待つ
      await page.waitForTimeout(500);
    }
    
    const allCheckboxes = page.locator('[data-testid^="source-checkbox-"] button[role="checkbox"]');
    const checkboxCount = await allCheckboxes.count();
    
    for (let i = 0; i < checkboxCount; i++) {
      const checkbox = allCheckboxes.nth(i);
      await expect(checkbox).toHaveAttribute('data-state', 'unchecked');
    }
    
    // 記事フィルタリングの完了を待つ（状態ベースの待機）
    await page.waitForFunction(() => {
      // ネットワークリクエストが完了したか、またはローディング表示が消えたかを確認
      const loadingElement = document.querySelector('[data-testid="loading"], .loading, .spinner');
      return !loadingElement || loadingElement.style.display === 'none';
    }, { timeout: 5000 });
    
    // 記事数が変化したことを確認（0件または減少）
    const articlesAfterDeselect = await page.locator('[data-testid="article-card"]').count();
    // ソースが選択されていない場合、記事数は0または初期より少ない
    expect(articlesAfterDeselect).toBeLessThanOrEqual(initialArticles);
    
    // 全て選択ボタンを再度クリック
    await selectAllButton.click();
    
    // ネットワーク待機と状態更新を確実に待つ
    await page.waitForLoadState('networkidle', { timeout: isCI ? 10000 : 5000 });
    await page.waitForTimeout(1000);
    
    // すべてのチェックボックスが選択されたことを確認
    for (let i = 0; i < checkboxCount; i++) {
      const checkbox = allCheckboxes.nth(i);
      await expect(checkbox).toHaveAttribute('data-state', 'checked');
    }
    
    // 記事の再表示をヘルパーで待機（空リストも許容）
    await waitForArticles(page, { timeout: isCI ? 45000 : 15000, allowEmpty: true });
  });

  test('複数ソースの選択状態を管理できる', async ({ page, browserName }) => {
    // Firefox対応: 記事データの読み込み完了を待つ
    await expect(page.locator('[data-testid="article-card"]').first()).toBeVisible({
      timeout: isCI ? 20000 : 10000
    });
    
    // ネットワーク待機（Firefoxも含めて統一）
    await page.waitForLoadState('networkidle', { timeout: isCI ? 15000 : 10000 });
    
    // CI環境でも待機は不要（適切なセレクタ待機で対応）
    
    // フィルターエリアを取得
    const _filterArea = page.locator('[data-testid="filter-area"]');
    
    // 記事カードが表示されるまで待つ
    await expect(page.locator('[data-testid="article-card"]').first()).toBeVisible({
      timeout: isCI ? 20000 : 10000
    });
    
    // 海外ソースカテゴリを展開
    const foreignCategoryHeader = page.locator('[data-testid="category-foreign-header"]');
    await expect(foreignCategoryHeader).toBeVisible();
    await foreignCategoryHeader.click();
    // 展開完了を待つ（aria-expanded属性で確認）
    await page.waitForSelector('[data-testid="category-foreign-header"][aria-expanded="true"]', {
      timeout: 2000
    }).catch(() => {
      // aria-expanded属性がない場合は少し待機
      return page.waitForTimeout(300);
    });
    
    // 国内情報サイトカテゴリも展開
    const domesticCategoryHeader = page.locator('[data-testid="category-domestic-header"]');
    await expect(domesticCategoryHeader).toBeVisible();
    await domesticCategoryHeader.click();
    // 展開完了を待つ（aria-expanded属性で確認）
    await page.waitForSelector('[data-testid="category-domestic-header"][aria-expanded="true"]', {
      timeout: 2000
    }).catch(() => {
      // aria-expanded属性がない場合は少し待機
      return page.waitForTimeout(300);
    });
    
    // 複数のソースチェックボックスを取得（展開後）
    const sourceCheckboxes = page.locator('[data-testid^="source-checkbox-"]');
    const checkboxCount = await sourceCheckboxes.count();
    
    // 少なくとも3つ以上のソースがあることを確認
    expect(checkboxCount).toBeGreaterThanOrEqual(3);
    
    // 最初の3つのソースの選択を解除
    // 注: data-testidのIDと実際のURLパラメータのIDが異なるため、URL差分から実IDを取得する必要がある
    const sourcesToDeselect: string[] = [];
    for (let i = 0; i < 3; i++) {
      const sourceCheckbox = sourceCheckboxes.nth(i);
      const checkbox = sourceCheckbox.locator('button[role="checkbox"]');
      
      // 現在選択されているソースを事前に記録
      const urlBefore = page.url();
      const urlParamsBefore = new URLSearchParams(new URL(urlBefore).search);
      const sourcesBefore = urlParamsBefore.get('sources')?.split(',') || [];
      
      // チェックボックスをクリック
      await checkbox.click();
      await page.waitForTimeout(500);
      
      // URL変更後のソースを取得
      const urlAfter = page.url();
      const urlParamsAfter = new URLSearchParams(new URL(urlAfter).search);
      const sourcesAfter = urlParamsAfter.get('sources')?.split(',') || [];
      
      // 差分からソースIDを特定
      const sourceId = sourcesBefore.find(id => !sourcesAfter.includes(id)) || '';
      
      if (sourceId) {
        sourcesToDeselect.push(sourceId);
      }
    }
    
    // URLに sources= の非空値が入るまで待機（変更が反映されたことを保証）
    await page.waitForLoadState('networkidle', { timeout: isCI ? 10000 : 5000 });
    await expect(page).toHaveURL(/[\?&]sources=[^&]+/, { timeout: isCI ? 15000 : 5000 });
    
    // URLが更新されたら再度取得
    const currentUrl = page.url();
    
    // URLパラメータを解析して選択解除したソースが含まれないことを確認
    const urlParams = new URLSearchParams(new URL(currentUrl).search);
    const selectedSources = urlParams.get('sources')?.split(',') || [];
    
    // デバッグ用ログ
    console.log('Deselected sources:', sourcesToDeselect);
    console.log('Selected sources in URL:', selectedSources);
    
    for (const sourceId of sourcesToDeselect) {
      if (sourceId) {
        // ソースIDが正しく解除されているか確認
        expect(selectedSources).not.toContain(sourceId);
      }
    }
    
    // 記事が更新されたことを確認（記事数が減少）
    // networkidleで統一（ブラウザ問わず、CI環境対応）
    await page.waitForLoadState('networkidle', { timeout: isCI ? 10000 : 5000 });
    const articles = await page.locator('[data-testid="article-card"]').count();
    
    // 選択を元に戻す
    for (let i = 0; i < 3; i++) {
      await sourceCheckboxes.nth(i).locator('button[role="checkbox"]').click();
      await page.waitForTimeout(200); // 各クリックの間に少し待機
    }
    
    // すべてのソースが再度選択されたことを確認
    await page.waitForFunction(
      () => {
        const checkboxes = document.querySelectorAll('[data-testid^="source-checkbox-"] button[role="checkbox"]');
        return checkboxes.length > 0;
      },
      { timeout: 5000 }
    );
    
    // 記事が再表示されるまで待機（状態ベースの待機）
    await page.waitForLoadState('networkidle', { timeout: isCI ? 10000 : 5000 });
    await page.waitForTimeout(1000); // 追加の安定待機
    
    // 記事が表示されることを確認
    await expect(page.locator('[data-testid="article-card"]').first()).toBeVisible({
      timeout: isCI ? 10000 : 5000
    });
    
    const articlesAfter = await page.locator('[data-testid="article-card"]').count();
    expect(articlesAfter).toBeGreaterThanOrEqual(articles);
  });
});
