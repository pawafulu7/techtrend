import { test, expect, type Page } from '@playwright/test';

/**
 * リーダーの一覧のキーボード操作とフォーカス（app/reader/reader-client.tsx・article-list.tsx）。
 *
 * - フォーカスは listbox に置いたまま、選んでいる行を aria-activedescendant で示す。Tab で止まるのは listbox だけ
 * - デスクトップ（2ペイン）: 上下の矢印・Home・End で選ぶと本文も替わる。本文の「次の記事」で選択が
 *   変わっても、フォーカスは押したボタンに残る（一覧がフォーカスを奪わない）
 * - md 未満（1ペイン）: 矢印は選んでいる行を動かすだけで、Enter で開く。開いたら本文の領域へ、
 *   一覧に戻ったら直前の行（listbox）へフォーカスを移す。本文の取得が遅い・失敗しても行き先は本文の領域
 * - 深いリンクで開いた記事が一覧に無いときは、listbox の選んでいる行を無しにする
 *
 * jsdom は scrollIntoView とフォーカスの移動を再現しきれないので、ブラウザで確かめる。
 */

const DETAIL_API = /\/api\/articles\/(?!list)[^/?]+(\?.*)?$/;

function listbox(page: Page) {
  return page.getByRole('listbox', { name: '記事一覧' });
}

function options(page: Page) {
  return listbox(page).getByRole('option');
}

async function openReader(page: Page, path = '/reader') {
  await page.goto(path);
  await expect(options(page).nth(2)).toBeVisible({ timeout: 20000 });
}

/** 行の id から記事の id を取り出す（readerOptionId の逆） */
async function articleIdOf(page: Page, index: number): Promise<string> {
  const id = await options(page).nth(index).getAttribute('id');
  if (!id) throw new Error(`行 ${index} に id が無い`);
  return id.replace(/^reader-article-/, '');
}

function articleParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('article');
}

