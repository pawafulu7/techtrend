/**
 * better-auth に渡す設定の不変条件（#666）
 *
 * パスワード変更で他のセッションを失効させる処理（lib/auth/utils.ts の changePassword）は、
 * Prisma で Session の行を消す。次の前提が崩れると、失効が効かなくなるか、
 * 失効しない別経路ができる。設定を変えたときにここで止める。
 *
 * better-auth は ESM のみで Jest では読み込めないため、betterAuth() をモックして
 * auth.ts が渡す設定オブジェクトを捕まえて確かめる（生成後の auth.options ではない）。
 * disabledPaths が実際に HTTP で効くことは E2E（__tests__/e2e/auth-disabled-paths.spec.ts）で確かめる。
 */
import type { BetterAuthOptions } from 'better-auth';

// jest.setup.node.js が auth を全テストでモックしている。ここでは本物の auth.ts を読む
jest.unmock('@/lib/auth/auth');

const mockBetterAuth = jest.fn((options: BetterAuthOptions) => ({
  options,
  api: {},
  handler: jest.fn(),
}));

jest.mock('better-auth', () => ({
  betterAuth: (options: BetterAuthOptions) => mockBetterAuth(options),
}));
jest.mock('better-auth/plugins', () => ({
  admin: jest.fn(() => ({ id: 'admin' })),
}));
jest.mock('@better-auth/prisma-adapter', () => ({
  prismaAdapter: jest.fn(() => ({})),
}));

function loadOptions(): BetterAuthOptions {
  jest.isolateModules(() => {
    require('../auth');
  });
  expect(mockBetterAuth).toHaveBeenCalledTimes(1);
  return mockBetterAuth.mock.calls[0][0];
}

describe('auth config invariants (#666)', () => {
  let options: BetterAuthOptions;

  beforeAll(() => {
    options = loadOptions();
  });

  it('keeps sessions only in the DB so that deleting Session rows revokes them', () => {
    // secondaryStorage があると、セッションは既定で DB に入らず Prisma の削除が効かない
    expect(options.secondaryStorage).toBeUndefined();
    // cookieCache が有効だと、消したセッションが Cookie の有効期限まで通る
    expect(options.session?.cookieCache?.enabled).not.toBe(true);
  });

  it('revokes sessions on password reset whenever password reset is enabled', () => {
    const emailAndPassword = options.emailAndPassword;
    // sendResetPassword を設定するとリセットが使えるようになるが、
    // revokeSessionsOnPasswordReset の既定は false で #666 が再発する
    const resetEnabled = Boolean(emailAndPassword?.sendResetPassword);
    expect(
      !resetEnabled || emailAndPassword?.revokeSessionsOnPasswordReset === true
    ).toBe(true);
  });

  it('uses only the admin plugin', () => {
    // プラグイン（emailOTP・phoneNumber など）を足すと、セッションを失効させない
    // パスワードの変更・リセットの経路が増えることがある。足すときに、その経路を
    // disabledPaths や失効の設定で塞いだかを見直させるため、一覧を固定する
    const ids = (options.plugins ?? []).map((plugin) => plugin.id);
    expect(ids).toEqual(['admin']);
  });

  it('disables the built-in endpoints that change the password without revoking sessions', () => {
    expect(options.disabledPaths).toEqual(
      expect.arrayContaining(['/change-password', '/admin/set-user-password'])
    );
  });
});

describe('email verification on sign-up (#832)', () => {
  let options: BetterAuthOptions;

  beforeAll(() => {
    mockBetterAuth.mockClear();
    options = loadOptions();
  });

  it('keeps users signed out until they verify the email and sign in with the password', () => {
    // 登録フォーム（components/auth/*SignupForm.tsx）は、登録後にログインしない前提で
    // 「確認メールを送信しました」を出す
    expect(options.emailAndPassword?.requireEmailVerification).toBe(true);
    expect(options.emailVerification?.sendOnSignUp).toBe(true);
    // 確認リンクで自動ログインすると、先に他人が登録したアカウントに本人が入ってしまう
    expect(options.emailVerification?.autoSignInAfterVerification).toBe(false);
  });

  it('answers sign-up for an existing email with the same user shape as a new user', () => {
    // 新規作成では admin プラグインが role などを入れる。偽の応答に無いと null になり、
    // 登録済みかどうかが応答から分かる
    const synthetic = options.emailAndPassword?.customSyntheticUser?.({
      coreFields: {
        name: '',
        email: 'existing@example.com',
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      additionalFields: { personalizationPeriodMonths: 12 },
      id: 'synthetic-id',
    });

    expect(synthetic).toMatchObject({
      role: 'user',
      banned: false,
      banReason: null,
      banExpires: null,
      personalizationPeriodMonths: 12,
      id: 'synthetic-id',
    });
  });

  it('keeps the verification link valid for 24 hours as the email says', () => {
    // メール本文（buildVerificationEmailHtml）と画面に「24時間有効」と書いている
    expect(options.emailVerification?.expiresIn).toBe(24 * 60 * 60);
  });
});
