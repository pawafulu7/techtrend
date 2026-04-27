import { test, expect } from '@playwright/test';
import { SELECTORS } from './constants/selectors';
import { waitForPageLoad } from './utils/e2e-helpers';

test.describe('関連記事のナビゲーション', () => {
  test.slow();

  test.beforeEach(async ({ page }) => {
    // ホームページにアクセス
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await waitForPageLoad(page, { waitForNetworkIdle: false });

    // 記事が存在することを確認
    await page.waitForSelector(SELECTORS.ARTICLE_CARD, { timeout: 10000 });
    const articleCount = await page.locator(SELECTORS.ARTICLE_CARD).count();
    if (articleCount === 0) {
      throw new Error('No articles found. Test data may not be loaded.');
    }

    // 最初の記事をクリックして詳細ページへ
    const firstArticle = page.locator('[data-testid="article-card"]').first();
    await firstArticle.click();

    // 詳細ページが完全に読み込まれるまで待機
    await page.waitForURL(/\/articles\/.+/, { timeout: 10000 });
    await page.waitForSelector('h1', { timeout: 10000 });
    await waitForPageLoad(page, { waitForNetworkIdle: false });
  });

  test('関連記事をクリックして詳細要約ページに遷移できる', async ({ page }) => {
    // 関連記事セクションが表示されていることを確認
    const relatedSection = page.locator(SELECTORS.RELATED_SECTION);
    const isVisible = await relatedSection.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip('関連記事が表示されていません');
    }

    // 関連記事のリンクを取得
    const relatedLinks = page.locator(SELECTORS.RELATED_ARTICLE_LINK);
    const linkCount = await relatedLinks.count();

    if (linkCount === 0) {
      test.skip('関連記事のリンクが見つかりません');
    }

    const firstRelatedLink = relatedLinks.first();

    // クリック前のURLを記録
    const beforeUrl = page.url();

    // 関連記事をクリック
    await firstRelatedLink.click();
    await waitForPageLoad(page, { waitForNetworkIdle: false });

    // 詳細要約ページに遷移したことを確認
    await expect(page).toHaveURL(/\/articles\/[^/]+$/);

    // URLが変わったことを確認
    expect(page.url()).not.toBe(beforeUrl);

    // 記事タイトルが表示されることを確認
    const title = page.locator('h1').first();
    await expect(title).toBeVisible();
  });

  test('関連記事のリンクが正しいhrefを持つ', async ({ page }) => {
    // 関連記事セクションが表示されていることを確認
    const relatedSection = page.locator(SELECTORS.RELATED_SECTION);
    const isVisible = await relatedSection.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip('関連記事が表示されていません');
    }

    // 関連記事のリンクを取得
    const relatedLinks = page.locator(SELECTORS.RELATED_ARTICLE_LINK);
    const linkCount = await relatedLinks.count();

    if (linkCount === 0) {
      test.skip('関連記事のリンクが見つかりません');
    }

    // 最初のリンクのhref属性を確認
    const firstRelatedLink = relatedLinks.first();
    const href = await firstRelatedLink.getAttribute('href');

    // href属性が/articles/[id]の形式であることを確認
    expect(href).toMatch(/^\/articles\/[^/]+$/);
  });

  test('中クリックで関連記事を新しいタブで開ける', async ({ page, context }) => {
    // 関連記事セクションが表示されていることを確認
    const relatedSection = page.locator(SELECTORS.RELATED_SECTION);
    const isVisible = await relatedSection.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip('関連記事が表示されていません');
    }

    // 関連記事のリンクを取得
    const relatedLinks = page.locator(SELECTORS.RELATED_ARTICLE_LINK);
    const linkCount = await relatedLinks.count();

    if (linkCount === 0) {
      test.skip('関連記事のリンクが見つかりません');
    }

    const firstRelatedLink = relatedLinks.first();

    // 新しいページが開くのを待つ
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      firstRelatedLink.click({ button: 'middle' })
    ]);

    // 新タブの URL 確定を明示的に待つ (toHaveURL の "navigation to finish" 待機は新タブで flaky)
    await newPage.waitForURL(/\/articles\/[^/]+$/, { timeout: 30000, waitUntil: 'domcontentloaded' });

    // 新しいタブで詳細要約ページが開いたことを確認 (waitForURL 後の URL 文字列を直接照合)
    expect(newPage.url()).toMatch(/\/articles\/[^/]+$/);

    await newPage.close();
  });

  test('Ctrl/Cmd+クリックで関連記事を新しいタブで開ける', async ({ page, context }) => {
    // 関連記事セクションが表示されていることを確認
    const relatedSection = page.locator(SELECTORS.RELATED_SECTION);
    const isVisible = await relatedSection.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip('関連記事が表示されていません');
    }

    // 関連記事のリンクを取得
    const relatedLinks = page.locator(SELECTORS.RELATED_ARTICLE_LINK);
    const linkCount = await relatedLinks.count();

    if (linkCount === 0) {
      test.skip('関連記事のリンクが見つかりません');
    }

    const firstRelatedLink = relatedLinks.first();

    // 新しいページが開くのを待つ
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      firstRelatedLink.click({
        modifiers: process.platform === 'darwin' ? ['Meta'] : ['Control']
      })
    ]);

    // 新タブの URL 確定を明示的に待つ (toHaveURL の "navigation to finish" 待機は新タブで flaky)
    await newPage.waitForURL(/\/articles\/[^/]+$/, { timeout: 30000, waitUntil: 'domcontentloaded' });

    // 新しいタブで詳細要約ページが開いたことを確認 (waitForURL 後の URL 文字列を直接照合)
    expect(newPage.url()).toMatch(/\/articles\/[^/]+$/);

    await newPage.close();
  });

  test('Enterキーで関連記事に遷移できる', async ({ page }) => {
    // 関連記事セクションが表示されていることを確認
    const relatedSection = page.locator(SELECTORS.RELATED_SECTION);
    const isVisible = await relatedSection.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip('関連記事が表示されていません');
    }

    // 関連記事のリンクを取得
    const relatedLinks = page.locator(SELECTORS.RELATED_ARTICLE_LINK);
    const linkCount = await relatedLinks.count();

    if (linkCount === 0) {
      test.skip('関連記事のリンクが見つかりません');
    }

    const firstRelatedLink = relatedLinks.first();

    // リンクにフォーカス
    await firstRelatedLink.focus();

    // Enterキーを押す
    await page.keyboard.press('Enter');
    await waitForPageLoad(page, { waitForNetworkIdle: false });

    // 詳細要約ページに遷移したことを確認
    await expect(page).toHaveURL(/\/articles\/[^/]+$/);

    // 記事タイトルが表示されることを確認
    const title = page.locator('h1').first();
    await expect(title).toBeVisible();
  });
});