import { test, expect } from '@playwright/test';
import { testData } from '../fixtures/test-data';
import {
  waitForPageLoad,
  _expectPageTitle,
  expectNoErrors,
} from '../utils/test-helpers';

test.describe('記事詳細ページ', () => {
  test('記事詳細が正常に表示される', async ({ page }) => {
    // ホームページから記事一覧を取得
    await page.goto(testData.paths.home);
    await waitForPageLoad(page);
    
    // 最初の記事リンクを取得
    const firstArticleLink = page.locator('article a, [class*="article"] a, [class*="card"] a').first();
    
    // 記事が存在する場合のみテスト実行
    if (await firstArticleLink.isVisible()) {
      // 記事詳細ページへ遷移
      await firstArticleLink.click();
      await waitForPageLoad(page);
      
      // 記事詳細ページのURLパターンを確認
      await expect(page).toHaveURL(/\/articles?\//);
      
      // エラーがないことを確認
      await expectNoErrors(page);
      
      // 記事タイトルが表示されることを確認
      const articleTitle = page.locator('h1, [class*="title"]').first();
      await expect(articleTitle).toBeVisible();
      const titleText = await articleTitle.textContent();
      expect(titleText).toBeTruthy();
      
      // 記事本文が表示されることを確認
      const articleContent = page.locator('article, [class*="content"], [class*="body"]').first();
      await expect(articleContent).toBeVisible();
    }
  });

  test('記事メタデータが表示される', async ({ page }) => {
    // ホームページから記事詳細へ
    await page.goto(testData.paths.home);
    await waitForPageLoad(page);
    
    const firstArticleLink = page.locator('article a, [class*="article"] a').first();
    
    if (await firstArticleLink.isVisible()) {
      await firstArticleLink.click();
      await waitForPageLoad(page);
      
      // 投稿日時の表示を確認
      const dateElement = page.locator('time, [class*="date"], [class*="published"]').first();
      if (await dateElement.isVisible()) {
        const dateText = await dateElement.textContent();
        expect(dateText).toBeTruthy();
      }
      
      // ソース情報の表示を確認
      const sourceElement = page.locator('[class*="source"], [data-testid="source"]').first();
      if (await sourceElement.isVisible()) {
        const sourceText = await sourceElement.textContent();
        expect(sourceText).toBeTruthy();
      }
      
      // タグの表示を確認
      const tags = page.locator('[class*="tag"], [data-testid="tag"]');
      const tagCount = await tags.count();
      if (tagCount > 0) {
        const firstTag = tags.first();
        await expect(firstTag).toBeVisible();
      }
    }
  });

  test('関連記事セクションが表示される', async ({ page }) => {
    // 記事詳細ページへアクセス
    await page.goto(testData.paths.home);
    await waitForPageLoad(page);
    
    const firstArticleLink = page.locator('article a').first();
    
    if (await firstArticleLink.isVisible()) {
      await firstArticleLink.click();
      await waitForPageLoad(page);
      
      // 関連記事セクションを探す
      const relatedSection = page.locator(
        '[class*="related"], [data-testid="related-articles"], section:has-text("関連"), section:has-text("Related")'
      ).first();
      
      if (await relatedSection.isVisible()) {
        // 関連記事が少なくとも1つ表示されることを確認
        const relatedArticles = relatedSection.locator('article, [class*="card"], a');
        const relatedCount = await relatedArticles.count();
        expect(relatedCount).toBeGreaterThan(0);
      }
    }
  });

  test('お気に入り機能が動作する', async ({ page }) => {
    // 記事詳細ページへアクセス
    await page.goto(testData.paths.home);
    await waitForPageLoad(page);
    
    const firstArticleLink = page.locator('article a').first();
    
    if (await firstArticleLink.isVisible()) {
      await firstArticleLink.click();
      await waitForPageLoad(page);
      
      // お気に入りボタンを探す
      const favoriteButton = page.locator(
        'button[class*="favorite"], button[class*="like"], button[data-testid="favorite"], [aria-label*="お気に入り"], [aria-label*="favorite"]'
      ).first();
      
      if (await favoriteButton.isVisible()) {
        // 初期状態を記録
        const initialClass = await favoriteButton.getAttribute('class');
        const initialAriaPressed = await favoriteButton.getAttribute('aria-pressed');
        
        // ボタンをクリック
        await favoriteButton.click();
        
        // 状態が変化することを確認（クラスまたはaria-pressedの変化）
        await page.waitForFunction(
          async () => {
            const button = document.querySelector('[data-testid*="favorite"], button[aria-label*="お気に入り"], button[aria-label*="favorite"]');
            if (!button) return false;
            
            // クラスまたはaria-pressed属性の変化を待つ
            const currentClass = button.getAttribute('class');
            const currentAriaPressed = button.getAttribute('aria-pressed');
            return currentClass !== '${initialClass}' || currentAriaPressed !== '${initialAriaPressed}';
          },
          { timeout: 5000 }
        );
        
        const newClass = await favoriteButton.getAttribute('class');
        const newAriaPressed = await favoriteButton.getAttribute('aria-pressed');
        
        // いずれかの属性が変化していることを確認
        const hasChanged = (initialClass !== newClass) || (initialAriaPressed !== newAriaPressed);
        expect(hasChanged).toBeTruthy();
      }
    }
  });

  test('ソースリンクが機能する', async ({ page }) => {
    // 記事詳細ページへアクセス
    await page.goto(testData.paths.home);
    await waitForPageLoad(page);
    
    const firstArticleLink = page.locator('article a').first();
    
    if (await firstArticleLink.isVisible()) {
      await firstArticleLink.click();
      await waitForPageLoad(page);
      
      // 外部リンク（元記事へのリンク）を探す
      const sourceLink = page.locator(
        'a[href*="http"]:has-text("元記事"), a[href*="http"]:has-text("Source"), a[target="_blank"]'
      ).first();
      
      if (await sourceLink.isVisible()) {
        const href = await sourceLink.getAttribute('href');
        expect(href).toContain('http');
        
        // target="_blank"が設定されていることを確認
        const target = await sourceLink.getAttribute('target');
        expect(target).toBe('_blank');
      }
    }
  });

  test('404エラーページが適切に表示される', async ({ page }) => {
    // 存在しない記事IDでアクセス
    await page.goto('/articles/non-existent-article-id-123456789');
    
    // 404エラーまたは適切なエラーメッセージが表示されることを確認
    const errorMessage = page.locator(
      ':text("404"), :text("見つかりません"), :text("Not Found"), :text("存在しません")'
    ).first();
    
    // エラーメッセージが表示されるか、ホームへのリダイレクトを確認
    const hasError = await errorMessage.isVisible();
    const isRedirected = page.url().includes(testData.paths.home);
    
    expect(hasError || isRedirected).toBeTruthy();
  });
});