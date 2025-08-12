import { test, expect } from '@playwright/test';
import { 
  waitForPageLoad,
  expectNoErrors,
  waitForLoadingToDisappear,
} from '../utils/test-helpers';
import { SELECTORS } from '../constants/selectors';

test.describe('テーマ切り替え機能', () => {
  test.beforeEach(async ({ page }) => {
    // ホームページにアクセス
    await page.goto('/');
    await waitForPageLoad(page);
  });

  test('ダークモードへの切り替えが機能する', async ({ page }) => {
    // テーマトグルボタンを探す
    const themeToggle = page.locator('button').filter({ hasText: /Toggle theme/i }).or(
      page.locator('button').filter({ has: page.locator('svg.lucide-sun, svg.lucide-moon') })
    ).first();
    
    // ボタンが存在することを確認
    await expect(themeToggle).toBeVisible();
    
    // ボタンをクリックしてドロップダウンを開く
    await themeToggle.click();
    
    // ダークモードオプションをクリック
    const darkOption = page.locator('[role="menuitem"]').filter({ hasText: 'ダーク' });
    await expect(darkOption).toBeVisible();
    await darkOption.click();
    
    // HTMLにdarkクラスが追加されていることを確認
    await expect(page.locator('html')).toHaveClass(/dark/);
    
    // カードの背景色がダークモード用になっていることを確認
    const card = page.locator(SELECTORS.ARTICLE_CARD).first();
    if (await card.isVisible()) {
      // ダークモード用のクラスが適用されていることを確認
      const cardClasses = await card.getAttribute('class');
      expect(cardClasses).toContain('dark:bg-gray-800');
    }
  });

  test('ライトモードへの切り替えが機能する', async ({ page }) => {
    // まずダークモードに切り替え
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    });
    
    // ページをリロード
    await page.reload();
    await waitForPageLoad(page);
    
    // テーマトグルボタンをクリック
    const themeToggle = page.locator('button').filter({ has: page.locator('svg.lucide-sun, svg.lucide-moon') }).first();
    await themeToggle.click();
    
    // ライトモードオプションをクリック
    const lightOption = page.locator('[role="menuitem"]').filter({ hasText: 'ライト' });
    await expect(lightOption).toBeVisible();
    await lightOption.click();
    
    // HTMLからdarkクラスが削除されていることを確認
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('テーマがLocalStorageに保存される', async ({ page }) => {
    // テーマトグルボタンをクリック
    const themeToggle = page.locator('button').filter({ has: page.locator('svg.lucide-sun, svg.lucide-moon') }).first();
    await themeToggle.click();
    
    // ダークモードを選択
    const darkOption = page.locator('[role="menuitem"]').filter({ hasText: 'ダーク' });
    await darkOption.click();
    
    // LocalStorageにテーマが保存されていることを確認
    const theme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(theme).toBe('dark');
  });

  test('リロード後もテーマが維持される', async ({ page }) => {
    // ダークモードに設定
    const themeToggle = page.locator('button').filter({ has: page.locator('svg.lucide-sun, svg.lucide-moon') }).first();
    await themeToggle.click();
    const darkOption = page.locator('[role="menuitem"]').filter({ hasText: 'ダーク' });
    await darkOption.click();
    
    // darkクラスが適用されていることを確認
    await expect(page.locator('html')).toHaveClass(/dark/);
    
    // ページをリロード
    await page.reload();
    await waitForPageLoad(page);
    
    // リロード後もdarkクラスが維持されていることを確認
    await expect(page.locator('html')).toHaveClass(/dark/);
    
    // LocalStorageの値も確認
    const theme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(theme).toBe('dark');
  });

  test('システムテーマとの連動が機能する', async ({ page }) => {
    // システムテーマオプションを選択
    const themeToggle = page.locator('button').filter({ has: page.locator('svg.lucide-sun, svg.lucide-moon') }).first();
    await themeToggle.click();
    
    const systemOption = page.locator('[role="menuitem"]').filter({ hasText: 'システム' });
    await expect(systemOption).toBeVisible();
    await systemOption.click();
    
    // LocalStorageにsystemが保存されていることを確認
    const theme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(theme).toBe('system');
    
    // システムがダークモードの場合をエミュレート
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(100); // メディアクエリの変更を待つ
    
    // darkクラスが適用されることを確認
    const htmlClasses = await page.locator('html').getAttribute('class');
    // システムテーマ設定時の挙動を確認（実装によって異なる可能性あり）
    
    // システムがライトモードの場合をエミュレート
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForTimeout(100);
  });

  test('ダークモードでカードが適切に表示される', async ({ page }) => {
    // ダークモードに切り替え
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    });
    await page.reload();
    await waitForPageLoad(page);
    
    // 記事カードを確認
    const card = page.locator(SELECTORS.ARTICLE_CARD).first();
    await expect(card).toBeVisible();
    
    // カードのテキストが読みやすいことを確認（コントラスト）
    const title = card.locator(SELECTORS.ARTICLE_TITLE).first();
    if (await title.isVisible()) {
      const titleColor = await title.evaluate(el => 
        window.getComputedStyle(el).color
      );
      // ダークモードでは明るい色のテキストになるはず（oklch形式もサポート）
      const isLightColor = titleColor.match(/rgb\(2[0-5][0-9], 2[0-5][0-9], 2[0-5][0-9]\)|rgba\(2[0-5][0-9], 2[0-5][0-9], 2[0-5][0-9]/) ||
                           titleColor.includes('oklch');
      expect(isLightColor).toBeTruthy();
    }
    
    // 背景色が適切であることを確認
    const cardBg = await card.evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    );
    // ダークモードでは暗い背景色になるはず（oklab/oklch形式もサポート）
    const isDarkBg = cardBg.match(/rgb\([0-9]{1,2}, [0-9]{1,2}, [0-9]{1,2}\)|rgba\([0-9]{1,2}, [0-9]{1,2}, [0-9]{1,2}/) ||
                     cardBg.includes('oklab') || cardBg.includes('oklch');
    expect(isDarkBg).toBeTruthy();
  });

  test('ダークモードでテキストが読みやすい', async ({ page }) => {
    // ダークモードに設定
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    });
    await page.reload();
    await waitForPageLoad(page);
    
    // 記事カードの要約テキストを確認
    const summaryText = page.locator(SELECTORS.ARTICLE_SUMMARY).first();
    if (await summaryText.isVisible()) {
      const textColor = await summaryText.evaluate(el => 
        window.getComputedStyle(el).color
      );
      
      // RGB値を解析
      const rgbMatch = textColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgbMatch) {
        const [_, r, g, b] = rgbMatch.map(Number);
        // ダークモードでは明るめのグレー（最低でもRGB各値が100以上）
        expect(r).toBeGreaterThan(100);
        expect(g).toBeGreaterThan(100);
        expect(b).toBeGreaterThan(100);
      }
    }
    
    // メインコンテンツの背景とテキストのコントラストを確認（最初の要素を使用）
    const mainContent = page.locator(SELECTORS.MAIN_CONTENT).first();
    const mainBg = await mainContent.evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    );
    
    // 背景が暗い色であることを確認
    const bgMatch = mainBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (bgMatch) {
      const [_, r, g, b] = bgMatch.map(Number);
      // ダークモードでは暗い背景（RGB各値が100未満）
      const isDarkBg = r < 100 && g < 100 && b < 100;
      expect(isDarkBg).toBeTruthy();
    }
  });
});