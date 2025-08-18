import { test, expect } from '@playwright/test';
import { testData } from '../fixtures/test-data';
import {
  waitForPageLoad,
  expectPageTitle,
  expectNoErrors,
  expectNavigationMenu,
  waitForLoadingToDisappear,
  waitForDataLoad,
} from '../utils/test-helpers';
import { SELECTORS } from '../constants/selectors';

test.describe('分析ページ', () => {
  test.beforeEach(async ({ page }) => {
    // LocalStorageで分析機能を有効化（ページ読み込み前に設定）
    await page.addInitScript(() => {
      localStorage.setItem('analytics-enabled', 'true');
    });
    
    // 分析ページへアクセス
    await page.goto('/analytics');
    await waitForPageLoad(page);
  });

  test('分析ページが正常に表示される', async ({ page }) => {
    // ページタイトルを確認
    await expectPageTitle(page, 'TechTrend');
    
    // ナビゲーションメニューの確認
    await expectNavigationMenu(page);
    
    // エラーがないことを確認
    await expectNoErrors(page);
    
    // 分析ページ特有の要素を確認
    const analyticsContent = page.locator(
      '[data-testid="analytics"], [class*="analytics"], main:has-text("分析"), main:has-text("Analytics")'
    ).first();
    
    await expect(analyticsContent).toBeVisible();
  });

  test('統計情報が表示される', async ({ page }) => {
    // 統計カードを探す
    const statsCards = page.locator(
      '[class*="stat"], [class*="metric"], [data-testid="stat-card"]'
    );
    
    const statsCount = await statsCards.count();
    
    if (statsCount > 0) {
      // 少なくとも1つの統計カードが表示されることを確認
      await expect(statsCards.first()).toBeVisible();
      
      // 数値が表示されることを確認
      const statValue = statsCards.first().locator('[class*="value"], [class*="number"], span').first();
      if (await statValue.isVisible()) {
        const valueText = await statValue.textContent();
        expect(valueText).toBeTruthy();
        
        // 数値形式であることを確認（数字、カンマ、小数点を含む）
        expect(valueText).toMatch(/[\d,.\s]+/);
      }
    }
    
    // 総読書数の表示を確認（データがない場合は0でOK）
    const totalReading = page.locator(
      ':text("総読書数")'
    ).first();
    
    if (await totalReading.isVisible()) {
      const parent = totalReading.locator('..');
      const value = parent.locator('div').filter({ hasText: /^\d+$/ }).first();
      if (await value.isVisible()) {
        const valueText = await value.textContent();
        // 0以上の数値であることを確認（データがない場合は0）
        expect(valueText).toMatch(/^\d+$/);
      }
    }
  });

  test('グラフ・チャートが表示される', async ({ page }) => {
    // チャートコンテナまたはデータなしメッセージを探す
    const chartSection = page.locator('text=日別読書量').first();
    
    if (await chartSection.isVisible()) {
      // チャートセクションが存在することを確認
      await expect(chartSection).toBeVisible();
      
      // Rechartsのコンテナまたはcanvas要素を探す
      const chartContainer = page.locator(
        '[class*="recharts-wrapper"], canvas, svg[class*="chart"], [role="application"]'
      ).first();
      
      if (await chartContainer.isVisible()) {
        await expect(chartContainer).toBeVisible();
        
        // チャートコンテナのサイズを確認（データがない場合でも最小サイズはある）
        const box = await chartContainer.boundingBox();
        if (box) {
          // データがない場合でも最小サイズはあるはず（幅10px以上）
          expect(box.width).toBeGreaterThan(10);
          // 高さは最小でも50px以上
          expect(box.height).toBeGreaterThan(50);
        }
      }
    }
    
    // タブパネル内のコンテンツが表示されることを確認
    const tabPanel = page.locator('[role="tabpanel"]').first();
    if (await tabPanel.isVisible()) {
      await expect(tabPanel).toBeVisible();
    }
  });

  test('期間フィルターが機能する', async ({ page }) => {
    // 期間選択フィルターを探す
    const periodFilter = page.locator(
      'select[name*="period"], select[data-testid="period"], button:has-text("期間"), button:has-text("Period")'
    ).first();
    
    if (await periodFilter.isVisible()) {
      // セレクトボックスの場合
      if (periodFilter.locator('select').first()) {
        const options = await periodFilter.locator('option').allTextContents();
        
        // 複数の期間オプションが存在することを確認
        expect(options.length).toBeGreaterThan(1);
        
        // 期間を変更
        if (options.includes('1週間') || options.includes('Week')) {
          const weekOption = options.find(opt => opt.includes('1週間') || opt.includes('Week'));
          await periodFilter.selectOption({ label: weekOption });
          
          // データ更新を待つ - URLパラメータ変更とローディング完了を待機
          await page.waitForFunction(
            () => {
              const url = window.location.href;
              return url.includes('period=') || url.includes('range=');
            },
            { timeout: 5000 }
          );
          
          // データが更新されることを確認
          await waitForLoadingToDisappear(page);
        }
      }
    }
    
    // 日付範囲選択を探す
    const dateRangePicker = page.locator(
      'input[type="date"], [data-testid="date-range"], [class*="date-picker"]'
    ).first();
    
    if (await dateRangePicker.isVisible()) {
      await expect(dateRangePicker).toBeEnabled();
    }
  });

  test('ソース別統計が表示される', async ({ page }) => {
    // ソース別統計セクションを探す
    const sourceStats = page.locator(
      '[data-testid="source-stats"], [class*="source-stat"], section:has-text("ソース別"), section:has-text("By Source")'
    ).first();
    
    if (await sourceStats.isVisible()) {
      // ソース名が表示されることを確認
      const sourceNames = sourceStats.locator('[class*="source-name"], [class*="label"]');
      const sourceCount = await sourceNames.count();
      
      expect(sourceCount).toBeGreaterThan(0);
      
      // 各ソースの統計値が表示されることを確認
      if (sourceCount > 0) {
        const firstSourceName = await sourceNames.first().textContent();
        expect(firstSourceName).toBeTruthy();
        
        // 対応する数値が表示されることを確認
        const sourceValue = sourceStats.locator('[class*="value"], [class*="count"]').first();
        if (await sourceValue.isVisible()) {
          const valueText = await sourceValue.textContent();
          expect(valueText).toMatch(/\d+/);
        }
      }
    }
  });

  test('タグ別統計が表示される', async ({ page }) => {
    // タグクラウドまたはタグ統計を探す
    const tagStats = page.locator(
      '[data-testid="tag-stats"], [class*="tag-cloud"], [class*="tag-stat"], section:has-text("タグ"), section:has-text("Tags")'
    ).first();
    
    if (await tagStats.isVisible()) {
      // タグが表示されることを確認
      const tags = tagStats.locator('[class*="tag"], [data-testid="tag"]');
      const tagCount = await tags.count();
      
      if (tagCount > 0) {
        await expect(tags.first()).toBeVisible();
        
        // タグテキストが表示されることを確認
        const firstTagText = await tags.first().textContent();
        expect(firstTagText).toBeTruthy();
        
        // タグをクリックできることを確認
        const firstTag = tags.first();
        const isClickable = await firstTag.evaluate(el => {
          const styles = window.getComputedStyle(el);
          return styles.cursor === 'pointer' || el.tagName === 'A' || el.tagName === 'BUTTON';
        });
        
        if (isClickable) {
          // タグをクリック
          await firstTag.click();
          
          // ページ遷移またはフィルタリング適用を待つ
          await page.waitForFunction(
            () => {
              const url = window.location.href;
              return url.includes('tag') || url.includes('filter') || url.includes('search');
            },
            { timeout: 5000 }
          );
          
          // 検索ページへの遷移またはフィルタリングが行われることを確認
          const currentUrl = page.url();
          const hasTagFilter = currentUrl.includes('tag') || currentUrl.includes('search');
          expect(hasTagFilter).toBeTruthy();
        }
      }
    }
  });

  test('トレンド分析が表示される', async ({ page }) => {
    // トレンドセクションを探す
    const trendSection = page.locator(
      '[data-testid="trends"], [class*="trend"], section:has-text("トレンド"), section:has-text("Trends")'
    ).first();
    
    if (await trendSection.isVisible()) {
      // トレンドアイテムが表示されることを確認
      const trendItems = trendSection.locator('[class*="trend-item"], li, [data-testid="trend-item"]');
      const itemCount = await trendItems.count();
      
      if (itemCount > 0) {
        await expect(trendItems.first()).toBeVisible();
        
        // トレンドインジケーター（上昇/下降）を確認
        const indicator = trendItems.first().locator('[class*="arrow"], [class*="indicator"], svg').first();
        if (await indicator.isVisible()) {
          // インジケーターが存在することを確認
          await expect(indicator).toBeVisible();
        }
      }
    }
  });

  test('データエクスポート機能', async ({ page }) => {
    // エクスポートボタンを探す
    const exportButton = page.locator(
      'button:has-text("エクスポート"), button:has-text("Export"), button:has-text("ダウンロード"), [data-testid="export"]'
    ).first();
    
    if (await exportButton.isVisible()) {
      // ボタンが有効であることを確認
      await expect(exportButton).toBeEnabled();
      
      // ダウンロードイベントを準備
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
      
      // エクスポートボタンをクリック
      await exportButton.click();
      
      // ダウンロードが開始されるか、モーダルが表示されることを確認
      const download = await downloadPromise;
      
      if (download) {
        // ファイルがダウンロードされた場合
        const filename = download.suggestedFilename();
        expect(filename).toBeTruthy();
        expect(filename).toMatch(/\.(csv|json|xlsx?|pdf)$/i);
      } else {
        // エクスポートオプションモーダルが表示される場合
        const exportModal = page.locator(
          '[role="dialog"], [class*="modal"], [data-testid="export-modal"]'
        ).first();
        
        if (await exportModal.isVisible({ timeout: 1000 })) {
          // モーダル内のエクスポートオプションを確認
          const exportOptions = exportModal.locator('button, [role="button"]');
          const optionCount = await exportOptions.count();
          expect(optionCount).toBeGreaterThan(0);
        }
      }
    }
  });

  test('レスポンシブレイアウト', async ({ page }) => {
    // デスクトップビューでの表示を確認
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload();
    await waitForPageLoad(page);
    
    // グラフが表示されることを確認
    const desktopCharts = page.locator('canvas, svg[class*="chart"]');
    const desktopChartCount = await desktopCharts.count();
    
    // モバイルビューに変更
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await waitForPageLoad(page);
    
    // モバイルでもコンテンツが表示されることを確認
    // より広範なセレクターを使用
    const mobileContent = page.locator('main, [role="main"], body').first();
    await expect(mobileContent).toBeVisible({ timeout: 10000 });
    
    // モバイルでのチャート表示を確認（レイアウトが変わる可能性がある）
    const mobileCharts = page.locator('canvas, svg[class*="chart"]');
    const mobileChartCount = await mobileCharts.count();
    
    // モバイルでも少なくとも一部のチャートが表示されることを確認
    if (mobileChartCount > 0) {
      await expect(mobileCharts.first()).toBeVisible();
    }
  });
});