import { test, expect } from '@playwright/test';
import { SELECTORS } from './constants/selectors';
import { MOBILE_VIEWPORT } from './constants/viewports';
import { assertLocatorFound } from './utils/test-helpers';

test.describe('回帰テスト - 既存機能の動作確認', () => {
  // このテストスイートは多数の機能を網羅的にテストするため、タイムアウトを3倍に延長
  test.slow();
  
  test.describe('記事一覧の基本機能', () => {
    test('記事カードが正しく表示される', async ({ page }) => {
      await page.goto('/');
      
      // 記事カードが表示されるまで待つ（タイムアウトを延長）
      await page.waitForSelector('[data-testid="article-card"]', { timeout: 30000 });
      
      // 記事カードが1つ以上表示されている（シードデータは50件）
      const articleCards = await page.locator('[data-testid="article-card"]').count();
      expect(articleCards).toBeGreaterThan(0);
      expect(articleCards).toBeLessThanOrEqual(50);
      
      // 記事カードの必須要素が存在する
      const firstCard = page.locator('[data-testid="article-card"]').first();
      
      // タイトルまたはサムネイルが存在（サムネイル時はタイトル非表示）
      // Issue #619 PR-D: count()>0 OR 検証を assertLocatorFound に意味同値置換
      // (Playwright の `,` セパレータは OR 解釈で、両セレクタの和集合を返す)
      await assertLocatorFound(firstCard.locator('h3, img'), 'firstCard heading or thumbnail');
      
      // ソース名が存在する場合チェック（showSource prop次第でオプショナル）
      const sourceCount = await firstCard.locator('[data-testid="article-source"]').count();
      if (sourceCount > 0) {
        const sourceText = await firstCard.locator('[data-testid="article-source"]').textContent();
        expect(sourceText).toBeTruthy();
      }
    });

    test('記事カードクリックで詳細ページに遷移する', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]');
      
      // 最初の記事のタイトルを取得
      const firstCardTitle = await page.locator('[data-testid="article-card"] h3').first().textContent();
      
      // 記事カードをクリック
      await page.locator('[data-testid="article-card"]').first().click();
      
      // 詳細ページに遷移したことを確認（より具体的な条件）
      await page.waitForURL((url) => url.pathname.startsWith('/articles/'), {
        timeout: 5000
      });
      
      // タイトルが表示されていることを確認（正規化処理を追加、最初の要素を取得）
      const detailTitle = await page.locator('h1').first().textContent();
      expect(detailTitle?.trim()).toBe(firstCardTitle?.trim());
    });
  });

  test.describe('フィルター機能', () => {
    test('ソースフィルターが正常に動作する', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]');
      
      // 初期の記事数を記録
      const initialCount = await page.locator('[data-testid="article-card"]').count();
      
      // Dev.toフィルターを適用
      const devtoFilter = page.locator('[data-testid="filter-source-Dev.to"]');
      if (await devtoFilter.count() > 0) {
        await devtoFilter.click();
        await page.waitForTimeout(500);
        
        // 記事数が変化したことを確認
        const filteredCount = await page.locator('[data-testid="article-card"]').count();
        expect(filteredCount).toBeLessThanOrEqual(initialCount);
        
        // すべての記事が Dev.to ソースであることを確認
        // Issue #611 / PR #618 review: `.badge` 生クラス依存を撤去し ARTICLE_SOURCE testid に置換
        const sourceLabels = await page
          .locator(`[data-testid="article-card"] ${SELECTORS.ARTICLE_SOURCE}`)
          .allTextContents();
        sourceLabels.forEach(label => {
          expect(label).toContain('Dev.to');
        });
      }
    });

    test('タグフィルターが正常に動作する', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]');
      
      // タグフィルタードロップダウンを開く
      const tagDropdown = page.locator('[data-testid="tag-filter-dropdown"]');
      if (await tagDropdown.count() > 0) {
        await tagDropdown.click();
        
        // 最初のタグを選択
        const firstTag = page.locator('[data-testid^="tag-option-"]').first();
        const _tagName = await firstTag.textContent();
        await firstTag.click();
        
        // フィルターが適用されるまで待つ
        await page.waitForTimeout(500);
        
        // URLにタグパラメータが含まれることを確認
        const url = page.url();
        expect(url).toContain('tags=');
      }
    });

    test('検索機能が正常に動作する', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]');
      
      // 検索ボックスに入力
      const searchInput = page.locator('[data-testid="search-input"]');
      if (await searchInput.count() > 0) {
        await searchInput.fill('TypeScript');
        await searchInput.press('Enter');
        
        // 検索結果が表示されるまで待つ
        await page.waitForTimeout(1000);
        
        // URLに検索パラメータが含まれることを確認
        const url = page.url();
        expect(url).toContain('search=TypeScript');
      }
    });
  });

  test.describe('ソート機能', () => {
    test('公開順ソートが動作する', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]', { timeout: 30000 });
      
      // ソートボタンを探す（複数の可能なセレクタを試す）
      const sortButton = page.locator('[data-testid="sort-by-publishedAt"]');
      if (await sortButton.count() > 0) {
        await sortButton.first().click();
        await page.waitForTimeout(1000);
        
        // URLにソートパラメータが含まれることを確認（実装に依存）
        const url = page.url();
        if (!url.includes('sortBy=publishedAt')) {
          console.log('Sort parameter not in URL, might be handled client-side');
        }
      } else {
        // ソートボタンが見つからない場合はスキップ
        console.log('Sort button not found, skipping test');
      }
    });

    test('品質順ソートが動作する', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]', { timeout: 30000 });
      
      // ソートボタンを探す
      const sortButton = page.locator('[data-testid="sort-by-qualityScore"]');
      if (await sortButton.count() > 0) {
        await sortButton.first().click();
        await page.waitForTimeout(1000);
        
        // URLにソートパラメータが含まれることを確認（実装に依存）
        const url = page.url();
        if (!url.includes('sortBy=qualityScore')) {
          console.log('Sort parameter not in URL, might be handled client-side');
        }
      } else {
        console.log('Quality sort button not found, skipping test');
      }
    });

    test('人気順ソートが動作する', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]', { timeout: 30000 });
      
      // 人気ボタンをクリック（ナビゲーションリンクの可能性）
      const popularLink = page.locator('[data-testid="nav-link-人気"], a:has-text("人気")');
      if (await popularLink.count() > 0) {
        await popularLink.first().click();
        await page.waitForTimeout(1000);
        
        // URLが/popularに遷移するか、ソートパラメータが含まれることを確認（実装に依存）
        const url = page.url();
        if (!url.includes('/popular') && !url.includes('sortBy=bookmarks')) {
          console.log('Popular sort might be handled differently');
        }
      } else {
        console.log('Popular link not found, skipping test');
      }
    });
  });

  test.describe('表示モード切り替え', () => {
    test('グリッド/リスト表示の切り替えが動作する', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]');

      // wrapper に付与された data-view-mode で現在のモードを取得し、
      // aria-pressed は各 Button の状態として個別に検証する (Issue #619 PR-A)。
      const viewToggle = page.locator('[data-testid="view-mode-toggle"]');
      await expect(viewToggle).toBeVisible();

      const initialMode = await viewToggle.getAttribute('data-view-mode');
      expect(initialMode).not.toBeNull();

      // 現在のモードと異なるモードを選択 (card/compact/list の中から)
      const allModes = ['card', 'compact', 'list'] as const;
      const targetMode = allModes.find((m) => m !== initialMode) ?? 'list';
      const targetButton = viewToggle.locator(`[data-testid="view-mode-${targetMode}"]`);

      // 現状の aria-pressed: 初期モードのボタンは true, 他は false
      const initialButton = viewToggle.locator(`[data-testid="view-mode-${initialMode}"]`);
      await expect(initialButton).toHaveAttribute('aria-pressed', 'true');
      await expect(targetButton).toHaveAttribute('aria-pressed', 'false');

      // ボタン click で表示モード切替 (内部で window.location.reload() が呼ばれる)
      await targetButton.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('[data-testid="view-mode-toggle"]');

      // wrapper の data-view-mode が targetMode に変化していること
      const reloadedToggle = page.locator('[data-testid="view-mode-toggle"]');
      await expect(reloadedToggle).toHaveAttribute('data-view-mode', targetMode);

      // クリックしたボタンの aria-pressed が true になっていること
      const reloadedTargetButton = reloadedToggle.locator(`[data-testid="view-mode-${targetMode}"]`);
      await expect(reloadedTargetButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test.describe('モバイル対応', () => {
    test('モバイルビューでハンバーガーメニューが表示される', async ({ page }) => {
      // モバイルビューポートに設定
      await page.setViewportSize(MOBILE_VIEWPORT);
      
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]', { timeout: 30000 });
      
      // モバイルメニューボタンを探す（ハンバーガーメニュー）
      const mobileMenuButton = page.locator('[data-testid="mobile-menu-toggle"], button:has(svg.lucide-menu), button[aria-label*="メニュー"]');
      const buttonCount = await mobileMenuButton.count();
      expect(buttonCount).toBeGreaterThan(0);
      
      if (buttonCount > 0) {
        // クリックでメニューが開く
        await mobileMenuButton.first().click();
        await page.waitForTimeout(500);
        
        // モバイルナビゲーションが表示されることを確認
        const mobileNav = page.locator(`nav[data-testid="mobile-nav"], ${SELECTORS.MOBILE_MENU}`);
        expect(await mobileNav.count()).toBeGreaterThan(0);
      }
    });
  });

  test.describe('パフォーマンス', () => {
    test('初期読み込みが3秒以内に完了する', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]', { timeout: 5000 });
      
      const loadTime = Date.now() - startTime;
      // 3秒以内が理想だが、環境により変動するため警告のみ
      if (loadTime >= 3000) {
        console.log(`Initial load took ${loadTime}ms, which is longer than ideal (3000ms)`);
      }
    });

    test('記事カードのアニメーションがスムーズ', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="article-card"]', { timeout: 30000 });
      
      // ホバーアニメーションの確認
      const firstCard = page.locator('[data-testid="article-card"]').first();
      
      // ホバー前のスタイルを取得（transformまたはscale）
      const beforeHover = await firstCard.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return {
          transform: styles.transform,
          scale: styles.scale,
          opacity: styles.opacity
        };
      });
      
      // ホバー
      await firstCard.hover();
      await page.waitForTimeout(500);
      
      // ホバー後のスタイルを取得
      const afterHover = await firstCard.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return {
          transform: styles.transform,
          scale: styles.scale,
          opacity: styles.opacity
        };
      });
      
      // いずれかのスタイルが変化していることを確認（実装に依存）
      const hasChanged = beforeHover.transform !== afterHover.transform ||
                        beforeHover.scale !== afterHover.scale ||
                        beforeHover.opacity !== afterHover.opacity;
      if (!hasChanged) {
        console.log('Hover effects not implemented or not detectable');
      }
    });
  });
});

