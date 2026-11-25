/**
 * 許可リストへの追加（lib/auth/site-gate/allowlist-store.ts）を、マイグレーションを適用したテスト DB で確かめる。
 * 残り 1 件のときに別のアドレスの追加が同時に来ても、1 件だけが入って上限を超えないこと。
 * 利用の申請（GateAccessRequest）の保存（access-request-store.ts）と許可（approveGateAccessRequest）も、
 * 同じ DB で確かめる。
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
  approveGateAccessRequest,
  rejectGateAccessRequest,
  type AddedGateAllowedEmail,
} from '@/lib/auth/site-gate/allowlist-store';
import {
  hasGateAccessRequest,
  saveGateAccessRequest,
} from '@/lib/auth/site-gate/access-request-store';
import {
  GATE_ALLOWLIST_MAX_ENTRIES,
  GATE_REQUEST_MAX_PENDING,
} from '@/lib/auth/site-gate/constants';

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

  const removeTestRows = async () => {
    await prisma.gateAccessRequest.deleteMany({
      where: { email: { startsWith: PREFIX } },
    });
    await prisma.gateAllowedEmail.deleteMany({
      where: { email: { startsWith: PREFIX } },
    });
  };

  const requestOf = (label: string) =>
    prisma.gateAccessRequest.findUnique({ where: { email: address(label) } });
  const allowedOf = (label: string) =>
    prisma.gateAllowedEmail.findUnique({ where: { email: address(label) } });
  const approve = (requestId: string, fixedEmails: readonly string[] = []) =>
    approveGateAccessRequest(prisma, { requestId, approvedById: null, fixedEmails });
  const save = (
    label: string,
    note: string | null = null,
    fixedEmails: readonly string[] = [],
    ownAccount = true
  ) => saveGateAccessRequest(prisma, { email: address(label), note, fixedEmails, ownAccount });

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

  describe('利用の申請', () => {
    it('申請を保存し、同じアカウントの送り直しは備考だけを書き換える', async () => {
      await expect(hasGateAccessRequest(prisma, address('req'))).resolves.toBe(false);
      await expect(
        save('req', '最初の備考')
      ).resolves.toBe('saved');
      await expect(hasGateAccessRequest(prisma, address('req'))).resolves.toBe(true);
      // 送り直しで updatedAt が変わることを確かめるため、最初の行の時刻を過去にしておく
      const past = new Date('2026-01-01T00:00:00Z');
      await prisma.$executeRaw`UPDATE "GateAccessRequest" SET "createdAt" = ${past}, "updatedAt" = ${past} WHERE email = ${address('req')}`;
      const first = await requestOf('req');
      expect(first?.note).toBe('最初の備考');

      await expect(
        save('req', null)
      ).resolves.toBe('saved');
      const second = await requestOf('req');
      expect(second?.id).toBe(first?.id);
      expect(second?.note).toBeNull();
      expect(second?.createdAt).toEqual(past);
      expect(second!.updatedAt.getTime()).toBeGreaterThan(past.getTime());
      expect(
        await prisma.gateAccessRequest.count({ where: { email: { startsWith: PREFIX } } })
      ).toBe(1);
    });

    it('同じアカウントの申請が同時に届いても 1 件だけ残り、どちらも受け付けた扱いになる', async () => {
      const results = await Promise.all(
        ['一', '二', '三'].map((note) => save('same', note))
      );
      expect(results).toEqual(['saved', 'saved', 'saved']);
      expect(
        await prisma.gateAccessRequest.count({ where: { email: address('same') } })
      ).toBe(1);
    });

    it('正規化していないアドレスは CHECK 制約で入らない（500 文字の備考は入る）', async () => {
      await expect(
        prisma.gateAccessRequest.create({ data: { email: `${PREFIX}.dot@gmail.com` } })
      ).rejects.toThrow(/chk_gate_access_request_email_normalized/);
      await expect(
        prisma.gateAccessRequest.create({ data: { email: `${PREFIX}Upper@gmail.com` } })
      ).rejects.toThrow(/chk_gate_access_request_email_normalized/);
      await expect(
        save('long', 'あ'.repeat(500))
      ).resolves.toBe('saved');
    });

    it('許可すると許可リストに入り、申請は消える', async () => {
      await save('ok', 'よろしく');
      const request = await requestOf('ok');
      await expect(approve(request!.id)).resolves.toEqual({
        status: 'approved',
        email: address('ok'),
      });
      expect(await allowedOf('ok')).not.toBeNull();
      expect(await requestOf('ok')).toBeNull();
      // もう一度許可しようとしても、申請はもう無い
      await expect(approve(request!.id)).resolves.toEqual({ status: 'not_found' });
    });

    it('同じ申請の許可が同時に来ても、許可リストには 1 行だけ入る', async () => {
      await save('twice', null);
      const request = await requestOf('twice');
      const results = await Promise.all([approve(request!.id), approve(request!.id)]);
      expect(results.map((result) => result.status).sort()).toEqual(['approved', 'not_found']);
      expect(
        await prisma.gateAllowedEmail.count({ where: { email: address('twice') } })
      ).toBe(1);
    });

    it('すでに許可されているアドレス（一覧にある・設定で固定）の申請は置かない', async () => {
      await prisma.gateAllowedEmail.create({ data: { email: address('listedfirst') } });
      await expect(save('listedfirst', 'x')).resolves.toBe('already_allowed');
      expect(await requestOf('listedfirst')).toBeNull();

      await expect(save('fixedfirst', 'x', [address('fixedfirst')])).resolves.toBe(
        'already_allowed'
      );
      expect(await requestOf('fixedfirst')).toBeNull();
    });

    it('許可と送り直しが同時に来ても、許可済みのアカウントの申請は残らない', async () => {
      // ロックが無いと、送り直しが「未許可」と読んだあとに許可が終わり、申請が対応待ちに作り直される
      for (let round = 0; round < 5; round++) {
        const label = `resend${round}`;
        await save(label, '最初');
        const request = await requestOf(label);
        const [approved, resent] = await Promise.all([
          approve(request!.id),
          save(label, '送り直し'),
        ]);
        expect(approved.status).toBe('approved');
        // 送り直しが先なら備考の書き換え、あとなら「許可済み」
        expect(['saved', 'already_allowed']).toContain(resent);
        expect(await allowedOf(label)).not.toBeNull();
        expect(await requestOf(label)).toBeNull();
        // 許可リストを埋めないよう、次の回の前に消す（beforeEach は残り 1 件まで埋めている）
        await prisma.gateAllowedEmail.deleteMany({ where: { email: address(label) } });
      }
    });

    it('書き換えたアドレス（本人以外）の申請は、新しく置けるが、先に届いている申請は変えない', async () => {
      await expect(save('typed', '入力したアドレス', [], false)).resolves.toBe('saved');
      expect((await requestOf('typed'))?.note).toBe('入力したアドレス');

      await save('mine', '本人が書いた備考');
      await expect(save('mine', '他人が上書きしたい備考', [], false)).resolves.toBe('saved');
      expect((await requestOf('mine'))?.note).toBe('本人が書いた備考');
      await expect(save('mine', null, [], false)).resolves.toBe('saved');
      expect((await requestOf('mine'))?.note).toBe('本人が書いた備考');
      // 本人は、先に他人が置いた申請の備考も書き換えられる
      await expect(save('typed', '本人です')).resolves.toBe('saved');
      expect((await requestOf('typed'))?.note).toBe('本人です');
    });

    it('書き換えたアドレスでは、許可済みでも申請を置く（状態を答えない）。許可を押せば消えるだけ', async () => {
      await prisma.gateAllowedEmail.create({ data: { email: address('allowedtyped') } });
      await expect(save('allowedtyped', 'x', [], false)).resolves.toBe('saved');
      await expect(save('fixedtyped', 'x', [address('fixedtyped')], false)).resolves.toBe('saved');
      const listed = await requestOf('allowedtyped');
      const fixed = await requestOf('fixedtyped');
      expect(listed).not.toBeNull();
      expect(fixed).not.toBeNull();
      await expect(approve(listed!.id)).resolves.toMatchObject({ status: 'already_allowed' });
      await expect(approve(fixed!.id, [address('fixedtyped')])).resolves.toMatchObject({
        status: 'already_allowed',
      });
      expect(await requestOf('allowedtyped')).toBeNull();
      expect(await requestOf('fixedtyped')).toBeNull();
    });

    it('対応待ちが満杯のとき、書き換えたアドレスは許可済み・申請済み・未登録のどれでも同じ結果になる', async () => {
      await prisma.gateAllowedEmail.create({ data: { email: address('fullallowed') } });
      await save('fullpending', '先に届いた申請');
      const others = await prisma.gateAccessRequest.count();
      await prisma.gateAccessRequest.createMany({
        data: Array.from({ length: GATE_REQUEST_MAX_PENDING - others }, (_, i) => ({
          email: address(`fillreq${i}`),
        })),
      });
      expect(await prisma.gateAccessRequest.count()).toBe(GATE_REQUEST_MAX_PENDING);

      const results = await Promise.all([
        save('fullallowed', 'x', [], false),
        save('fullpending', 'x', [], false),
        save('fullunknown', 'x', [], false),
        save('fullfixed', 'x', [address('fullfixed')], false),
      ]);
      expect(results).toEqual(['full', 'full', 'full', 'full']);
      expect(await prisma.gateAccessRequest.count()).toBe(GATE_REQUEST_MAX_PENDING);
      expect((await requestOf('fullpending'))?.note).toBe('先に届いた申請');
      // 本人の送り直しは、満杯でも備考を書き換えられる
      await expect(save('fullpending', '本人の送り直し')).resolves.toBe('saved');
    });

    it('却下すると申請だけが消え、許可リストには入らない', async () => {
      await save('no', null);
      const request = await requestOf('no');
      await expect(rejectGateAccessRequest(prisma, request!.id)).resolves.toBe(address('no'));
      expect(await requestOf('no')).toBeNull();
      expect(await allowedOf('no')).toBeNull();
      // もう無い申請の却下・許可は、どちらも「無い」になる
      await expect(rejectGateAccessRequest(prisma, request!.id)).resolves.toBeNull();
      await expect(approve(request!.id)).resolves.toEqual({ status: 'not_found' });
    });

    it('同じ申請の許可と却下が同時に来ても、どちらか一方だけが成功する', async () => {
      await save('race', null);
      const request = await requestOf('race');
      const [approved, rejected] = await Promise.all([
        approve(request!.id),
        rejectGateAccessRequest(prisma, request!.id),
      ]);
      const allowed = (await allowedOf('race')) !== null;
      // 許可が勝てば却下は「無い」、却下が勝てば許可は「無い」で許可リストにも入らない
      expect(approved.status === 'approved').toBe(rejected === null);
      expect(allowed).toBe(approved.status === 'approved');
      expect(await requestOf('race')).toBeNull();
    });

    it('許可リストが上限なら入れず、申請を残す', async () => {
      await add('last');
      await save('full', null);
      const request = await requestOf('full');
      await expect(approve(request!.id)).resolves.toEqual({
        status: 'list_full',
        email: address('full'),
      });
      expect(await allowedOf('full')).toBeNull();
      expect(await requestOf('full')).not.toBeNull();
    });

    it('すでに許可されているアドレス（先に追加済み・設定で固定）の申請は、消すだけにする', async () => {
      // 上限に達していても、足さないので通る
      await prisma.gateAccessRequest.create({ data: { email: address('listed') } });
      await prisma.gateAllowedEmail.create({ data: { email: address('listed') } });
      const listed = await requestOf('listed');
      await expect(approve(listed!.id)).resolves.toEqual({
        status: 'already_allowed',
        email: address('listed'),
      });
      expect(await requestOf('listed')).toBeNull();
      expect(
        await prisma.gateAllowedEmail.count({ where: { email: address('listed') } })
      ).toBe(1);

      await prisma.gateAccessRequest.create({ data: { email: address('fixedreq') } });
      const fixed = await requestOf('fixedreq');
      await expect(approve(fixed!.id, [address('fixedreq')])).resolves.toEqual({
        status: 'already_allowed',
        email: address('fixedreq'),
      });
      expect(await requestOf('fixedreq')).toBeNull();
      expect(await allowedOf('fixedreq')).toBeNull();
    });

    it('管理者が手でアドレスを足すと、同じアカウントの申請は消える（ほかの申請は残る）', async () => {
      await save('manual', null);
      await save('other', null);
      await expect(add('manual')).resolves.not.toBeNull();
      expect(await requestOf('manual')).toBeNull();
      expect(await requestOf('other')).not.toBeNull();
    });
  });
});
