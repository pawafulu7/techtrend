import {
  test,
  expect,
  type Page,
  type Request,
  type TestInfo,
} from '@playwright/test';
import { getTimeout } from '../../../e2e/helpers/wait-utils';
import { SELECTORS } from '../constants/selectors';
import { loginTestUser } from '../utils/e2e-helpers';

/**
 * ホームの一覧の1ページ目をサーバーで描く（issue #714）。
 *
 * - SSR の HTML に1ページ目の記事が入る
 * - hydration の後に1ページ目を取り直さない
 * - 次のページの取得とフィルターの変更は、これまでどおりクライアントが取る
 */

const ARTICLE_LIST_API = /\/api\/articles(\/list)?\?/;

/** React の hydration の失敗（本番ビルドでは Minified React error #418 など） */
function hydrationErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (
      message.type() === 'error' &&
      (/hydrat/i.test(text) || /Minified React error #(418|423|425)/.test(text))
    ) {
      errors.push(text);
    }
  });
  page.on('pageerror', (error) => {
    if (/hydrat|#418|#423|#425/i.test(error.message)) {
      errors.push(`${error.message}\n${error.stack ?? ''}`);
    }
  });
  return errors;
}

async function expectFirstPageWithoutRefetch(page: Page, testInfo: TestInfo) {
  const requests = articleListRequests(page);
  const errors = hydrationErrors(page);
  await page.goto('/', { waitUntil: 'networkidle' });

  const cards = page.locator(SELECTORS.HOME_ARTICLE_CARD);
  await expect(cards.first()).toBeVisible({ timeout: getTimeout('medium') });
  const favoriteButtons = page.locator(SELECTORS.HOME_ARTICLE_FAVORITE_BUTTON);
  // サーバー描画ではセッション判定中で disabled。hydration の後に外れる
  await expect(favoriteButtons.first()).toBeEnabled({
    timeout: getTimeout('medium'),
  });
  expect(
    await page
      .locator(`${SELECTORS.HOME_ARTICLE_FAVORITE_BUTTON}[disabled]`)
      .count()
  ).toBe(0);

  // 2ページ目以降の取得（一覧の下端が見えたとき）は正常な動きなので数えない
  const firstPageRequests = requests
    .filter((url) => (url.searchParams.get('page') ?? '1') === '1')
    .map((url) => url.toString());
  // 失敗したときに原因を追えるよう、観測したものを残す
  await testInfo.attach('home-ssr-observations', {
    body: JSON.stringify(
      {
        retry: testInfo.retry,
        requests: requests.map((url) => url.toString()),
        hydrationErrors: errors,
      },
      null,
      2
    ),
    contentType: 'application/json',
  });
  expect({ firstPageRequests, hydrationErrors: errors }).toEqual({
    firstPageRequests: [],
    hydrationErrors: [],
  });
}

function articleListRequests(page: Page) {
  const requests: URL[] = [];
  page.on('request', (request: Request) => {
    if (ARTICLE_LIST_API.test(request.url())) {
      requests.push(new URL(request.url()));
    }
  });
  return requests;
}

test.describe('ホームの1ページ目のサーバー描画', () => {
  test('SSR の HTML に1ページ目の記事が入る', async ({ request }) => {
    const response = await request.get('/');
    expect(response.ok()).toBe(true);
    const html = await response.text();

    const cards = html.match(/data-testid="article-card"/g) ?? [];
    expect(cards.length).toBeGreaterThan(0);
    expect(html).toMatch(/件の記事/);
  });

  test('hydration の後に1ページ目を取り直さず、お気に入りボタンを押せる', async ({
    page,
  }, testInfo) => {
    await expectFirstPageWithoutRefetch(page, testInfo);
  });

  test('ログイン中も hydration の後に1ページ目を取り直さない', async ({
    page,
  }, testInfo) => {
    expect(await loginTestUser(page)).toBe(true);
    await expectFirstPageWithoutRefetch(page, testInfo);
  });

  test('スクロールで次のページを取る', async ({ page }) => {
    const requests = articleListRequests(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    const cards = page.locator(SELECTORS.HOME_ARTICLE_CARD);
    await expect(cards.first()).toBeVisible({ timeout: getTimeout('medium') });
    const firstPageCount = await cards.count();

    const nextPage = page.waitForRequest(
      (request) =>
        ARTICLE_LIST_API.test(request.url()) &&
        new URL(request.url()).searchParams.get('page') === '2',
      { timeout: getTimeout('medium') }
    );
    await page
      .locator(SELECTORS.HOME_LIST_SCROLL_CONTAINER)
      .evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await nextPage;

    await expect
      .poll(() => cards.count(), { timeout: getTimeout('medium') })
      .toBeGreaterThan(firstPageCount);
    expect(
      requests.filter((url) => url.searchParams.get('page') === '1')
    ).toEqual([]);
  });

  test('並び順を変えると、クライアントがその条件の1ページ目を取る', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const cards = page.locator(SELECTORS.HOME_ARTICLE_CARD);
    await expect(cards.first()).toBeVisible({ timeout: getTimeout('medium') });

    const sortedFirstPage = page.waitForRequest(
      (request) => {
        if (!ARTICLE_LIST_API.test(request.url())) return false;
        const params = new URL(request.url()).searchParams;
        return (
          params.get('sortBy') === 'qualityScore' && params.get('page') === '1'
        );
      },
      { timeout: getTimeout('medium') }
    );
    await page.getByRole('button', { name: '品質' }).first().click();
    await sortedFirstPage;

    await expect(page).toHaveURL(/sortBy=qualityScore/);
    await expect(cards.first()).toBeVisible({ timeout: getTimeout('medium') });
  });

  test('並び順を変えてからブラウザで戻ると、最初の条件の一覧を取り直す', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const cards = page.locator(SELECTORS.HOME_ARTICLE_CARD);
    await expect(cards.first()).toBeVisible({ timeout: getTimeout('medium') });

    const sortedFirstPage = page.waitForResponse(
      (response) => {
        if (!ARTICLE_LIST_API.test(response.url())) return false;
        const params = new URL(response.url()).searchParams;
        return (
          params.get('sortBy') === 'qualityScore' && params.get('page') === '1'
        );
      },
      { timeout: getTimeout('medium') }
    );
    await page.getByRole('button', { name: '品質' }).first().click();
    await sortedFirstPage;
    // 前の条件のキャッシュは、条件の変更から 200ms 後に消える
    // （app/hooks/use-infinite-articles.ts の debounce）。消える前に戻ると、
    // キャッシュの一覧をそのまま出すので取り直さない
    await page.waitForTimeout(1000);

    // 最初の文書のサーバーのデータを入れ直さず（並び替えで消した条件に古い1ページ目が
    // 戻るため）、クライアントが取り直す
    const unsortedFirstPage = page.waitForRequest(
      (request) => {
        if (!ARTICLE_LIST_API.test(request.url())) return false;
        const params = new URL(request.url()).searchParams;
        return !params.has('sortBy') && params.get('page') === '1';
      },
      { timeout: getTimeout('medium') }
    );
    await page.goBack();
    await unsortedFirstPage;
    await expect(cards.first()).toBeVisible({ timeout: getTimeout('medium') });
  });
});
