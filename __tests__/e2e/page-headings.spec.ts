import { test, expect, type Page } from '@playwright/test';
import { loginTestUser } from './utils/e2e-helpers';

/**
 * 一般利用者向けの画面は h1 をちょうど1つ持ち、一覧型・分析型は PageHeader を
 * max-w-7xl の幅に置く（Issue #700）。
 * 管理画面（/dashboard・/sources・/stats）は対象外。
 */

const MAX_WIDTH_7XL = '1280px';
// max-w-7xl（1280px）から左右の px-4（16px ずつ）を引いた、PageHeader の幅
const PAGE_HEADER_WIDTH_7XL = 1280 - 16 * 2;
// 6xl（1152px）以下や全幅と取り違えないための下限。スクロールバーの幅の分だけ余裕を持たせる
const PAGE_HEADER_MIN_WIDTH = 1200;

interface HeadingCase {
  path: string;
  /** h1 の文言。記事タイトルのように中身がデータで変わるものは省く */
  h1?: string;
  /** 一覧型・分析型は PageHeader を 7xl の幅に置く */
  pageHeader7xl?: boolean;
  /** PageHeader と別の要素に置いた本文（スクロール領域の中身など）。これも 7xl にそろう */
  content?: string;
  /** サブナビ。左端が PageHeader とそろう */
  subNav?: string;
}

const TREND_SUB_NAV = 'nav[aria-label="トレンドナビゲーション"]';

const PUBLIC_PAGES: HeadingCase[] = [
  {
    path: '/',
    h1: '記事一覧',
    pageHeader7xl: true,
    content: '#main-scroll-container > div',
  },
  {
    path: '/papers',
    h1: '論文',
    pageHeader7xl: true,
    content: '#papers-scroll-container > div',
  },
  {
    path: '/popular',
    h1: '人気記事ランキング',
    pageHeader7xl: true,
    subNav: 'nav[aria-label="ランキング期間"]',
  },
  { path: '/tags', h1: 'タグ分析', pageHeader7xl: true },
  {
    path: '/trends',
    h1: 'トレンド概要',
    pageHeader7xl: true,
    subNav: TREND_SUB_NAV,
  },
  {
    path: '/trends/daily',
    h1: 'デイリートレンド',
    pageHeader7xl: true,
    subNav: TREND_SUB_NAV,
  },
  {
    path: '/trends/diff',
    h1: '週間トピック変化',
    pageHeader7xl: true,
    subNav: TREND_SUB_NAV,
  },
  {
    path: '/trends/heatmap',
    h1: 'テックセクターマップ',
    pageHeader7xl: true,
    subNav: TREND_SUB_NAV,
  },
  // h1 はプロジェクト名（データで変わる）
  { path: '/changelog' },
  { path: '/auth/login', h1: 'ログイン' },
  { path: '/auth/signup', h1: '新規登録' },
  { path: '/auth/error', h1: '認証エラー' },
  { path: '/auth/verify' },
];

const AUTHENTICATED_PAGES: HeadingCase[] = [
  { path: '/digest', h1: 'ダイジェスト', pageHeader7xl: true },
  { path: '/favorites', h1: 'お気に入り', pageHeader7xl: true },
  { path: '/favorites/feed', h1: 'お気に入りフィード', pageHeader7xl: true },
  { path: '/history', h1: '閲覧履歴', pageHeader7xl: true },
  { path: '/analytics', h1: '読書分析', pageHeader7xl: true },
  { path: '/search/agent', h1: 'AI検索' },
  { path: '/reader', h1: 'リーダー' },
  { path: '/profile', h1: 'プロフィール設定' },
];

async function openPage(page: Page, path: string) {
  await page.goto(path);
  // クライアント側の取得が終わってから数える（読み込み後に見出しが増えたり消えたりしないことも見るため）
  await page
    .waitForLoadState('networkidle', { timeout: 15000 })
    .catch(() => undefined);
}

