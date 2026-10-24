import { test, expect, type Page } from '@playwright/test';
import { loginTestUser } from './utils/e2e-helpers';

/**
 * 一般利用者向けの画面は h1 をちょうど1つ持ち、一覧型・分析型は PageHeader を使う（Issue #700）。
 * 幅は、もともと全幅だった一覧（ホーム・論文・お気に入り・フィード・履歴・ダイジェスト）は全幅、
 * それ以外の一覧型・分析型は max-w-7xl。
 * 管理画面（/dashboard・/sources・/stats）は対象外。
 */

const VIEWPORT_WIDTH = 1440;
const MAX_WIDTH_7XL = '1280px';
// max-w-7xl（1280px）から左右の px-4（16px ずつ）を引いた、PageHeader の幅
const PAGE_HEADER_WIDTH_7XL = 1280 - 16 * 2;
// 6xl（1152px）以下や全幅と取り違えないための下限。スクロールバーの幅の分だけ余裕を持たせる
const PAGE_HEADER_MIN_WIDTH_7XL = 1200;
// 全幅の画面の PageHeader の幅の下限（左右の lg:px-6 とスクロールバーの分を引く）
const PAGE_HEADER_MIN_WIDTH_FULL = VIEWPORT_WIDTH - 24 * 2 - 20;

interface HeadingCase {
  path: string;
  /** h1 の文言。記事タイトルのように中身がデータで変わるものは省く */
  h1?: string;
  /**
   * 一覧型・分析型は PageHeader を使う。幅は 7xl か全幅。
   * row は、見出しがツールバーと同じ行に入る画面（ホーム）。その行が全幅
   */
  pageHeader?: '7xl' | 'full' | 'row';
  /** サブナビ。左端が PageHeader とそろう */
  subNav?: string;
}

const TREND_SUB_NAV = 'nav[aria-label="トレンドナビゲーション"]';
const HISTORY_SUB_NAV = 'nav[aria-label="閲覧履歴と読書分析"]';