test.describe('リーダーのキーボード操作（デスクトップ）', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('矢印・Home・End で選ぶと本文も替わり、フォーカスは listbox に残る', async ({
    page,
  }) => {
    await openReader(page);
    const box = listbox(page);
    // 行は自分ではフォーカスを受けない（Tab で止まるのは listbox だけ）
    await expect(options(page).first()).not.toHaveAttribute('tabindex');
    await expect(box).toHaveAttribute('tabindex', '0');

    await box.focus();
    const firstId = await articleIdOf(page, 0);
    const secondId = await articleIdOf(page, 1);
    await expect(box).toHaveAttribute(
      'aria-activedescendant',
      `reader-article-${firstId}`
    );

    await page.keyboard.press('ArrowDown');
    await expect(box).toHaveAttribute(
      'aria-activedescendant',
      `reader-article-${secondId}`
    );
    await expect.poll(() => articleParam(page)).toBe(secondId);
    await expect(box).toBeFocused();
    // 本文は選んだ記事になる（タイトルは一覧と本文で同じ表記）
    const secondTitle = await options(page)
      .nth(1)
      .locator('p')
      .first()
      .innerText();
    await expect(
      page
        .getByRole('region', { name: '記事詳細' })
        .getByRole('heading', { level: 2 })
    ).toHaveText(secondTitle);

    // End で末尾までスクロールすると次のページの読み込みが始まるので、押す前の末尾を期待値にする
    const count = await options(page).count();
    const lastId = await articleIdOf(page, count - 1);
    await page.keyboard.press('End');
    await expect(box).toHaveAttribute(
      'aria-activedescendant',
      `reader-article-${lastId}`
    );

    await page.keyboard.press('Home');
    await expect(box).toHaveAttribute(
      'aria-activedescendant',
      `reader-article-${firstId}`
    );
    await expect(box).toBeFocused();
  });

  test('矢印を続けて押しても、URL の更新を待たずに押した数だけ進む', async ({
    page,
  }) => {
    await openReader(page);
    const box = listbox(page);
    await box.focus();
    const fourthId = await articleIdOf(page, 3);
    // URL（useSearchParams）の更新は遅れて届くので、待たずに3回押す
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(box).toHaveAttribute(
      'aria-activedescendant',
      `reader-article-${fourthId}`
    );
    await expect.poll(() => articleParam(page)).toBe(fourthId);
    // 途中の URL が後から届いても、選択は巻き戻らない
    await expect(box).toHaveAttribute(
      'aria-activedescendant',
      `reader-article-${fourthId}`
    );
  });

  test('記事を開いた状態で ↓・↑ と押した後に本文の「次の記事」を押すと、一覧と本文は 2 件目になる', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'CPU の制限は Chromium の CDP でだけ使える'
    );
    await openReader(page);
    const firstId = await articleIdOf(page, 0);
    const secondId = await articleIdOf(page, 1);
    const secondTitle = await options(page)
      .nth(1)
      .locator('p')
      .first()
      .innerText();
    // 1 件目を URL で開いた状態から始める（↑ で戻ったとき、URL の値が元と同じになる）
    await openReader(page, `/reader?article=${firstId}`);
    const box = listbox(page);
    await box.focus();

    // CPU を絞り、↓ の URL（2 件目）が useSearchParams に届く前に ↑・クリックが来る順にする
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.locator('button:visible', { hasText: '次の記事' }).click();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

    // URL と一覧の選択が、同時に 2 件目を指す
    await expect
      .poll(async () => ({
        article: articleParam(page),
        active: await box.getAttribute('aria-activedescendant'),
      }))
      .toEqual({ article: secondId, active: `reader-article-${secondId}` });
    await expect(
      page
        .getByRole('region', { name: '記事詳細' })
        .getByRole('heading', { level: 2 })
    ).toHaveText(secondTitle);
  });

  test('記事を選んだ後にヘッダーの「リーダー」を押すと、一覧の選択も先頭に戻る', async ({
    page,
  }) => {
    await openReader(page);
    const box = listbox(page);
    await box.focus();
    const firstId = await articleIdOf(page, 0);
    const thirdId = await articleIdOf(page, 2);
    const firstTitle = await options(page)
      .nth(0)
      .locator('p')
      .first()
      .innerText();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => articleParam(page)).toBe(thirdId);

    // Next の router 遷移（URL は commit のときに書かれる）
    await page
      .locator('header')
      .getByRole('link', { name: 'リーダー', exact: true })
      .click();
    await expect.poll(() => articleParam(page)).toBeNull();
    await expect(box).toHaveAttribute(
      'aria-activedescendant',
      `reader-article-${firstId}`
    );
    await expect(
      page
        .getByRole('region', { name: '記事詳細' })
        .getByRole('heading', { level: 2 })
    ).toHaveText(firstTitle);
  });

  test('本文の「次の記事」で選択が変わっても、フォーカスは押したボタンに残る', async ({
    page,
  }) => {
    await openReader(page);
    const secondId = await articleIdOf(page, 1);
    const next = page.locator('button:visible', { hasText: '次の記事' });
    await next.click();

    await expect.poll(() => articleParam(page)).toBe(secondId);
    await expect(listbox(page)).toHaveAttribute(
      'aria-activedescendant',
      `reader-article-${secondId}`
    );
    await expect(next).toBeFocused();
  });

  test('深いリンクで開いた記事が一覧に無いときは、選んでいる行を無しにし、↓で先頭を選ぶ', async ({
    page,
  }) => {
    await page.route(DETAIL_API, (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: '記事が見つかりません' }),
      })
    );
    await openReader(page, '/reader?article=__missing_article__');
    const box = listbox(page);
    await expect(box).not.toHaveAttribute('aria-activedescendant');
    await expect(
      page.locator('[role="option"][aria-selected="true"]')
    ).toHaveCount(0);

    await box.focus();
    await page.keyboard.press('ArrowDown');
    const firstId = await articleIdOf(page, 0);
    await expect(box).toHaveAttribute(
      'aria-activedescendant',
      `reader-article-${firstId}`
    );
  });
});

