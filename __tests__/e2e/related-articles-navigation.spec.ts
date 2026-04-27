import { test, expect, type Page } from '@playwright/test';
import { SELECTORS } from './constants/selectors';
import { waitForPageLoad } from './utils/e2e-helpers';

const ARTICLE_DETAIL_URL_PATTERN = /\/articles\/[^/]+$/;

// 正規表現メタ文字をエスケープする (`.` `+` `(` 等が含まれる href の誤マッチ対策)
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 新タブの navigation 完了を明示的に待つヘルパー
// (toHaveURL の "navigation to finish" 待機は新タブで flaky なため、
// waitForURL + waitUntil:'domcontentloaded' で URL 確定を待ち、
// 同期 toMatch でセーフティネットを張る)
async function assertNewTabNavigatedToArticle(newPage: Page) {
  await newPage.waitForURL(ARTICLE_DETAIL_URL_PATTERN, {
    timeout: 30000,
    waitUntil: 'domcontentloaded',
  });
  expect(newPage.url()).toMatch(ARTICLE_DETAIL_URL_PATTERN);
}

// 指定 href への navigation 完了を待つヘルパー。
// targetHref を未エスケープのまま正規表現に埋めるとメタ文字で誤マッチを起こすため、
// escapeRegExp + 先頭のホスト境界アンカー + 末尾の query/hash/EOS で安全に待機する。
async function waitForNavigationToHref(page: Page, href: string) {
  const pattern = new RegExp(
    `(?:^|//[^/]+)${escapeRegExp(href)}(?:\\?|#|$)`
  );
  await page.waitForURL(pattern, {
    timeout: 30000,
    waitUntil: 'domcontentloaded',
  });
}

// related-articles API は自記事を含むことがあり、`relatedLinks.first()` が
// 現在表示中の記事と同一になると click 後 URL が変わらず flaky 化する。
// 現在 URL と異なる pathname を持つ link を返すヘルパー (href は並列取得で時間短縮)。
async function pickRelatedLinkDifferentFromCurrent(page: Page) {
  const currentPath = new URL(page.url()).pathname;
  const relatedLinks = page.locator(SELECTORS.RELATED_ARTICLE_LINK);
  const count = await relatedLinks.count();
  const hrefs = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      relatedLinks.nth(i).getAttribute('href')
    )
  );
  for (let i = 0; i < count; i++) {
    const href = hrefs[i];
    if (!href) continue;
    // 相対 / 絶対 URL の両方を扱える URL コンストラクタで pathname を抽出
    let hrefPath: string;
    try {
      hrefPath = new URL(href, page.url()).pathname;
    } catch {
      continue;
    }
    if (hrefPath !== currentPath) {
      return relatedLinks.nth(i);
    }
  }
  return null;
}

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

    // 自記事と同じ href を避けて選ぶ (related-articles API が自記事を含む可能性)
    const targetLink = await pickRelatedLinkDifferentFromCurrent(page);
    if (!targetLink) {
      test.skip('現在記事と異なる関連記事リンクが見つかりません');
      return;
    }
    const targetHref = await targetLink.getAttribute('href');
    expect(targetHref).not.toBeNull();

    // クリック前のURLを記録
    const beforeUrl = page.url();

    // 関連記事をクリック (target href への navigation 完了まで明示的に待つ)
    // beforeUrl も ARTICLE_DETAIL_URL_PATTERN に一致するため、汎用 pattern では
    // click 前の URL で waitForURL が即 return してしまう。target href 専用で待つ。
    await targetLink.click();
    await waitForNavigationToHref(page, targetHref!);
    await waitForPageLoad(page, { waitForNetworkIdle: false });

    // 詳細要約ページに遷移したことを確認
    expect(page.url()).toMatch(ARTICLE_DETAIL_URL_PATTERN);

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

    await assertNewTabNavigatedToArticle(newPage);

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

    await assertNewTabNavigatedToArticle(newPage);

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

    // 自記事と同じ href を避ける
    const targetLink = await pickRelatedLinkDifferentFromCurrent(page);
    if (!targetLink) {
      test.skip('現在記事と異なる関連記事リンクが見つかりません');
      return;
    }
    const targetHref = await targetLink.getAttribute('href');
    expect(targetHref).not.toBeNull();

    // リンクにフォーカス
    await targetLink.focus();

    // Enterキーを押す (target href への navigation 完了まで明示的に待つ)
    await page.keyboard.press('Enter');
    await waitForNavigationToHref(page, targetHref!);
    await waitForPageLoad(page, { waitForNetworkIdle: false });

    // 詳細要約ページに遷移したことを確認
    expect(page.url()).toMatch(ARTICLE_DETAIL_URL_PATTERN);

    // 記事タイトルが表示されることを確認
    const title = page.locator('h1').first();
    await expect(title).toBeVisible();
  });
});