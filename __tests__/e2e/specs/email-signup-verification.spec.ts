/**
 * メールアドレスでの新規登録 → 確認メールのリンク → ログイン（#832）
 *
 * 登録フォームは Better Auth の /api/auth/sign-up/email を呼ぶ。メールアドレスの確認が
 * 済むまでログインできない。確認リンク（/api/auth/verify-email）を開くと確認済みになって
 * /auth/verify に戻り、その後パスワードでログインする（lib/auth/auth.ts の
 * requireEmailVerification・autoSignInAfterVerification）。
 *
 * e2e では確認メールを送らない（docker-compose.test.yml の SKIP_EMAIL_SEND）。そのため
 * リンクのトークンは、Better Auth と同じ形（HS256 の JWT。payload は email）で
 * テスト用の AUTH_SECRET から作る。
 */
import { test, expect, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { TIMEOUTS } from '../../../e2e/helpers/wait-utils';

const PASSWORD = 'Signup832!Pass';
const VERIFY_CALLBACK_URL = '/auth/verify?success=true';

function createVerificationToken(
  email: string,
  expiresInSeconds: number
): string {
  // lib/config/env.ts と同じく AUTH_SECRET を優先する
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set for e2e');
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256' });
  const payload = encode({
    email: email.toLowerCase(),
    iat: now,
    exp: now + expiresInSeconds,
  });
  const signature = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function verificationLink(token: string): string {
  const params = new URLSearchParams({
    token,
    callbackURL: VERIFY_CALLBACK_URL,
  });
  return `/api/auth/verify-email?${params.toString()}`;
}

async function logIn(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード').fill(PASSWORD);
  await page.getByRole('button', { name: 'ログイン' }).click();
}

async function signUpWithEmailTab(page: Page, email: string) {
  await page.goto('/auth/signup');
  // 既定のタブは「メールで登録」
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード', { exact: true }).fill(PASSWORD);
  await page.getByLabel('パスワード（確認）').fill(PASSWORD);
  await page.getByRole('button', { name: 'アカウント作成' }).click();
  await expect(page.getByText('確認メールを送信しました！')).toBeVisible({
    timeout: TIMEOUTS.medium,
  });
}

async function getSessionUser(page: Page) {
  const response = await page.request.get('/api/auth/get-session');
  expect(response.ok()).toBe(true);
  const body = await response.json();
  return body?.user ?? null;
}

test.describe('メールアドレスでの新規登録（#832）', () => {
  test('登録後は確認が済むまでログインできず、確認リンクを開いた後にパスワードでログインできる', async ({
    page,
  }) => {
    const email = `signup-832-${Date.now()}@example.com`;

    await signUpWithEmailTab(page, email);
    expect(await getSessionUser(page)).toBeNull();

    // 確認前のログインは、未確認の案内を出して止まる
    await logIn(page, email);
    await expect(
      page.getByText(/メールアドレスの確認が済んでいません/)
    ).toBeVisible({ timeout: TIMEOUTS.medium });
    await expect(page).toHaveURL(/\/auth\/login/);
    expect(await getSessionUser(page)).toBeNull();

    // 確認メールのリンクを開く。確認済みになるが、ログインはしない
    await page.goto(verificationLink(createVerificationToken(email, 60 * 60)));
    await expect(page).toHaveURL(/\/auth\/verify\?success=true$/);
    await expect(
      page.getByRole('heading', { level: 1, name: '確認完了！' })
    ).toBeVisible({ timeout: TIMEOUTS.medium });
    expect(await getSessionUser(page)).toBeNull();

    // パスワードでログインできる
    await logIn(page, email);
    await expect(page).toHaveURL(/\/$/, { timeout: TIMEOUTS.medium });
    const user = await getSessionUser(page);
    expect(user?.email).toBe(email);
    expect(user?.emailVerified).toBe(true);
  });

  test('期限切れのリンクは期限切れの表示になり、ログインしない', async ({
    page,
  }) => {
    const email = `signup-832-expired-${Date.now()}@example.com`;

    await signUpWithEmailTab(page, email);

    await page.goto(verificationLink(createVerificationToken(email, -60)));
    await expect(page).toHaveURL(/error=TOKEN_EXPIRED/);
    await expect(
      page.getByRole('heading', { level: 1, name: '期限切れ' })
    ).toBeVisible({ timeout: TIMEOUTS.medium });
    await expect(
      page.getByRole('link', { name: 'ログインして確認メールを再送信' })
    ).toBeVisible();
    expect(await getSessionUser(page)).toBeNull();
  });
});
