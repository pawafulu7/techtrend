import { test, expect, type Page } from '@playwright/test';
import { TIMEOUTS } from '../../../e2e/helpers/wait-utils';
import { loginAsAdmin } from '../utils/e2e-helpers';

/**
 * 問い合わせ窓口: ヘッダーから送る → 管理画面で確かめて対応状況を変える
 *
 * 送信 API は IP 単位で 5件/時に制限している。ローカルの e2e は起動中の開発サーバーに
 * 向けて流れ、制限を Redis で数えるので、流し直しても当たらないよう送信ごとに
 * x-forwarded-for を変える（203.0.113.0/24 は文書用のアドレス）
 */
function testIp(): string {
  return `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
}

function uniqueMessage(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function useFreshIp(page: Page) {
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': testIp() });
}

test.describe('問い合わせ窓口', () => {
  test('未ログインでヘッダーから開いて送ると、完了表示になる', async ({ page }) => {
    await useFreshIp(page);
    await page.goto('/');

    await page.getByTestId('header-contact-link').click();
    await expect(page).toHaveURL(/\/contact$/, { timeout: TIMEOUTS.medium });
    await expect(page.getByRole('heading', { name: 'お問い合わせ' })).toBeVisible();

    await page.getByRole('radio', { name: '不具合の報告' }).click();
    await page
      .getByRole('textbox', { name: '内容' })
      .fill(uniqueMessage('anonymous'));
    await page.getByRole('button', { name: '送信する' }).click();

    await expect(
      page.getByRole('heading', { name: '送信しました' })
    ).toBeVisible({ timeout: TIMEOUTS.medium });
  });

  test('種別を選ばずに送ると、送らずにエラーを出す', async ({ page }) => {
    await useFreshIp(page);
    await page.goto('/contact');

    await page.getByRole('textbox', { name: '内容' }).fill('種別なし');
    await page.getByRole('button', { name: '送信する' }).click();

    await expect(page.getByText('種別を選んでください')).toBeVisible();
    await expect(page.getByRole('radio', { name: '機能の要望' })).toBeFocused();
  });

  test('管理者は一覧で見つけて、対応状況を「完了」に変えられる', async ({
    page,
  }) => {
    const message = uniqueMessage('admin');

    // 一覧に出す問い合わせを API から入れる（同一オリジンの送信として Origin を付ける）
    const baseURL = test.info().project.use.baseURL ?? 'http://localhost:3000';
    const created = await page.request.post('/api/inquiries', {
      data: { category: 'FEATURE_REQUEST', message },
      headers: { Origin: new URL(baseURL).origin, 'x-forwarded-for': testIp() },
    });
    expect(created.status()).toBe(201);

    const loggedIn = await loginAsAdmin(page);
    if (!loggedIn) {
      test.skip(true, 'Admin login/setup unavailable');
      return;
    }

    await page.goto('/admin/inquiries');
    const row = page.getByTestId('inquiry-row').filter({ hasText: message });
    await expect(row).toBeVisible({ timeout: TIMEOUTS.medium });
    await expect(row).toContainText('未対応');

    await row.getByRole('button').click();
    const dialog = page.getByTestId('inquiry-detail-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(message);

    await dialog.getByRole('button', { name: '完了' }).click();
    await expect(dialog.getByRole('button', { name: '完了' })).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: TIMEOUTS.medium }
    );

    // 既定の絞り込みは「未対応」なので、完了にした行は一覧から消える
    await expect(row).toHaveCount(0, { timeout: TIMEOUTS.medium });

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();

    await page.getByTestId('inquiry-filter-RESOLVED').click();
    await expect(
      page.getByTestId('inquiry-row').filter({ hasText: message })
    ).toBeVisible({ timeout: TIMEOUTS.medium });
  });

  test('未ログインでは管理 API を 401 にする', async ({ request }) => {
    const response = await request.get('/api/admin/inquiries');

    expect(response.status()).toBe(401);
  });
});