async function boxOf(page: Page, selector: string, label: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${label}: ${selector} が描画されていない`);
  return box;
}

async function expectHeadings(
  page: Page,
  { path, h1, pageHeader7xl, content, subNav }: HeadingCase
) {
  // リダイレクトされていない（callbackUrl に同じパスが入るので、URL 全体の部分一致では見分けられない）
  expect(
    new URL(page.url()).pathname,
    `${path} でリダイレクトされていない`
  ).toBe(path);

  const headings = page.locator('h1');
  await expect(headings, `${path} の h1 は1つ`).toHaveCount(1);
  await expect(headings, `${path} の h1 は表示されている`).toBeVisible();
  // 読み込み中だけ sr-only の h1 を置く画面（changelog・プロフィール）は、落ち着くまで待つ
  await expect(headings, `${path} の h1 は sr-only ではない`).not.toHaveClass(
    /(^|\s)sr-only(\s|$)/,
    { timeout: 15000 }
  );
  // toBeVisible は 1x1 の sr-only も見えていると判定するので、大きさも見る
  const headingBox = await boxOf(page, 'h1', path);
  expect(
    headingBox.height,
    `${path} の h1 は sr-only ではない`
  ).toBeGreaterThan(1);
  if (h1) {
    await expect(headings).toHaveText(h1);
  }

  if (!pageHeader7xl) return;

  const pageHeader = page.locator('[data-slot="page-header"]');
  await expect(pageHeader, `${path} は PageHeader を使う`).toHaveCount(1);
  await expect(
    pageHeader.locator('h1'),
    `${path} の h1 は PageHeader の中`
  ).toHaveCount(1);
  const headerBox = await boxOf(page, '[data-slot="page-header"]', path);
  expect(
    headerBox.width,
    `${path} の PageHeader の幅は 7xl`
  ).toBeLessThanOrEqual(PAGE_HEADER_WIDTH_7XL + 1);
  expect(
    headerBox.width,
    `${path} の PageHeader の幅は 7xl`
  ).toBeGreaterThanOrEqual(PAGE_HEADER_MIN_WIDTH);

  // PageHeader を包む要素（本文も同じ要素に入る画面が多い）の上限が 7xl
  const wrapperMaxWidth = await pageHeader.evaluate(
    (el) => getComputedStyle(el.parentElement as HTMLElement).maxWidth
  );
  expect(wrapperMaxWidth, `${path} の PageHeader を包む要素は 7xl`).toBe(
    MAX_WIDTH_7XL
  );

  if (content) {
    const contentMaxWidth = await page
      .locator(content)
      .first()
      .evaluate((el) => getComputedStyle(el).maxWidth);
    expect(contentMaxWidth, `${path} の本文は 7xl`).toBe(MAX_WIDTH_7XL);
  }

  if (subNav) {
    const navBox = await boxOf(page, subNav, path);
    expect(
      Math.abs(navBox.x - headerBox.x),
      `${path} のサブナビと PageHeader の左端がそろう`
    ).toBeLessThanOrEqual(1);
  }
}

test.describe('画面の見出し（Issue #700）', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.describe('ログイン不要の画面', () => {
    for (const pageCase of PUBLIC_PAGES) {
      test(`${pageCase.path} は h1 を1つ持つ`, async ({ page }) => {
        await openPage(page, pageCase.path);
        await expectHeadings(page, pageCase);
      });
    }

    test('記事詳細と関連グラフは h1 を1つ持つ', async ({ page }) => {
      await openPage(page, '/');
      const href = await page
        .locator('a[href^="/articles/"]')
        .first()
        .getAttribute('href');
      if (!href) throw new Error('ホームに記事へのリンクがない');
      const articlePath = new URL(href, 'http://localhost').pathname;

      await openPage(page, articlePath);
      await expectHeadings(page, { path: articlePath });

      await openPage(page, `${articlePath}/graph`);
      await expectHeadings(page, {
        path: `${articlePath}/graph`,
        h1: '関連記事グラフ',
      });
    });
  });

  test.describe('ログインが要る画面', () => {
    test.beforeEach(async ({ page }) => {
      const loggedIn = await loginTestUser(page);
      if (!loggedIn) {
        throw new Error('Failed to login test user');
      }
    });

    for (const pageCase of AUTHENTICATED_PAGES) {
      test(`${pageCase.path} は h1 を1つ持つ`, async ({ page }) => {
        await openPage(page, pageCase.path);
        await expectHeadings(page, pageCase);
      });
    }
  });

  test('狭い画面のリーダーは、記事一覧だけのときも h1 を1つ持つ', async ({
    page,
  }) => {
    const loggedIn = await loginTestUser(page);
    if (!loggedIn) {
      throw new Error('Failed to login test user');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await openPage(page, '/reader');
    await expectHeadings(page, { path: '/reader', h1: 'リーダー' });
  });
});