const PUBLIC_PAGES: HeadingCase[] = [
  { path: '/', h1: '記事一覧', pageHeader: 'row' },
  { path: '/papers', h1: '論文', pageHeader: 'full' },
  {
    path: '/popular',
    h1: '人気記事ランキング',
    pageHeader: '7xl',
    subNav: 'nav[aria-label="ランキング期間"]',
  },
  // タグ・人気・AIエージェント更新情報は、トレンドのサブナビから行く画面（Issue #704）
  { path: '/tags', h1: 'タグ分析', pageHeader: '7xl', subNav: TREND_SUB_NAV },
  {
    path: '/trends',
    h1: 'トレンド概要',
    pageHeader: '7xl',
    subNav: TREND_SUB_NAV,
  },
  {
    path: '/trends/daily',
    h1: 'デイリートレンド',
    pageHeader: '7xl',
    subNav: TREND_SUB_NAV,
  },
  {
    path: '/trends/diff',
    h1: '週間トピック変化',
    pageHeader: '7xl',
    subNav: TREND_SUB_NAV,
  },
  {
    path: '/trends/heatmap',
    h1: 'テックセクターマップ',
    pageHeader: '7xl',
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
  { path: '/digest', h1: 'ダイジェスト', pageHeader: 'full' },
  { path: '/favorites', h1: 'お気に入り', pageHeader: 'full' },
  {
    path: '/history',
    h1: '閲覧履歴',
    pageHeader: 'full',
    subNav: HISTORY_SUB_NAV,
  },
  {
    path: '/history?tab=analytics',
    h1: '読書分析',
    pageHeader: 'full',
    subNav: HISTORY_SUB_NAV,
  },
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
  { path, h1, pageHeader, subNav }: HeadingCase
) {
  // リダイレクトされていない（callbackUrl に同じパスが入るので、URL 全体の部分一致では見分けられない）。
  // 検索条件で表示を切り替える画面（/history?tab=analytics）は、検索条件まで比べる
  const url = new URL(page.url());
  expect(
    path.includes('?') ? `${url.pathname}${url.search}` : url.pathname,
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

  if (!pageHeader) return;

  const header = page.locator('[data-slot="page-header"]');
  await expect(header, `${path} は PageHeader を使う`).toHaveCount(1);
  await expect(
    header.locator('h1'),
    `${path} の h1 は PageHeader の中`
  ).toHaveCount(1);
  const headerBox = await boxOf(page, '[data-slot="page-header"]', path);
  // PageHeader を包む要素（本文も同じ要素に入る画面が多い）の幅の上限
  const wrapperMaxWidth = await header.evaluate(
    (el) => getComputedStyle(el.parentElement as HTMLElement).maxWidth
  );

  if (pageHeader === 'row') {
    // 見出しはツールバーと同じ行に入る（ホーム）。行は全幅で、左右の余白は一覧と同じ
    const row = header.locator('xpath=..');
    const rowBox = await row.boundingBox();
    if (!rowBox) throw new Error(`${path} の見出しの行が無い`);
    expect(rowBox.width, `${path} の見出しの行は全幅`).toBeGreaterThanOrEqual(
      VIEWPORT_WIDTH - 20
    );
    expect(wrapperMaxWidth, `${path} の見出しの行は全幅`).toBe('none');
    expect(
      Math.round(headerBox.x - rowBox.x),
      `${path} の見出しの左の余白は一覧と同じ（lg:px-6）`
    ).toBe(24);
    // 1440px では、ツールバーが見出しと同じ行に並ぶ（次の行へ折り返さない）。
    // 見出しの縦の中心が、ツールバーの縦の範囲に入ることで確かめる
    const toolbarBox = await boxOf(page, '[data-testid="home-toolbar"]', path);
    const headerCenterY = headerBox.y + headerBox.height / 2;
    expect(
      headerCenterY,
      `${path} のツールバーは見出しと同じ行`
    ).toBeGreaterThanOrEqual(toolbarBox.y);
    expect(
      headerCenterY,
      `${path} のツールバーは見出しと同じ行`
    ).toBeLessThanOrEqual(toolbarBox.y + toolbarBox.height);
  } else if (pageHeader === '7xl') {
    expect(
      headerBox.width,
      `${path} の PageHeader の幅は 7xl`
    ).toBeLessThanOrEqual(PAGE_HEADER_WIDTH_7XL + 1);
    expect(
      headerBox.width,
      `${path} の PageHeader の幅は 7xl`
    ).toBeGreaterThanOrEqual(PAGE_HEADER_MIN_WIDTH_7XL);
    expect(wrapperMaxWidth, `${path} の PageHeader を包む要素は 7xl`).toBe(
      MAX_WIDTH_7XL
    );
  } else {
    expect(
      headerBox.width,
      `${path} の PageHeader は全幅`
    ).toBeGreaterThanOrEqual(PAGE_HEADER_MIN_WIDTH_FULL);
    expect(wrapperMaxWidth, `${path} の PageHeader を包む要素は全幅`).toBe(
      'none'
    );
  }

  if (subNav) {
    // サブナビが文字のタブ（トレンド）のときは、タブの左右の余白（px-3）の分だけ nav を外へ出し、
    // 最初のタブの中身（アイコン）を見出しにそろえる。ランキングの期間のような枠の無いナビは nav の左端でそろえる
    const firstTabIcon = page.locator(`${subNav} a svg`).first();
    const alignBox =
      (await firstTabIcon.count()) > 0
        ? await firstTabIcon.boundingBox()
        : await boxOf(page, subNav, path);
    if (!alignBox) throw new Error(`${path}: サブナビが描画されていない`);
    expect(
      Math.abs(alignBox.x - headerBox.x),
      `${path} のサブナビと PageHeader の左端がそろう`
    ).toBeLessThanOrEqual(1);
  }
}

test.describe('画面の見出し（Issue #700）', () => {
  test.use({ viewport: { width: VIEWPORT_WIDTH, height: 900 } });

  test.describe('ログイン不要の画面', () => {
    for (const pageCase of PUBLIC_PAGES) {
      test(`${pageCase.path} は h1 を1つ持つ`, async ({ page }) => {
        await openPage(page, pageCase.path);
        await expectHeadings(page, pageCase);
      });
    }

    test('記事詳細と関連グラフは h1 を1つ持つ', async ({ page }) => {
      await openPage(page, '/');
      // 記事のリンクはクライアント側で後から描画されるので、表示されるまで待ってから読む
      const link = page.locator('a[href^="/articles/"]').first();
      await expect(link, 'ホームに記事へのリンクがある').toBeVisible({
        timeout: 15000,
      });
      const href = await link.getAttribute('href');
      if (!href) throw new Error('ホームに記事へのリンクがない');
      const articlePath = new URL(href, 'http://localhost').pathname;

      await openPage(page, articlePath);
      await expectHeadings(page, { path: articlePath });
      // エラー画面（app/error.tsx）や 404 の h1 でも上の確認は通るので、記事本体が出ていることを見る
      // （タイトルの文言では判定しない。記事のタイトルが「404」などのこともあるため）
      await expect(
        page.getByRole('link', { name: /元記事を読む/ }).first()
      ).toBeVisible();

      // 本文の列は幅を縮めない（ユーザーの決定）。1440 の画面から、ページの左右の余白（px-6）・
      // 列の間（gap-6）・右の列（lg:w-80）・スクロールバーの分を引いた幅を下回らない
      const articleCard = page
        .locator('[data-testid="article-content"]')
        .locator('xpath=..');
      const articleCardBox = await articleCard.boundingBox();
      if (!articleCardBox) throw new Error('記事の本文の枠が描画されていない');
      expect(
        articleCardBox.width,
        '記事詳細の本文の列は画面の幅いっぱいに使う'
      ).toBeGreaterThanOrEqual(VIEWPORT_WIDTH - 24 * 2 - 24 - 320 - 20);

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

  test('リーダーの本文は右のペインの幅いっぱいに使う', async ({ page }) => {
    await openPage(page, '/reader');
    // 本文のカード（タイトルの h2 の親）。右のペインは一覧（lg:w-[380px]）の残りで、
    // その左右の余白（px-5）とスクロールバーの分を引いた幅を下回らない（幅を縮めない。ユーザーの決定）
    const title = page
      .getByRole('region', { name: '記事詳細' })
      .getByRole('heading', { level: 2 });
    await expect(title).toBeVisible({ timeout: 15000 });
    const cardBox = await title.locator('xpath=..').boundingBox();
    if (!cardBox) throw new Error('リーダーの本文のカードが描画されていない');
    expect(
      cardBox.width,
      'リーダーの本文は右のペインの幅いっぱいに使う'
    ).toBeGreaterThanOrEqual(VIEWPORT_WIDTH - 380 - 20 * 2 - 20);
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
