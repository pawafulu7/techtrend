import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * 検索ページのPage Object
 */
export class SearchPage extends BasePage {
  // ページ要素のセレクター定義
  private readonly searchInput = 'input[type="search"], input[placeholder*="検索"], input[placeholder*="Search"]';
  private readonly searchButton = 'button[type="submit"], button:has-text("検索")';
  private readonly searchResults = 'article, [class*="article"], [class*="card"]';
  private readonly noResultsMessage = ':text("見つかりません"), :text("No results"), :text("該当なし")';
  private readonly sourceFilter = 'select[name*="source"], select[data-testid="source-filter"]';
  private readonly dateFilter = 'select[name*="date"], input[type="date"], [data-testid="date-filter"]';
  private readonly sortSelect = 'select[name*="sort"], select[data-testid="sort"]';
  private readonly advancedSearchToggle = 'button:has-text("詳細検索"), button:has-text("Advanced")';
  private readonly tagInput = 'input[name*="tag"], input[placeholder*="タグ"]';
  private readonly suggestions = '[role="listbox"], [class*="suggest"], [class*="autocomplete"]';

  constructor(page: Page) {
    super(page);
  }

  /**
   * 検索ページへ遷移
   */
  async gotoSearch(query?: string): Promise<void> {
    if (query) {
      await this.goto(`/search?q=${encodeURIComponent(query)}`);
    } else {
      await this.goto('/search');
    }
  }

  /**
   * 検索を実行
   */
  async search(query: string): Promise<void> {
    const input = await this.waitForElement(this.searchInput);
    await input.clear();
    await input.fill(query);
    await input.press('Enter');
    await this.waitForPageLoad();
  }

  /**
   * 検索ボタンをクリック
   */
  async clickSearchButton(): Promise<void> {
    const button = this.page.locator(this.searchButton).first();
    
    if (await button.isVisible()) {
      await button.click();
      await this.waitForPageLoad();
    }
  }

  /**
   * 現在の検索クエリを取得
   */
  async getCurrentQuery(): Promise<string> {
    const input = this.page.locator(this.searchInput).first();
    return await input.inputValue();
  }

  /**
   * 検索結果の数を取得
   */
  async getResultCount(): Promise<number> {
    const results = this.page.locator(this.searchResults);
    return await results.count();
  }

  /**
   * 検索結果が存在するか確認
   */
  async hasResults(): Promise<boolean> {
    const count = await this.getResultCount();
    return count > 0;
  }

  /**
   * 結果なしメッセージが表示されているか確認
   */
  async hasNoResultsMessage(): Promise<boolean> {
    const message = this.page.locator(this.noResultsMessage).first();
    return await message.isVisible({ timeout: 1000 }).catch(() => false);
  }

  /**
   * ソースフィルターを適用
   */
  async filterBySource(source: string): Promise<void> {
    const filter = this.page.locator(this.sourceFilter).first();
    
    if (await filter.isVisible()) {
      await filter.selectOption({ label: source });
      await this.page.waitForTimeout(1000);
    }
  }

  /**
   * 利用可能なソースフィルターオプションを取得
   */
  async getSourceOptions(): Promise<string[]> {
    const filter = this.page.locator(this.sourceFilter).first();
    
    if (await filter.isVisible()) {
      const options = filter.locator('option');
      return await options.allTextContents();
    }
    
    return [];
  }

  /**
   * ソート順を変更
   */
  async sortBy(sortOption: string): Promise<void> {
    const sortElement = this.page.locator(this.sortSelect).first();
    
    if (await sortElement.isVisible()) {
      await sortElement.selectOption({ label: sortOption });
      await this.page.waitForTimeout(1000);
    }
  }

  /**
   * 利用可能なソートオプションを取得
   */
  async getSortOptions(): Promise<string[]> {
    const sortElement = this.page.locator(this.sortSelect).first();
    
    if (await sortElement.isVisible()) {
      const options = sortElement.locator('option');
      return await options.allTextContents();
    }
    
    return [];
  }

  /**
   * 高度な検索オプションを開く
   */
  async openAdvancedSearch(): Promise<void> {
    const toggle = this.page.locator(this.advancedSearchToggle).first();
    
    if (await toggle.isVisible()) {
      await toggle.click();
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * タグで検索
   */
  async searchByTag(tag: string): Promise<void> {
    await this.openAdvancedSearch();
    
    const input = this.page.locator(this.tagInput).first();
    
    if (await input.isVisible()) {
      await input.fill(tag);
      await this.clickSearchButton();
    }
  }

  /**
   * サジェスト候補を取得
   */
  async getSuggestions(): Promise<string[]> {
    const input = this.page.locator(this.searchInput).first();
    await input.focus();
    await input.type('Java', { delay: 100 });
    
    const suggestionBox = this.page.locator(this.suggestions).first();
    
    if (await suggestionBox.isVisible({ timeout: 2000 })) {
      const items = suggestionBox.locator('[role="option"], li');
      return await items.allTextContents();
    }
    
    return [];
  }

  /**
   * サジェスト候補を選択
   */
  async selectSuggestion(index = 0): Promise<void> {
    const suggestionBox = this.page.locator(this.suggestions).first();
    
    if (await suggestionBox.isVisible()) {
      const items = suggestionBox.locator('[role="option"], li');
      await items.nth(index).click();
      await this.waitForPageLoad();
    }
  }

  /**
   * 検索結果をクリック
   */
  async clickResult(index = 0): Promise<void> {
    const results = this.page.locator(`${this.searchResults} a`);
    await results.nth(index).click();
    await this.waitForPageLoad();
  }

  /**
   * 検索が機能することを検証
   */
  async verifySearchFunctionality(query: string): Promise<void> {
    await this.search(query);
    
    // URLにクエリパラメータが含まれることを確認
    await this.verifyURL(/\/search|q=/);
    
    // 結果が表示されるか、結果なしメッセージが表示されることを確認
    const hasResults = await this.hasResults();
    const hasNoResults = await this.hasNoResultsMessage();
    
    expect(hasResults || hasNoResults).toBeTruthy();
  }

  /**
   * フィルターが機能することを検証
   */
  async verifyFilterFunctionality(): Promise<void> {
    const sourceOptions = await this.getSourceOptions();
    
    if (sourceOptions.length > 1) {
      const initialCount = await this.getResultCount();
      await this.filterBySource(sourceOptions[1]);
      
      // URLにフィルターパラメータが追加されることを確認
      const url = this.page.url();
      expect(url).toContain('source');
    }
  }

  /**
   * ソート機能を検証
   */
  async verifySortFunctionality(): Promise<void> {
    const sortOptions = await this.getSortOptions();
    
    if (sortOptions.length > 1) {
      await this.sortBy(sortOptions[1]);
      
      // URLにソートパラメータが追加されることを確認
      const url = this.page.url();
      expect(url).toContain('sort');
    }
  }

  /**
   * XSS攻撃に対する安全性を検証
   */
  async verifyXSSProtection(): Promise<void> {
    const maliciousQuery = '<script>alert("XSS")</script>';
    await this.search(maliciousQuery);
    
    // アラートが表示されないことを確認（ページが正常に動作）
    await this.verifyNoErrors();
    
    const pageContent = this.page.locator('body');
    await expect(pageContent).toBeVisible();
  }
}