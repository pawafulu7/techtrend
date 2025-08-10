import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * ホームページのPage Object
 */
export class HomePage extends BasePage {
  // ページ要素のセレクター定義
  private readonly searchInput = 'input[type="search"], input[placeholder*="検索"], input[placeholder*="Search"]';
  private readonly articleCard = 'article, [class*="article"], [class*="card"]';
  private readonly sourceFilter = 'select[data-testid="source-filter"], [data-testid="source-dropdown"], select[name*="source"]';
  private readonly pagination = '[data-testid="pagination"], nav[aria-label*="pagination"], .pagination';
  private readonly nextPageButton = 'button:has-text("次"), button:has-text("Next"), [aria-label*="次"]';

  constructor(page: Page) {
    super(page);
  }

  /**
   * ホームページへ遷移
   */
  async gotoHome(): Promise<void> {
    await this.goto('/');
  }

  /**
   * 検索を実行
   */
  async search(query: string): Promise<void> {
    const input = await this.waitForElement(this.searchInput);
    await input.fill(query);
    await input.press('Enter');
    await this.waitForPageLoad();
  }

  /**
   * 検索ボックスの値を取得
   */
  async getSearchValue(): Promise<string> {
    const input = this.page.locator(this.searchInput).first();
    return await input.inputValue();
  }

  /**
   * 記事カードの数を取得
   */
  async getArticleCount(): Promise<number> {
    const articles = this.page.locator(this.articleCard);
    return await articles.count();
  }

  /**
   * 最初の記事を取得
   */
  async getFirstArticle(): Promise<{
    title: string | null;
    link: string | null;
  }> {
    const firstArticle = this.page.locator(this.articleCard).first();
    
    const titleElement = firstArticle.locator('h2, h3, [class*="title"]').first();
    const title = await titleElement.textContent();
    
    const linkElement = firstArticle.locator('a').first();
    const link = await linkElement.getAttribute('href');
    
    return { title, link };
  }

  /**
   * 記事をクリックして詳細ページへ遷移
   */
  async clickArticle(index = 0): Promise<void> {
    const articles = this.page.locator(`${this.articleCard} a`);
    await articles.nth(index).click();
    await this.waitForPageLoad();
  }

  /**
   * ソースでフィルタリング
   */
  async filterBySource(sourceName: string): Promise<void> {
    const filter = await this.waitForElement(this.sourceFilter);
    await filter.selectOption({ label: sourceName });
    await this.page.waitForTimeout(1000); // フィルター適用を待つ
  }

  /**
   * 利用可能なソースオプションを取得
   */
  async getAvailableSources(): Promise<string[]> {
    const filter = this.page.locator(this.sourceFilter).first();
    const options = filter.locator('option');
    return await options.allTextContents();
  }

  /**
   * 次のページへ移動
   */
  async goToNextPage(): Promise<void> {
    const paginationElement = this.page.locator(this.pagination).first();
    
    if (await paginationElement.isVisible()) {
      const nextButton = paginationElement.locator(this.nextPageButton).first();
      
      if (await nextButton.isVisible() && await nextButton.isEnabled()) {
        await nextButton.click();
        await this.waitForPageLoad();
      } else {
        throw new Error('Next page button is not available');
      }
    } else {
      throw new Error('Pagination is not visible');
    }
  }

  /**
   * 現在のページ番号を取得
   */
  async getCurrentPageNumber(): Promise<number> {
    const url = this.page.url();
    const match = url.match(/[?&]page=(\d+)/);
    return match ? parseInt(match[1]) : 1;
  }

  /**
   * 記事が表示されていることを検証
   */
  async verifyArticlesDisplayed(minCount = 1): Promise<void> {
    const articles = this.page.locator(this.articleCard);
    const count = await articles.count();
    expect(count).toBeGreaterThanOrEqual(minCount);
    
    if (count > 0) {
      await expect(articles.first()).toBeVisible();
    }
  }

  /**
   * 検索ボックスが機能することを検証
   */
  async verifySearchFunctionality(): Promise<void> {
    const input = this.page.locator(this.searchInput).first();
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();
  }

  /**
   * ソースフィルターが存在することを検証
   */
  async verifySourceFilterExists(): Promise<void> {
    const filter = this.page.locator(this.sourceFilter).first();
    
    if (await filter.isVisible()) {
      await expect(filter).toBeEnabled();
      const options = await this.getAvailableSources();
      expect(options.length).toBeGreaterThan(1);
    }
  }

  /**
   * ページネーションが機能することを検証
   */
  async verifyPaginationFunctionality(): Promise<void> {
    const paginationElement = this.page.locator(this.pagination).first();
    
    if (await paginationElement.isVisible()) {
      const currentPage = await this.getCurrentPageNumber();
      await this.goToNextPage();
      const newPage = await this.getCurrentPageNumber();
      expect(newPage).toBe(currentPage + 1);
    }
  }

  /**
   * レスポンシブデザインを検証
   */
  async verifyResponsiveDesign(): Promise<void> {
    // デスクトップビュー
    await this.setViewportSize(1280, 720);
    await this.reload();
    await this.verifyArticlesDisplayed();
    
    // モバイルビュー
    await this.setViewportSize(375, 667);
    await this.reload();
    await this.verifyArticlesDisplayed();
    
    // タブレットビュー
    await this.setViewportSize(768, 1024);
    await this.reload();
    await this.verifyArticlesDisplayed();
  }
}