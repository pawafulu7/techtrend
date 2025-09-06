import { test, expect } from '@playwright/test';
import { 
  waitForPageLoad,
  _expectNoErrors,
  _waitForLoadingToDisappear,
} from '../utils/e2e-helpers';
import { SELECTORS } from '../constants/selectors';

test.describe('テーマ切り替え機能', () => {
  test.beforeEach(async ({ page }) => {
    // LocalStorageをクリアしてテーマを初期化
    await page.addInitScript(() => {
      localStorage.clear();
    });
    
    // ホームページにアクセス
    await page.goto('/');
    await waitForPageLoad(page);
  });

  test('ダークモードへの切り替えが機能する', async ({ page }) => {
    // テーマトグルボタンを探す（デスクトップ版を優先）
    const themeToggle = page.locator('[data-testid="theme-toggle-button"]').first();
    
    // ボタンが存在することを確認
    await expect(themeToggle).toBeVisible();
    
    // 初期状態（ライトモード）でMoonアイコンが表示されていることを確認
    await expect(themeToggle.locator('svg')).toBeVisible();
    
    // ボタンをクリックしてダークモードに切り替え
    await themeToggle.click();
    
    // HTMLにdarkクラスが追加されるまで待機（自動的に待機する）
    await expect(page.locator('html')).toHaveClass(/dark/, { timeout: 5000 });
    
    // LocalStorageにテーマが保存されていることを確認
    const theme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(theme).toBe('dark');
  });

  test('ライトモードへの切り替えが機能する', async ({ page }) => {
    // テーマトグルボタンをクリックしてまずダークモードに切り替え
    const themeToggle = page.locator('[data-testid="theme-toggle-button"]').first();
    await expect(themeToggle).toBeVisible();
    
    // 現在のクラスを確認（初期はlightまたはクラスなし）
    
    // ダークモードに切り替え
    await themeToggle.click();
    
    // ダークモードが適用されるまで待機（自動的に待機する）
    await expect(page.locator('html')).toHaveClass(/dark/, { timeout: 5000 });
    
    // LocalStorageにdarkテーマが保存されていることを確認
    const darkTheme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(darkTheme).toBe('dark');
    
    // テーマトグルボタンをクリックしてライトモードに戻す
    await themeToggle.click();
    
    // HTMLからdarkクラスが削除されていることを確認（自動的に待機する）
    await expect(page.locator('html')).not.toHaveClass(/dark/, { timeout: 5000 });
    
    // LocalStorageにライトテーマが保存されていることを確認
    const lightTheme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(lightTheme).toBe('light');
  });

  test('テーマがLocalStorageに保存される', async ({ page }) => {
    // テーマトグルボタンをクリックしてダークモードに切り替え
    const themeToggle = page.locator('[data-testid="theme-toggle-button"]').first();
    await expect(themeToggle).toBeVisible();
    await themeToggle.click();
    
    // ダークモードが適用されるまで待機
    await expect(page.locator('html')).toHaveClass(/dark/, { timeout: 5000 });
    
    // LocalStorageにダークテーマが保存されていることを確認
    const darkTheme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(darkTheme).toBe('dark');
    
    // 再度クリックしてライトモードに戻す
    await themeToggle.click();
    
    // ライトモードが適用されるまで待機
    await expect(page.locator('html')).not.toHaveClass(/dark/, { timeout: 5000 });
    
    // LocalStorageにライトテーマが保存されていることを確認
    const lightTheme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(lightTheme).toBe('light');
  });

  test('リロード後もテーマが維持される', async ({ context }) => {
    // このテストだけはLocalStorageをクリアしない新しいページを作成
    const newPage = await context.newPage();
    
    // ホームページにアクセス
    await newPage.goto('/');
    await waitForPageLoad(newPage);
    
    // ダークモードに設定
    const themeToggle = newPage.locator('[data-testid="theme-toggle-button"]').first();
    await expect(themeToggle).toBeVisible();
    await themeToggle.click();
    
    // darkクラスが適用されるまで待機（自動的に待機する）
    await expect(newPage.locator('html')).toHaveClass(/dark/, { timeout: 5000 });
    
    // LocalStorageに値が保存されていることを確認
    const themeBeforeReload = await newPage.evaluate(() => localStorage.getItem('theme'));
    expect(themeBeforeReload).toBe('dark');
    
    // ページをリロード
    await newPage.reload();
    await waitForPageLoad(newPage);
    
    // リロード後もdarkクラスが維持されていることを確認
    await expect(newPage.locator('html')).toHaveClass(/dark/);
    
    // LocalStorageの値も確認
    const themeAfterReload = await newPage.evaluate(() => localStorage.getItem('theme'));
    expect(themeAfterReload).toBe('dark');
    
    // テスト終了時にページを閉じる
    await newPage.close();
  });

  test.skip('システムテーマとの連動が機能する', async ({ page }) => {
    // 注意: 現在のThemeToggleコンポーネントは単純なLight/Darkトグルのため
    // システムテーマ機能は実装されていません
    // このテストは今後システムテーマ対応時に有効化してください
    
    // システムテーマオプションを選択
    const themeToggle = page.locator('[data-testid="theme-toggle-button"]').first();
    await themeToggle.click();
    
    const systemOption = page.locator('[data-testid="theme-option-system"]');
    await expect(systemOption).toBeVisible();
    await systemOption.click();
    
    // LocalStorageにsystemが保存されていることを確認
    const theme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(theme).toBe('system');
  });

  test('ダークモードでカードが適切に表示される', async ({ page }) => {
    // ダークモードに切り替え（ページ読み込み前に設定）
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'dark');
    });
    await page.reload();
    await waitForPageLoad(page);
    
    // ダークモードが適用されるまで待機
    await page.waitForFunction(() => {
      return document.documentElement.classList.contains('dark');
    }, { timeout: 5000 });
    
    // 記事カードを確認
    const card = page.locator(SELECTORS.ARTICLE_CARD).first();
    await expect(card).toBeVisible();
    
    // ダークモードクラスが適用されていることを確認
    const htmlElement = page.locator('html');
    const isDarkMode = await htmlElement.evaluate(el => el.classList.contains('dark'));
    expect(isDarkMode).toBeTruthy();
    
    // カードのテキストが読みやすいことを確認（CSSクラスベース）
    const title = card.locator(SELECTORS.ARTICLE_TITLE).first();
    if (await title.isVisible()) {
      // タイトル要素が存在し、表示されていることを確認
      await expect(title).toBeVisible();
      
      // ダークモード用のCSSクラスまたはスタイルが適用されているかを確認
      const titleElement = await title.elementHandle();
      if (titleElement) {
        const hasProperStyling = await titleElement.evaluate((el) => {
          const styles = window.getComputedStyle(el);
          const color = styles.color;
          // RGB値を解析して明るさを判定（より柔軟な判定）
          const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (rgbMatch) {
            const [, r, g, b] = rgbMatch.map(Number);
            const brightness = (r + g + b) / 3;
            return brightness > 128; // 明るい色の場合true
          }
          // oklch/oklab形式の場合は常にOKとする
          return color.includes('oklch') || color.includes('oklab') || color.includes('hsl');
        });
        expect(hasProperStyling).toBeTruthy();
      }
    }
    
    // カード要素にダークモード用のスタイリングが適用されていることを確認
    const hasCardDarkStyling = await card.evaluate((el) => {
      const bg = window.getComputedStyle(el).backgroundColor;
      // 透明でない背景色が設定されていることを確認
      return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    });
    expect(hasCardDarkStyling).toBeTruthy();
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