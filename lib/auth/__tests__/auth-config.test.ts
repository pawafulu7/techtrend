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

  it('disables the built-in endpoints that change the password without revoking sessions', () => {
    expect(options.disabledPaths).toEqual(
      expect.arrayContaining(['/change-password', '/admin/set-user-password'])
    );
  });
});
