import { test, expect } from '@playwright/test';
import { TIMEOUTS } from '../helpers/wait-utils';
import { loginAsAdmin } from '../utils/e2e-helpers';

/**
 * 管理画面の「サイトに入れるアカウント」: Gmail アドレスを追加して、確認してから削除する
 *
 * e2e の環境は入口（Google ログイン）が無効で、固定のアドレスも設定しない。Google を通す入口の確かめは
 * __tests__/e2e/site-gate-auth.spec.ts（本物の Better Auth の結合テスト）で行う。
 * 実行ごとに一意なアドレスを使い、最後に画面から削除する（前回の行が残ると、一意制約で追加が 409 になるため）。
 */
function uniqueGmail(): string {
  // 英小文字と数字だけ（保存される形と同じにし、表示を比べやすくする）
  return `e2egate${Date.now()}${Math.random().toString(36).slice(2, 8)}@gmail.com`;
}

test.describe('サイトに入れるアカウント', () => {
  test('管理者は Gmail アドレスを追加し、確認してから削除できる', async ({ page }) => {
    const email = uniqueGmail();
    // 管理者は e2e の global setup（setupAdminUser）が作る。ログインできなければ黙って飛ばさず落とす
    expect(await loginAsAdmin(page)).toBe(true);

    await page.goto('/admin/gate-access');
    await expect(
      page.getByRole('heading', { name: 'サイトに入れるアカウント' })
    ).toBeVisible({ timeout: TIMEOUTS.medium });
    await expect(page.getByTestId('gate-disabled-note')).toBeVisible();

    const input = page.getByLabel('Gmail アドレス');
    await expect(input).toBeEnabled({ timeout: TIMEOUTS.medium });

    // Gmail 以外は送らずに止める
    await input.fill('someone@example.com');
    await page.getByRole('button', { name: '追加', exact: true }).click();
    await expect(page.getByTestId('gate-email-error')).toHaveText(
      '@gmail.com のアドレスを入力してください'
    );

    // 大文字で入れても、正規化した形で一覧に出る
    await input.fill(email.toUpperCase());
    await page.getByRole('button', { name: '追加', exact: true }).click();
    const row = page.getByTestId('gate-email-row').filter({ hasText: email });
    await expect(row).toBeVisible({ timeout: TIMEOUTS.medium });
    await expect(input).toHaveValue('');

    // 同じアドレスをもう一度足すと、入力の誤りとして出す
    await input.fill(email);
    await page.getByRole('button', { name: '追加', exact: true }).click();
    await expect(page.getByTestId('gate-email-error')).toHaveText(
      'このアドレスはすでに一覧にあります',
      { timeout: TIMEOUTS.medium }
    );
    await expect(input).toHaveAttribute('aria-invalid', 'true');

    // 削除は確認のダイアログを通す
    await row.getByRole('button', { name: `${email} を削除` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(`${email} を一覧から削除します`);
    await dialog.getByRole('button', { name: '削除する' }).click();

    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.medium });
    await expect(row).toHaveCount(0, { timeout: TIMEOUTS.medium });
  });

  test('管理画面のメニューから開ける', async ({ page }) => {
    expect(await loginAsAdmin(page)).toBe(true);
    await page.goto('/admin');

    await page.getByRole('link', { name: 'サイトに入れるアカウント' }).click();
    await expect(page).toHaveURL(/\/admin\/gate-access$/, { timeout: TIMEOUTS.medium });
  });

  test('未ログインでは管理 API を 401 にする', async ({ request }) => {
    const list = await request.get('/api/admin/gate-allowlist');
    expect(list.status()).toBe(401);
  });

  test('入口が無効な環境では、入口の経路は 404 になる', async ({ request }) => {
    for (const path of ['/api/gate/start', '/api/gate/callback/google', '/api/gate/error']) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(404);
    }
  });
});