test.describe('リーダーのキーボード操作（md 未満の1ペイン）', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('矢印は選ぶだけで、Enter で開いて本文の領域へ。戻ると直前の行へフォーカスを戻す', async ({
    page,
  }) => {
    await openReader(page);
    const box = listbox(page);
    await box.focus();
    const secondId = await articleIdOf(page, 1);
    // 本文を開くと一覧は隠れて role で探せなくなるので、先に読んでおく
    const thirdId = await articleIdOf(page, 2);

    await page.keyboard.press('ArrowDown');
    await expect(box).toHaveAttribute(
      'aria-activedescendant',
      `reader-article-${secondId}`
    );
    // 開いていない（一覧のまま）
    expect(articleParam(page)).toBeNull();
    await expect(box).toBeVisible();

    await page.keyboard.press('Enter');
    await expect.poll(() => articleParam(page)).toBe(secondId);
    const region = page.getByRole('region', { name: '記事詳細' });
    await expect(region).toBeFocused();

    // 本文の領域がスクロールするので、そのままキーボードで読み進められる。
    // 本文が短くても領域からはみ出すよう、画面の高さを一時的に縮める
    await expect(region.getByRole('heading', { level: 2 })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 360 });
    await expect
      .poll(() => region.evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeGreaterThan(0);
    await expect(region).toBeFocused();
    const scrollTopBefore = await region.evaluate((el) => el.scrollTop);
    await page.keyboard.press('PageDown');
    await expect
      .poll(() => region.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(scrollTopBefore);
    await page.setViewportSize({ width: 390, height: 844 });

    // 本文の「次の記事」で替えても、フォーカスは押したボタンに残る
    const next = page.getByTestId('reader-mobile-next');
    await next.click();
    await expect.poll(() => articleParam(page)).toBe(thirdId);
    await expect(next).toBeFocused();

    // 一覧に戻ると、最後に開いていた記事の行を指した listbox にフォーカスが戻る
    await page.getByTestId('reader-back-to-list').click();
    await expect.poll(() => articleParam(page)).toBeNull();
    await expect(box).toBeFocused();
    await expect(box).toHaveAttribute(
      'aria-activedescendant',
      `reader-article-${thirdId}`
    );
    await expect(options(page).nth(2)).toBeInViewport();
  });

  test('一覧で選んだ後に画面を広げると、一覧の選択は本文の記事に戻る', async ({
    page,
  }) => {
    await openReader(page);
    const box = listbox(page);
    await box.focus();
    const firstId = await articleIdOf(page, 0);
    const thirdId = await articleIdOf(page, 2);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(box).toHaveAttribute(
      'aria-activedescendant',
      `reader-article-${thirdId}`
    );

    // 2 ペインでは本文は先頭の記事（開いていない）なので、一覧もそれを指す
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(box).toHaveAttribute(
      'aria-activedescendant',
      `reader-article-${firstId}`
    );
  });

  test('末尾の記事で「次の記事」を押し、次ページの読み込み中に一覧へ戻ると、読み込み後に記事を開き直さない', async ({
    page,
  }) => {
    await openReader(page);
    const count = await options(page).count();
    const lastId = await articleIdOf(page, count - 1);

    // 2 ページ目の取得を保留する
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const isSecondPage = (url: string) =>
      url.includes('/api/articles/list') &&
      new URL(url).searchParams.get('page') === '2';
    await page.route(
      (url) => isSecondPage(url.toString()),
      async (route) => {
        await held;
        await route.continue();
      }
    );

    // md 未満で記事を開くと一覧は隠れるので、本文の見出しを待つ
    await page.goto(`/reader?article=${lastId}`);
    await expect(
      page
        .getByRole('region', { name: '記事詳細' })
        .getByRole('heading', { level: 2 })
    ).toBeVisible();
    await page.getByTestId('reader-mobile-next').click();
    await page.getByTestId('reader-back-to-list').click();
    await expect.poll(() => articleParam(page)).toBeNull();

    const secondPage = page.waitForResponse((response) =>
      isSecondPage(response.url())
    );
    release();
    await secondPage;
    // 2 ページ目が一覧に描かれた後も、記事を開き直さない（URL に article が戻らない）
    await expect
      .poll(() => options(page).count(), { timeout: 10000 })
      .toBeGreaterThan(count);
    expect(articleParam(page)).toBeNull();
    await expect(listbox(page)).toBeVisible();
  });

  test('本文の取得が遅くても失敗しても、開いたら本文の領域へフォーカスを移す', async ({
    page,
  }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let mode: 'slow' | 'fail' = 'slow';
    await page.route(DETAIL_API, async (route) => {
      if (mode === 'fail') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: '記事の取得に失敗しました',
          }),
        });
        return;
      }
      await held;
      await route.continue();
    });

    await openReader(page);
    const box = listbox(page);
    const region = page.getByRole('region', { name: '記事詳細' });

    // 遅い: 読み込み中のまま本文の領域へ移る
    await box.focus();
    await page.keyboard.press('Enter');
    await expect(region).toBeFocused();
    release();
    await expect(region.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(region).toBeFocused();

    // 失敗: 失敗の表示のまま本文の領域へ移る
    await page.getByTestId('reader-back-to-list').click();
    await expect(box).toBeFocused();
    mode = 'fail';
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(region).toBeFocused();
    // React Query は失敗を 1 回だけ取り直してから失敗にする（app/providers/query-provider.tsx の retry: 1）
    await expect(region.getByText('記事の取得に失敗しました')).toBeVisible({
      timeout: 10000,
    });
  });
});
