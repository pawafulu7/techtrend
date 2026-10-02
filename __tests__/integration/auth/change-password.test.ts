/**
 * changePassword の結合テスト（実 DB、#666）
 *
 * モックの単体テストでは、session.deleteMany の条件が実際に操作中のセッションだけを
 * 残すことや、トランザクションでの更新を証明できないため、実 DB で確かめる。
 * 実行: npm run test:integration:docker
 */
import { prisma } from '@/lib/prisma';
import { changePassword, hashPassword, verifyPassword } from '@/lib/auth/utils';
import { CREDENTIAL_PROVIDER_ID } from '@/lib/auth/constants';

const RUN_ID = `it-666-${Date.now()}`;
const EMAIL = `${RUN_ID}@example.test`;
const OLD_PASSWORD = 'OldPassword1';
const NEW_PASSWORD = 'NewPassword1';
const TOKENS = [`${RUN_ID}-current`, `${RUN_ID}-other-1`, `${RUN_ID}-other-2`];

let userId: string;

async function sessionTokens(): Promise<string[]> {
  const sessions = await prisma.session.findMany({
    where: { userId },
    select: { token: true },
    orderBy: { token: 'asc' },
  });
  return sessions.map((s) => s.token);
}

async function storedHash(): Promise<string> {
  const account = await prisma.account.findFirstOrThrow({
    where: { userId, providerId: CREDENTIAL_PROVIDER_ID },
  });
  return account.password ?? '';
}

describe('changePassword (integration, #666)', () => {
  beforeEach(async () => {
    const user = await prisma.user.create({
      data: { email: EMAIL, name: 'Integration 666' },
    });
    userId = user.id;
    await prisma.account.create({
      data: {
        userId,
        providerId: CREDENTIAL_PROVIDER_ID,
        accountId: userId,
        password: await hashPassword(OLD_PASSWORD),
      },
    });
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.session.createMany({
      data: TOKENS.map((token) => ({ userId, token, expiresAt })),
    });
  });

  afterEach(async () => {
    // Account・Session は User の削除で CASCADE される
    await prisma.user.deleteMany({ where: { email: EMAIL } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('keeps only the current session and replaces the hash', async () => {
    const revoked = await changePassword(
      userId,
      OLD_PASSWORD,
      NEW_PASSWORD,
      TOKENS[0]
    );

    expect(revoked).toBe(2);
    expect(await sessionTokens()).toEqual([TOKENS[0]]);
    const hash = await storedHash();
    expect(await verifyPassword(NEW_PASSWORD, hash)).toBe(true);
    expect(await verifyPassword(OLD_PASSWORD, hash)).toBe(false);
  });

  it('does not touch other users sessions', async () => {
    const other = await prisma.user.create({
      data: { email: `${RUN_ID}-other@example.test` },
    });
    try {
      await prisma.session.create({
        data: {
          userId: other.id,
          token: `${RUN_ID}-other-user`,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      await changePassword(userId, OLD_PASSWORD, NEW_PASSWORD, TOKENS[0]);

      const otherSessions = await prisma.session.count({
        where: { userId: other.id },
      });
      expect(otherSessions).toBe(1);
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });

  it('rolls back the password update when the current session was revoked meanwhile', async () => {
    const before = await storedHash();
    // 認証の後に、別の要求で操作中のセッションが失効した状態
    await prisma.session.delete({ where: { token: TOKENS[0] } });

    await expect(
      changePassword(userId, OLD_PASSWORD, NEW_PASSWORD, TOKENS[0])
    ).rejects.toThrow('Session is no longer valid');

    // パスワードの更新はセッションの確認より前に実行されているので、ハッシュが
    // 元のままならトランザクションが取り消されたことになる
    expect(await storedHash()).toBe(before);
    expect(await sessionTokens()).toEqual([TOKENS[1], TOKENS[2]].sort());
  });

  it('rejects an expired current session', async () => {
    const before = await storedHash();
    await prisma.session.update({
      where: { token: TOKENS[0] },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      changePassword(userId, OLD_PASSWORD, NEW_PASSWORD, TOKENS[0])
    ).rejects.toThrow('Session is no longer valid');

    expect(await storedHash()).toBe(before);
  });

  it('keeps all sessions and the hash when the current password is wrong', async () => {
    const before = await storedHash();

    await expect(
      changePassword(userId, 'WrongPassword1', NEW_PASSWORD, TOKENS[0])
    ).rejects.toThrow('Invalid current password');

    expect(await sessionTokens()).toEqual([...TOKENS].sort());
    expect(await storedHash()).toBe(before);
  });
});
