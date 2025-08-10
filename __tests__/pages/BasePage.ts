import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object基底クラス
 * 全てのページオブジェクトが継承する基本機能を提供
 */
export class BasePage {
  protected readonly page: Page;
  protected readonly baseURL: string;

  constructor(page: Page, baseURL = 'http://localhost:3000') {
    this.page = page;
    this.baseURL = baseURL;
  }

  /**
   * ページへ遷移
   */
  async goto(path = ''): Promise<void> {
    await this.page.goto(`${this.baseURL}${path}`);
    await this.waitForPageLoad();
  }

  /**
   * ページロードを待機
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout: 30000 });
  }

  /**
   * 要素が表示されるまで待機
   */
  async waitForElement(selector: string, timeout = 15000): Promise<Locator> {
    const element = this.page.locator(selector);
    await element.first().waitFor({ state: 'visible', timeout });
    return element;
  }

  /**
   * テキストを含む要素を取得
   */
  getByText(text: string): Locator {
    return this.page.getByText(text);
  }

  /**
   * ロール別に要素を取得
   */
  getByRole(role: any, options?: any): Locator {
    return this.page.getByRole(role, options);
  }

  /**
   * テストID別に要素を取得
   */
  getByTestId(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  /**
   * ナビゲーションメニューの検証
   */
  async verifyNavigationMenu(): Promise<void> {
    const nav = this.page.locator('nav, [role="navigation"]').first();
    await expect(nav).toBeVisible();
  }

  /**
   * ページタイトルの検証
   */
  async verifyPageTitle(expectedTitle: string): Promise<void> {
    await expect(this.page).toHaveTitle(new RegExp(expectedTitle, 'i'));
  }

  /**
   * URLの検証
   */
  async verifyURL(pattern: string | RegExp): Promise<void> {
    await expect(this.page).toHaveURL(pattern);
  }

  /**
   * エラーメッセージが表示されていないことを確認
   */
  async verifyNoErrors(): Promise<void> {
    const errorSelectors = [
      '[class*="error"]',
      '[data-testid="error"]',
      '.error-message',
      ':text("Error")',
      ':text("エラー")',
    ];

    for (const selector of errorSelectors) {
      const errorElement = this.page.locator(selector).first();
      const isVisible = await errorElement.isVisible({ timeout: 1000 }).catch(() => false);
      
      if (isVisible) {
        const text = await errorElement.textContent();
        // 意図的なエラー表示（404ページなど）は除外
        if (!text?.includes('404') && !text?.includes('見つかりません')) {
          throw new Error(`Error element found: ${text}`);
        }
      }
    }
  }

  /**
   * スクリーンショットを撮影
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({ 
      path: `test-results/screenshots/${name}.png`,
      fullPage: true 
    });
  }

  /**
   * ビューポートサイズを変更
   */
  async setViewportSize(width: number, height: number): Promise<void> {
    await this.page.setViewportSize({ width, height });
  }

  /**
   * ページをリロード
   */
  async reload(): Promise<void> {
    await this.page.reload();
    await this.waitForPageLoad();
  }

  /**
   * 前のページへ戻る
   */
  async goBack(): Promise<void> {
    await this.page.goBack();
    await this.waitForPageLoad();
  }

  /**
   * 次のページへ進む
   */
  async goForward(): Promise<void> {
    await this.page.goForward();
    await this.waitForPageLoad();
  }

  /**
   * Cookieをクリア
   */
  async clearCookies(): Promise<void> {
    await this.page.context().clearCookies();
  }

  /**
   * ローカルストレージをクリア
   */
  async clearLocalStorage(): Promise<void> {
    await this.page.evaluate(() => localStorage.clear());
  }

  /**
   * セッションストレージをクリア
   */
  async clearSessionStorage(): Promise<void> {
    await this.page.evaluate(() => sessionStorage.clear());
  }

  /**
   * コンソールログを取得
   */
  async getConsoleMessages(): Promise<string[]> {
    const messages: string[] = [];
    
    this.page.on('console', (msg) => {
      messages.push(`${msg.type()}: ${msg.text()}`);
    });

    return messages;
  }

  /**
   * ネットワークエラーを監視
   */
  async monitorNetworkErrors(): Promise<string[]> {
    const errors: string[] = [];
    
    this.page.on('requestfailed', (request) => {
      errors.push(`Failed: ${request.url()} - ${request.failure()?.errorText}`);
    });

    return errors;
  }
}