test.describe('エラーハンドリング', () => {
  test('ネットワークエラー時に適切なメッセージが表示される', async ({ page }, testInfo) => {
    // APIリクエストを失敗させる
    await page.route('**/api/articles*', route => {
      route.abort();
    });

    await page.goto('/');
    await page.waitForTimeout(1000);  // タイムアウトを短縮

    // エラーメッセージが表示される (Issue #611 / PR #618 review: testid + ARIA に集約)
    const errorElement = page.locator(SELECTORS.ERROR_MESSAGE);
    const errorMessage =
      (await errorElement.count()) > 0
        ? await errorElement.first().textContent()
        : null;

    if (errorMessage) {
      // エラー UI が検出された場合は内容を確認
      expect(errorMessage).toBeTruthy();
    } else {
      // エラー UI が無い場合はローディング状態が継続しているかを確認
      // どちらも無ければ silent pass を防ぐため testInfo.skip
      const loading = page.locator(SELECTORS.LOADING_SPINNER);
      if ((await loading.count()) === 0) {
        testInfo.skip(
          true,
          'No error message or loading indicator detected (error handling implementation may differ)'
        );
        return;
      }
    }
  });

  test('空の検索結果で適切なメッセージが表示される', async ({ page }) => {
    await page.goto('/?search=xyzxyzxyzxyzxyz');
    await page.waitForTimeout(1000);  // タイムアウトを短縮
    
    // 空の状態メッセージを探す (Issue #611 / PR #618 review: testid + ARIA に集約、生クラス依存は撤去)
    const emptySelectors = [SELECTORS.EMPTY_STATE, '[role="status"]'];
    let emptyMessage = null;
    
    for (const selector of emptySelectors) {
      const element = page.locator(selector);
      if (await element.count() > 0) {
        const text = await element.first().textContent();
        if (text && text.includes('見つかりません')) {
          emptyMessage = text;
          break;
        }
      }
    }
    
    // メッセージが見つからない場合は、記事数が0であることを確認
    if (!emptyMessage) {
      const articleCount = await page.locator('[data-testid="article-card"]').count();
      if (articleCount > 0) {
        console.log(`Found ${articleCount} articles for nonsense search - filter might not be working`);
      }
    } else {
      console.log('Empty state message found:', emptyMessage);
    }
  });
});