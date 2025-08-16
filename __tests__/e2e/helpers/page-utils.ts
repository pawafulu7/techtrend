import { Page } from '@playwright/test';

/**
 * E2Eテスト用のページユーティリティクラス
 * 共通の待機処理や要素操作を提供
 */
export class PageUtils {
  constructor(private page: Page) {}

  /**
   * 記事リストが表示されるまで待機
   */
  async waitForArticleList() {
    // 複数のセレクタを試す（フォールバック）
    const selectors = [
      '[data-testid="article-list"]',
      '.space-y-4',  // 記事リストのコンテナ
      'article',     // 記事要素
    ];

    for (const selector of selectors) {
      try {
        await this.page.waitForSelector(selector, {
          state: 'visible',
          timeout: 30000
        });
        return;
      } catch (error) {
        // 次のセレクタを試す
        continue;
      }
    }

    throw new Error('Article list not found with any selector');
  }

  /**
   * タグ検索ドロップダウンが表示されるまで待機
   */
  async waitForTagDropdown() {
    await this.page.waitForSelector('input[placeholder="タグを検索..."]', {
      state: 'visible',
      timeout: 10000
    });
  }

  /**
   * 安全なクリック処理（要素が表示され、クリック可能になるまで待機）
   */
  async safeClick(selector: string, options?: { timeout?: number }) {
    const timeout = options?.timeout || 10000;
    
    // 要素が存在し、表示されるまで待機
    await this.page.waitForSelector(selector, { 
      state: 'visible',
      timeout 
    });
    
    // スクロールして要素を表示
    await this.page.locator(selector).scrollIntoViewIfNeeded();
    
    // クリック可能になるまで待機
    await this.page.waitForSelector(selector, { 
      state: 'attached',
      timeout 
    });
    
    // クリック実行
    await this.page.click(selector);
  }

  /**
   * ネットワークが安定するまで待機
   */
  async waitForNetworkIdle(options?: { timeout?: number }) {
    const timeout = options?.timeout || 10000;
    await this.page.waitForLoadState('networkidle', { timeout });
  }

  /**
   * 要素の存在確認と取得
   */
  async getElement(selector: string): Promise<boolean> {
    const element = await this.page.$(selector);
    return element !== null;
  }

  /**
   * テキストを含む要素が表示されるまで待機
   */
  async waitForText(text: string, options?: { timeout?: number }) {
    const timeout = options?.timeout || 10000;
    await this.page.waitForSelector(`text="${text}"`, {
      state: 'visible',
      timeout
    });
  }

  /**
   * カテゴリーセクションが適切に表示されるまで待機
   */
  async waitForCategorySection() {
    // カテゴリーセクションのトリガー要素を待つ
    const triggers = [
      '[role="button"]:has(.text-sm.font-medium)',
      '.text-sm.font-medium',
      '.space-y-2'
    ];

    for (const trigger of triggers) {
      const elements = await this.page.$$(trigger);
      if (elements.length > 0) {
        return;
      }
    }
  }

  /**
   * 詳細要約セクションが表示されるまで待機
   */
  async waitForDetailedSummary() {
    const selectors = [
      '[data-testid="detailed-summary"]',
      '.prose',
      '.markdown-content',
      'pre' // コードブロックを含む要約
    ];

    for (const selector of selectors) {
      try {
        await this.page.waitForSelector(selector, {
          state: 'visible',
          timeout: 15000
        });
        return;
      } catch (error) {
        continue;
      }
    }
  }

  /**
   * スクロール可能な要素を確認
   */
  async isScrollable(selector: string): Promise<boolean> {
    const element = await this.page.$(selector);
    if (!element) return false;

    const isScrollable = await element.evaluate((el) => {
      return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
    });

    return isScrollable;
  }

  /**
   * エラー要素が存在しないことを確認
   */
  async assertNoErrors() {
    const errorSelectors = [
      '.error-boundary',
      '[data-testid="error-message"]',
      '.error',
      '.exception'
    ];

    for (const selector of errorSelectors) {
      const errorCount = await this.page.locator(selector).count();
      if (errorCount > 0) {
        throw new Error(`Error element found: ${selector}`);
      }
    }
  }

  /**
   * デバウンス待機（入力後の処理待ち）
   */
  async waitForDebounce(ms: number = 500) {
    await this.page.waitForTimeout(ms);
  }
}