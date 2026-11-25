import { test, expect } from '@playwright/test';
import pg from 'pg';
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

/**
 * 利用の申請を DB に直接置く。申請は入口の拒否のページから届くが、e2e の環境は入口が無効で送れないため
 * （送信の側は __tests__/api/gate/gate-request.test.ts と、本物の DB の allowlist-store.db.test.ts で確かめる）
 */
async function withDb<T>(run: (db: pg.Client) => Promise<T>): Promise<T> {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL か DATABASE_URL を設定してください');
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    return await run(db);
  } finally {
    await db.end();
  }
}

async function seedAccessRequest(email: string, note: string | null): Promise<void> {
  await withDb((db) =>
    db.query(
      `INSERT INTO "GateAccessRequest" (id, email, note, "updatedAt") VALUES ($1, $2, $3, now())`,
      [`e2e-${email}`, email, note]
    )
  );
}

async function removeGateRows(emails: string[]): Promise<void> {
  await withDb(async (db) => {
    await db.query(`DELETE FROM "GateAccessRequest" WHERE email = ANY($1)`, [emails]);
    await db.query(`DELETE FROM "GateAllowedEmail" WHERE email = ANY($1)`, [emails]);
  });
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

  test('届いた利用の申請を、管理者が許可・却下できる（自動では許可されない）', async ({ page }) => {
    const approved = uniqueGmail();
    const rejected = uniqueGmail();
    await seedAccessRequest(approved, '鈴木です。\n<b>紹介</b>で来ました。');
    await seedAccessRequest(rejected, null);
    try {
      expect(await loginAsAdmin(page)).toBe(true);
      await page.goto('/admin/gate-access');

      const section = page.getByTestId('gate-request-section');
      const approvedRow = section.getByTestId('gate-request-row').filter({ hasText: approved });
      const rejectedRow = section.getByTestId('gate-request-row').filter({ hasText: rejected });
      await expect(approvedRow).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(rejectedRow).toBeVisible();
      // 備考は文字としてだけ出す（HTML として解釈しない）
      await expect(approvedRow).toContainText('<b>紹介</b>で来ました。');
      // 申請しただけでは、許可リストに入らない
      await expect(page.getByTestId('gate-email-row').filter({ hasText: approved })).toHaveCount(0);
      // メニューに対応待ちの件数が出る（ほかの spec の行があっても 2 件以上）
      const navCount = page.getByTestId('gate-request-nav-count');
      await expect(navCount).toBeVisible();
      const before = Number((await navCount.innerText()).trim());
      expect(before).toBeGreaterThanOrEqual(2);

      // 許可すると、申請の一覧から消えて許可リストに入る
      await approvedRow.getByRole('button', { name: `${approved} を許可` }).click();
      await expect(approvedRow).toHaveCount(0, { timeout: TIMEOUTS.medium });
      await expect(
        page.getByTestId('gate-email-row').filter({ hasText: approved })
      ).toBeVisible({ timeout: TIMEOUTS.medium });

      // 却下は確認のダイアログを通す。許可リストには入らない
      await rejectedRow.getByRole('button', { name: `${rejected} の申請を却下` }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText(`${rejected} の申請を一覧から消します`);
      await dialog.getByRole('button', { name: '却下する' }).click();
      await expect(dialog).toBeHidden({ timeout: TIMEOUTS.medium });
      await expect(rejectedRow).toHaveCount(0, { timeout: TIMEOUTS.medium });
      await expect(page.getByTestId('gate-email-row').filter({ hasText: rejected })).toHaveCount(0);

      // メニューの件数も 2 件減る（0 件なら件数そのものを出さない）
      if (before === 2) {
        await expect(navCount).toHaveCount(0, { timeout: TIMEOUTS.medium });
      } else {
        await expect(navCount).toHaveText(String(before - 2), { timeout: TIMEOUTS.medium });
      }
    } finally {
      await removeGateRows([approved, rejected]);
    }
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
    const requests = await request.get('/api/admin/gate-requests');
    expect(requests.status()).toBe(401);
  });

  test('入口が無効な環境では、入口の経路は 404 になる', async ({ request, baseURL }) => {
    for (const path of ['/api/gate/start', '/api/gate/callback/google', '/api/gate/error']) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(404);
    }
    // 利用の申請の受け付けも閉じている。同じサイトからの送信として送る（Origin が無いと、Route Handler に
    // 届く前に proxy の CSRF の確認で 403 になる）
    const response = await request.post('/api/gate/request', {
      form: { note: 'x' },
      headers: { Origin: new URL(baseURL!).origin },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(404);
  });
});
