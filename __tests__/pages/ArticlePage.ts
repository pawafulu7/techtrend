import { Page, _Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * 記事詳細ページのPage Object
 */
export class ArticlePage extends BasePage {
  // ページ要素のセレクター定義
  private readonly articleTitle = 'h1, [class*="title"]';
  private readonly articleContent = 'article, [class*="content"], [class*="body"]';
  private readonly publishedDate = 'time, [class*="date"], [class*="published"]';
  private readonly sourceInfo = '[class*="source"], [data-testid="source"]';
  private readonly tags = '[class*="tag"], [data-testid="tag"]';
  private readonly favoriteButton = 'button[class*="favorite"], button[class*="like"], button[data-testid="favorite"]';
  private readonly relatedArticles = '[class*="related"], [data-testid="related-articles"]';
  private readonly sourceLink = 'a[href*="http"]:has-text("元記事"), a[href*="http"]:has-text("Source"), a[target="_blank"]';

  constructor(page: Page) {
    super(page);
  }

  /**
   * 特定の記事ページへ遷移
   */
  async gotoArticle(articleId: string): Promise<void> {
    await this.goto(`/articles/${articleId}`);
  }

  /**
   * 記事タイトルを取得
   */
  async getTitle(): Promise<string | null> {
    const titleElement = this.page.locator(this.articleTitle).first();
    await expect(titleElement).toBeVisible();
    return await titleElement.textContent();
  }

  /**
   * 記事本文を取得
   */
  async getContent(): Promise<string | null> {
    const contentElement = this.page.locator(this.articleContent).first();
    await expect(contentElement).toBeVisible();
    return await contentElement.textContent();
  }

  /**
   * 公開日時を取得
   */
  async getPublishedDate(): Promise<string | null> {
    const dateElement = this.page.locator(this.publishedDate).first();
    
    if (await dateElement.isVisible()) {
      return await dateElement.textContent();
    }
    
    return null;
  }

  /**
   * ソース情報を取得
   */
  async getSourceInfo(): Promise<string | null> {
    const sourceElement = this.page.locator(this.sourceInfo).first();
    
    if (await sourceElement.isVisible()) {
      return await sourceElement.textContent();
    }
    
    return null;
  }

  /**
   * タグリストを取得
   */
  async getTags(): Promise<string[]> {
    const tagElements = this.page.locator(this.tags);
    const count = await tagElements.count();
    
    const tags: string[] = [];
    for (let i = 0; i < count; i++) {
      const tagText = await tagElements.nth(i).textContent();
      if (tagText) {
        tags.push(tagText.trim());
      }
    }
    
    return tags;
  }

  /**
   * タグをクリック
   */
  async clickTag(tagName: string): Promise<void> {
    const tag = this.page.locator(this.tags).filter({ hasText: tagName }).first();
    await tag.click();
    await this.waitForPageLoad();
  }

  /**
   * お気に入りボタンをクリック
   */
  async toggleFavorite(): Promise<boolean> {
    const button = this.page.locator(this.favoriteButton).first();
    
    if (await button.isVisible()) {
      const initialState = await this.isFavorited();
      await button.click();
      await this.page.waitForTimeout(500); // 状態変化を待つ
      const newState = await this.isFavorited();
      return newState !== initialState;
    }
    
    return false;
  }

  /**
   * お気に入り状態を確認
   */
  async isFavorited(): Promise<boolean> {
    const button = this.page.locator(this.favoriteButton).first();
    
    if (await button.isVisible()) {
      const ariaPressed = await button.getAttribute('aria-pressed');
      const className = await button.getAttribute('class');
      
      return ariaPressed === 'true' || 
             className?.includes('active') || 
             className?.includes('favorited') || 
             false;
    }
    
    return false;
  }

  /**
   * 関連記事の数を取得
   */
  async getRelatedArticlesCount(): Promise<number> {
    const relatedSection = this.page.locator(this.relatedArticles).first();
    
    if (await relatedSection.isVisible()) {
      const articles = relatedSection.locator('article, [class*="card"], a');
      return await articles.count();
    }
    
    return 0;
  }

  /**
   * 関連記事をクリック
   */
  async clickRelatedArticle(index = 0): Promise<void> {
    const relatedSection = this.page.locator(this.relatedArticles).first();
    
    if (await relatedSection.isVisible()) {
      const articles = relatedSection.locator('a');
      await articles.nth(index).click();
      await this.waitForPageLoad();
    } else {
      throw new Error('Related articles section not found');
    }
  }

  /**
   * 元記事へのリンクを取得
   */
  async getSourceLink(): Promise<string | null> {
    const link = this.page.locator(this.sourceLink).first();
    
    if (await link.isVisible()) {
      return await link.getAttribute('href');
    }
    
    return null;
  }

  /**
   * 元記事へのリンクをクリック（新しいタブで開く）
   */
  async clickSourceLink(): Promise<Page> {
    const link = this.page.locator(this.sourceLink).first();
    
    if (await link.isVisible()) {
      const [newPage] = await Promise.all([
        this.page.context().waitForEvent('page'),
        link.click()
      ]);
      
      return newPage;
    }
    
    throw new Error('Source link not found');
  }

  /**
   * 記事が正常に表示されていることを検証
   */
  async verifyArticleDisplayed(): Promise<void> {
    // タイトルの検証
    const title = await this.getTitle();
    expect(title).toBeTruthy();
    
    // 本文の検証
    const content = await this.getContent();
    expect(content).toBeTruthy();
    
    // エラーがないことを確認
    await this.verifyNoErrors();
  }

  /**
   * メタデータが表示されていることを検証
   */
  async verifyMetadataDisplayed(): Promise<void> {
    // 日付、ソース、タグのいずれかが表示されていることを確認
    const date = await this.getPublishedDate();
    const source = await this.getSourceInfo();
    const tags = await this.getTags();
    
    const hasMetadata = date !== null || source !== null || tags.length > 0;
    expect(hasMetadata).toBeTruthy();
  }

  /**
   * 404エラーが表示されていることを検証
   */
  async verify404Error(): Promise<void> {
    const errorMessages = [
      ':text("404")',
      ':text("見つかりません")',
      ':text("Not Found")',
      ':text("存在しません")'
    ];
    
    let errorFound = false;
    for (const selector of errorMessages) {
      const element = this.page.locator(selector).first();
      if (await element.isVisible({ timeout: 1000 }).catch(() => false)) {
        errorFound = true;
        break;
      }
    }
    
    // エラーメッセージが表示されるか、ホームへリダイレクトされることを確認
    const isRedirected = this.page.url().endsWith('/');
    expect(errorFound || isRedirected).toBeTruthy();
  }
}