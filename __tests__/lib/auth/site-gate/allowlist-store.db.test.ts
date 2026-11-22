/**
 * 許可リストへの追加（lib/auth/site-gate/allowlist-store.ts）を、マイグレーションを適用したテスト DB で確かめる。
 * 残り 1 件のときに別のアドレスの追加が同時に来ても、1 件だけが入って上限を超えないこと。
 *
 * 行はこのテストの接頭辞で作って消し、ほかの行は消さない（件数はほかの行を差し引いて埋める）。同じ表には
 * e2e の specs/gate-access.spec.ts も画面から行を足して消し、prisma/seed-test.ts は全件を消す
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';
import type { PrismaClient } from '@/lib/prisma-exports';
import {
  GATE_ALLOWLIST_ADD_LOCK_KEY,
  addGateAllowedEmail,
  type AddedGateAllowedEmail,
} from '@/lib/auth/site-gate/allowlist-store';
import { GATE_ALLOWLIST_MAX_ENTRIES } from '@/lib/auth/site-gate/constants';

// 実 DB の PrismaClient は jest.requireActual で取る（interest-scores.db.test.ts と同じ）
const { PrismaClient: RealPrismaClient } = jest.requireActual(
  '@/lib/prisma-exports'
);
const { PrismaPg } = jest.requireActual('@prisma/adapter-pg');

const DB_URL = process.env.DATABASE_URL;
// 書き込むので、DB 名が _test で終わるときだけ走らせる（開発 DB に行を残さないため）
const isTestDatabase = (url: string | undefined): boolean => {
  if (!url) return false;
  try {
    return /_test$/.test(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return false;
  }
};
const describeIf = isTestDatabase(DB_URL) ? describe : describe.skip;

const PREFIX = 'gatelocktest';
const address = (label: string) => `${PREFIX}${label}@gmail.com`;

describeIf('addGateAllowedEmail（テスト DB）', () => {
  let prisma: PrismaClient;

  const removeTestRows = () =>
    prisma.gateAllowedEmail.deleteMany({
      where: { email: { startsWith: PREFIX } },
    });

  const add = (label: string, fixedEmails: readonly string[] = []) =>
    addGateAllowedEmail(prisma, {
      email: address(label),
      createdById: null,
      fixedEmails,
    });

  /** アドバイザリロックを待っている接続の数。最大 3 秒、expected 以上になるのを待つ */
  const waitForAdvisoryLockWaiters = async (
    expected: number
  ): Promise<number> => {
    let count = 0;
    for (let i = 0; i < 30; i++) {
      const rows = await prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND wait_event = 'advisory'
      `;
      count = rows[0].count;
      if (count >= expected) return count;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return count;
  };

  beforeAll(async () => {
    prisma = new RealPrismaClient({
      adapter: new PrismaPg({ connectionString: DB_URL! }),
    });
    await prisma.$connect();
  });

  // 残り 1 件まで埋める（ほかの行があればその分を差し引く）
  beforeEach(async () => {
    await removeTestRows();
    const others = await prisma.gateAllowedEmail.count();
    const missing = GATE_ALLOWLIST_MAX_ENTRIES - 1 - others;
    expect(missing).toBeGreaterThanOrEqual(0);
    await prisma.gateAllowedEmail.createMany({
      data: Array.from({ length: missing }, (_, i) => ({
        email: address(`fill${i}`),
      })),
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await removeTestRows();
    await prisma.$disconnect();
  });

  it('残り 1 件のときに別のアドレスを順に足すと、1 件目だけが入る', async () => {
    expect((await add('a'))?.email).toBe(address('a'));
    await expect(add('b')).resolves.toBeNull();
    expect(await prisma.gateAllowedEmail.count()).toBe(
      GATE_ALLOWLIST_MAX_ENTRIES
    );
  });

  it('残り 1 件のときに別のアドレスの追加が同時に来ても、1 件だけが入って上限を超えない', async () => {
    let adds: Promise<(AddedGateAllowedEmail | null)[]> | undefined;
    // 先にロックを持っておき、2 つの追加がどちらもロックの前で待つ状態を作ってから放す。
    // ロックが無い・件数を読む時点が早すぎる（REPEATABLE READ など）と、どちらも 99 件と読んで 2 件とも入る
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${GATE_ALLOWLIST_ADD_LOCK_KEY})`;
        adds = Promise.all([add('a'), add('b')]);
        expect(await waitForAdvisoryLockWaiters(2)).toBeGreaterThanOrEqual(2);
      },
      { timeout: 10_000 }
    );

    const results = await adds!;
    expect(results.filter((entry) => entry !== null)).toHaveLength(1);
    expect(await prisma.gateAllowedEmail.count()).toBe(
      GATE_ALLOWLIST_MAX_ENTRIES
    );
    // ロック待ちを数える間（最大 3 秒）とトランザクションの分を見込む
  }, 15_000);

  it('設定で固定したアドレスと重なる行は数えない', async () => {
    // 最後の 1 件を固定のアドレスで埋める。固定の分を数えなければ、まだ 1 件足せる
    const fixed = address('fixed');
    await prisma.gateAllowedEmail.create({ data: { email: fixed } });

    await expect(add('a', [fixed])).resolves.not.toBeNull();
    await expect(add('b', [fixed])).resolves.toBeNull();
  });
});
