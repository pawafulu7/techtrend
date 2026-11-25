/**
 * POST /api/gate/request（入口で未登録と拒否された人からの、利用の申請）
 *
 * CSRF の包みは差し替え（Origin の確認そのものは csrf-protection のテスト）、回数の制限は実物を通す
 * （Redis のモック）。DB はモックで、本物の DB での保存は allowlist-store.db.test.ts で確かめる。
 */
import type { NextRequest } from 'next/server';
import type { SiteGateConfig } from '@/lib/auth/site-gate/config';

jest.mock('@/lib/logger', () => {
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { __esModule: true, default: log, logger: log };
});

// CSRF の判定そのものは csrf-protection のテストで確かめる。ここでは、Route Handler が CSRF の包みを
// 通していることと、包みが拒否・例外になったときの応答（ページに直す）を確かめる。
// 包みは Route Handler の読み込み時に呼ばれるので、状態はモックの中に持つ（外の const はまだ初期化前）
jest.mock('@/lib/middleware/csrf-protection', () => {
  const state = { wrapped: 0, deny: false, fail: false };
  return {
    __state: state,
    withCSRFProtection: (handler: Function) => {
      state.wrapped += 1;
      return (request: unknown, context: unknown) => {
        if (state.fail) throw new Error('limiter down at 10.0.0.1');
        if (state.deny) {
          // 実物の拒否と同じ形（JSON の 403）
          return {
            status: 403,
            headers: new Headers({ 'content-type': 'application/json' }),
          };
        }
        return handler(request, context);
      };
    },
  };
});

jest.mock('@/lib/prisma');

const mockGetSiteGateConfig = jest.fn<SiteGateConfig, []>();
jest.mock('@/lib/auth/site-gate/server-config', () => ({
  getSiteGateConfig: () => mockGetSiteGateConfig(),
}));

// eslint-disable-next-line import/first
import { prisma } from '@/lib/prisma';
// eslint-disable-next-line import/first
import logger from '@/lib/logger';
// eslint-disable-next-line import/first
import { buildGateRequestAccountCookie } from '@/lib/auth/site-gate/request-account-cookie';
// eslint-disable-next-line import/first
import * as route from '@/app/api/gate/request/route';

const prismaMock = prisma as any;
const mockCsrf = (
  jest.requireMock('@/lib/middleware/csrf-protection') as {
    __state: { wrapped: number; deny: boolean; fail: boolean };
  }
).__state;
const mockLogger = logger as unknown as Record<'info' | 'warn' | 'error', jest.Mock>;

const SECRET = 'g'.repeat(40);
const ENABLED: SiteGateConfig = {
  kind: 'enabled',
  settings: {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    secret: SECRET,
    fixedEmails: ['owner@gmail.com'],
    baseOrigin: 'http://localhost:3000',
    isProduction: false,
  },
};

function accountCookie(email: string, secret = SECRET, now?: number): string {
  return buildGateRequestAccountCookie({ email, secret, isProduction: false, now })!.split(';')[0];
}

let ipCounter = 0;
/** 既定の申請用の Cookie のアカウント（Google が返した形）。フォームのアドレスの欄にも、これが入っている */
const TARO = 'taro.suzuki@gmail.com';
const ACCOUNT_FIELD = `account=${encodeURIComponent(TARO)}`;

function post(
  init: {
    note?: string;
    /** フォームのアドレスの欄の値（既定は、入れてあった Cookie のアカウントのまま） */
    account?: string | null;
    body?: string;
    cookie?: string | null;
    contentType?: string | null;
    ip?: string;
  } = {}
): Promise<Response> {
  ipCounter += 1;
  const headers: Record<string, string> = {
    'x-forwarded-for': init.ip ?? `203.0.113.${ipCounter % 250}`,
  };
  const contentType =
    init.contentType === undefined ? 'application/x-www-form-urlencoded' : init.contentType;
  if (contentType !== null) headers['content-type'] = contentType;
  const cookie = init.cookie === undefined ? accountCookie('Taro.Suzuki@gmail.com') : init.cookie;
  if (cookie !== null) headers.cookie = cookie;
  const fields = new URLSearchParams({ note: init.note ?? '' });
  if (init.account !== null) fields.set('account', init.account ?? TARO);
  const body = init.body ?? fields.toString();
  // テスト環境の NextRequest は本文をストリームで持たない簡易モックなので、本物の Request を使い
  // （__tests__/api/inquiries/route.test.ts と同じ）、Route Handler が使う cookies.get だけを足す
  const request = new Request('http://localhost:3000/api/gate/request', {
    method: 'POST',
    headers,
    body,
  });
  const jar = new Map(
    (headers.cookie ?? '')
      .split(';')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const index = pair.indexOf('=');
        return [pair.slice(0, index), pair.slice(index + 1)] as const;
      })
  );
  const cookies = {
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  };
  return route.POST(Object.assign(request, { cookies }) as unknown as NextRequest);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCsrf.deny = false;
  mockCsrf.fail = false;
  mockGetSiteGateConfig.mockReturnValue(ENABLED);
  for (const method of ['updateMany', 'findUnique', 'count', 'create']) {
    prismaMock.gateAccessRequest[method].mockReset();
  }
  prismaMock.gateAccessRequest.findUnique.mockResolvedValue(null);
  prismaMock.$executeRaw.mockReset();
  prismaMock.gateAllowedEmail.findUnique.mockReset();
  prismaMock.gateAllowedEmail.findUnique.mockResolvedValue(null);
  prismaMock.gateAccessRequest.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.gateAccessRequest.count.mockResolvedValue(0);
  prismaMock.gateAccessRequest.create.mockResolvedValue({ id: 'r1' });
});

describe('POST /api/gate/request', () => {
  it('exports POST only', () => {
    expect(Object.keys(route).filter((k) => /^[A-Z]+$/.test(k))).toEqual(['POST']);
  });

  it('saves the request for the address in the form (the rejected account, left as filled in) and answers with a page', async () => {
    const response = await post({ note: '  鈴木太郎です。\r\n紹介で来ました。  ' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const html = await response.text();
    expect(html).toContain('<h1>申請を送りました</h1>');
    // 画面には Google が返した形（ドット付き）で出し、保存は正規化した形にする
    expect(html).toContain('<p class="account">taro.suzuki@gmail.com</p>');
    // 許可済みかは DB で確かめる（入口の照合のキャッシュは使わない）
    expect(prismaMock.gateAllowedEmail.findUnique).toHaveBeenCalledWith({
      where: { email: 'tarosuzuki@gmail.com' },
      select: { id: true },
    });
    expect(prismaMock.gateAccessRequest.create).toHaveBeenCalledWith({
      data: { email: 'tarosuzuki@gmail.com', note: '鈴木太郎です。\n紹介で来ました。' },
      select: { id: true },
    });
  });

  it('logs the address masked and never the note', async () => {
    await post({ note: '内緒の備考' });
    expect(mockLogger.info).toHaveBeenCalledWith(
      { email: 't***@gmail.com', hasNote: true, edited: false },
      expect.any(String)
    );
    const logged = JSON.stringify([
      mockLogger.info.mock.calls,
      mockLogger.warn.mock.calls,
      mockLogger.error.mock.calls,
    ]);
    expect(logged).not.toContain('内緒の備考');
    expect(logged).not.toContain('tarosuzuki');
  });

  it('runs the lock, the allowlist check and the save in one transaction', async () => {
    // 別々に流すと、「未許可」と確かめた直後に管理者が許可を終えたとき、許可済みの申請が作り直される
    const steps: string[] = [];
    const tx = {
      $executeRaw: jest.fn(async (strings: TemplateStringsArray) => {
        steps.push(`lock:${strings.join('?')}`);
        return 1;
      }),
      gateAllowedEmail: {
        findUnique: jest.fn(async () => {
          steps.push('allowed?');
          return null;
        }),
      },
      gateAccessRequest: {
        updateMany: jest.fn(async () => {
          steps.push('update');
          return { count: 0 };
        }),
        count: jest.fn(async () => {
          steps.push('count');
          return 0;
        }),
        create: jest.fn(async () => {
          steps.push('create');
          return { id: 'r1' };
        }),
      },
    };
    prismaMock.$transaction.mockImplementationOnce(
      async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)
    );
    expect((await post({ note: 'x' })).status).toBe(200);
    expect(steps).toEqual([
      'lock:SELECT pg_advisory_xact_lock(?)',
      'allowed?',
      'update',
      'count',
      'create',
    ]);
    expect(typeof tx.$executeRaw.mock.calls[0][1]).toBe('bigint');
    expect(prismaMock.$transaction.mock.calls[0][1]).toMatchObject({
      isolationLevel: 'ReadCommitted',
    });
    expect(prismaMock.gateAccessRequest.create).not.toHaveBeenCalled();
  });

  it('saves the address the applicant changed to (another Gmail address), normalized', async () => {
    const response = await post({ account: ' Other.Person@Gmail.com ', note: '別のアカウントで使いたい' });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<h1>申請を送りました</h1>');
    // 画面には入力された形（小文字・ドット付き）で出し、保存は正規化した形にする
    expect(html).toContain('<p class="account">other.person@gmail.com</p>');
    expect(html).not.toContain(TARO);
    // 書き換えたアドレスでは、許可済みかを確かめない（確かめて応答や保存を変えると、許可リストを調べられる）
    expect(prismaMock.gateAllowedEmail.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.gateAccessRequest.create).toHaveBeenCalledWith({
      data: { email: 'otherperson@gmail.com', note: '別のアカウントで使いたい' },
      select: { id: true },
    });
    // 拒否されたアカウントとは別のアドレスで申請したことをログに残す（アドレスは伏せる）
    expect(mockLogger.info).toHaveBeenCalledWith(
      { email: 'o***@gmail.com', hasNote: true, edited: true },
      expect.any(String)
    );
  });

  it.each([
    ['an address that is not Gmail', 'someone@example.com'],
    ['a plus address', 'friend+x@gmail.com'],
    ['an empty address', ''],
    ['no address field', null],
    ['markup', '"><script>alert(1)</script>@gmail.com'],
  ])('shows the form again for %s, keeping what was typed, without saving', async (_label, typed) => {
    const response = await post({ account: typed, note: '書いた備考' });
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('@gmail.com のアドレスを入力してください。');
    expect(html).toContain('action="/api/gate/request"');
    expect(html).toContain('書いた備考</textarea>');
    expect(html).not.toContain('<script>alert(1)');
    if (typed === 'someone@example.com') expect(html).toContain('value="someone@example.com"');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.gateAccessRequest.create).not.toHaveBeenCalled();
  });

  it('echoes back at most 320 characters of an invalid address', async () => {
    const response = await post({ account: 'a'.repeat(5000), note: 'x' });
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain(`value="${'a'.repeat(320)}"`);
    expect(html).not.toContain('a'.repeat(321));
  });

  it('reports both errors when the address and the note are invalid', async () => {
    const response = await post({ account: 'someone@example.com', note: 'あ'.repeat(501) });
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('@gmail.com のアドレスを入力してください。');
    expect(html).toContain('備考は 500 文字までにしてください。');
  });

  it('does not let people who did not go through the Google sign-in send a request, whatever the form says', async () => {
    const response = await post({ cookie: null, account: 'friend@gmail.com', note: 'x' });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('申請の手続きが切れました。');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('stores no note as null', async () => {
    await post({ note: '   \r\n ' });
    expect(prismaMock.gateAccessRequest.create).toHaveBeenCalledWith({
      data: { email: 'tarosuzuki@gmail.com', note: null },
      select: { id: true },
    });
  });

  it('rewrites the note when the signed-in account has already requested (resend or reload)', async () => {
    prismaMock.gateAccessRequest.updateMany.mockResolvedValue({ count: 1 });
    const response = await post({ note: '書き直し' });
    expect(response.status).toBe(200);
    expect(prismaMock.gateAccessRequest.updateMany).toHaveBeenCalledWith({
      where: { email: 'tarosuzuki@gmail.com' },
      data: { note: '書き直し' },
    });
    expect(prismaMock.gateAccessRequest.create).not.toHaveBeenCalled();
    // すでにある申請の書き直しは、上限に達していても受け付ける
    expect(prismaMock.gateAccessRequest.count).not.toHaveBeenCalled();
  });

  it('drops control characters that the DB cannot store (a NUL from %00) instead of failing', async () => {
    const response = await post({ body: `${ACCOUNT_FIELD}&note=%00a%00b%0D%0A%09c%1B%7F` });
    expect(response.status).toBe(200);
    // 改行とタブは残す
    expect(prismaMock.gateAccessRequest.create.mock.calls[0][0].data.note).toBe('ab\n\tc');
  });

  it('drops characters that can fake how the note looks to the admin, and collapses blank lines', async () => {
    // 文字の向きを変える文字（U+202E など）・幅の無い文字・C1 制御文字。改行だけで一覧を縦に伸ばさせない
    const note = '鈴木\u202Eです\u2066\u200B\u0085\uFEFF。\n\n\n\n\n二行目\u2028三行目';
    await post({ note });
    expect(prismaMock.gateAccessRequest.create.mock.calls[0][0].data.note).toBe(
      '鈴木です。\n\n二行目\n三行目'
    );
  });

  it('goes through the CSRF wrapper and answers its rejection with a page', async () => {
    expect(mockCsrf.wrapped).toBe(1);
    mockCsrf.deny = true;
    const response = await post({ note: 'x' });
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toContain('<h1>申請を送れませんでした</h1>');
    expect(prismaMock.gateAccessRequest.create).not.toHaveBeenCalled();
  });

  it('answers with a page when the wrappers throw, without leaking the error', async () => {
    mockCsrf.fail = true;
    const response = await post({ note: 'x' });
    expect(response.status).toBe(503);
    const html = await response.text();
    expect(html).toContain('<h1>いまは申請を送れません</h1>');
    expect(html).not.toContain('10.0.0.1');
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain('10.0.0.1');
  });

  it.each([
    ['no cookie', null],
    ['a cookie signed with another secret', accountCookie('friend@gmail.com', 'x'.repeat(40))],
    ['an expired cookie', accountCookie('friend@gmail.com', SECRET, Date.now() - 31 * 60 * 1000)],
    ['a forged cookie', 'tt-gate.request_account=9999999999.ZnJpZW5kQGdtYWlsLmNvbQ.AAAA'],
  ])('refuses with %s, without touching the DB', async (_label, cookie) => {
    const response = await post({ cookie, note: 'x' });
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('<h1>申請を送れませんでした</h1>');
    expect(html).toContain('申請の手続きが切れました。');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.gateAccessRequest.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.gateAccessRequest.create).not.toHaveBeenCalled();
  });

  it('accepts a cookie that is about to expire', async () => {
    const cookie = accountCookie('friend@gmail.com', SECRET, Date.now() - 29 * 60 * 1000);
    expect((await post({ cookie, note: 'x' })).status).toBe(200);
  });

  it('does not create a request when the account is already listed', async () => {
    prismaMock.gateAllowedEmail.findUnique.mockResolvedValue({ id: 'allowed-1' });
    const response = await post({ note: 'x' });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<h1>登録済みのアカウントです</h1>');
    expect(prismaMock.gateAccessRequest.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.gateAccessRequest.create).not.toHaveBeenCalled();
  });

  it('does not create a request for an address fixed by the environment (no DB row)', async () => {
    const response = await post({
      cookie: accountCookie('o.wner@gmail.com'),
      account: 'o.wner@gmail.com',
      note: 'x',
    });
    expect(await response.text()).toContain('<h1>登録済みのアカウントです</h1>');
    expect(prismaMock.gateAllowedEmail.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.gateAccessRequest.create).not.toHaveBeenCalled();
  });

  describe('書き換えたアドレスの状態（許可済み・申請済み）で応答を変えない', () => {
    // 変えると、Google のログインを通った人なら誰でも、任意のアドレスが許可リストにあるかを調べられる
    const STATES: [string, () => void, string][] = [
      [
        'listed in the allowlist',
        () => prismaMock.gateAllowedEmail.findUnique.mockResolvedValue({ id: 'allowed-1' }),
        'listed@gmail.com',
      ],
      ['fixed by the environment', () => undefined, 'owner@gmail.com'],
      [
        'already requested',
        () => prismaMock.gateAccessRequest.findUnique.mockResolvedValue({ id: 'r-existing' }),
        'pending@gmail.com',
      ],
      ['unknown', () => undefined, 'unknown@gmail.com'],
    ];
    let cookieCounter = 0;
    // 書き換えた申請はアカウントごとに 1 日 3 件までなので、問い合わせごとに別のアカウントで送る
    const probe = (typed: string) => {
      cookieCounter += 1;
      return post({ cookie: accountCookie(`prober${cookieCounter}@gmail.com`), account: typed, note: 'x' });
    };

    it('answers the same page for every state when there is room', async () => {
      const pages: string[] = [];
      for (const [, arrange, typed] of STATES) {
        prismaMock.gateAllowedEmail.findUnique.mockResolvedValue(null);
        prismaMock.gateAccessRequest.findUnique.mockResolvedValue(null);
        arrange();
        const response = await probe(typed);
        expect(response.status).toBe(200);
        pages.push((await response.text()).replace(typed, 'ADDRESS'));
      }
      expect(pages[0]).toContain('<h1>申請を送りました</h1>');
      expect(new Set(pages).size).toBe(1);
      // 許可済みかは一度も確かめていない
      expect(prismaMock.gateAllowedEmail.findUnique).not.toHaveBeenCalled();
    });

    it('answers the same page for every state when the pending list is full', async () => {
      // 満杯のときに「許可済み・申請済みは 200、未登録は 503」と分かれると、状態を調べられる
      prismaMock.gateAccessRequest.count.mockResolvedValue(100);
      const pages: string[] = [];
      for (const [, arrange, typed] of STATES) {
        prismaMock.gateAllowedEmail.findUnique.mockResolvedValue(null);
        prismaMock.gateAccessRequest.findUnique.mockResolvedValue(null);
        arrange();
        const response = await probe(typed);
        expect(response.status).toBe(503);
        pages.push((await response.text()).replace(typed, 'ADDRESS'));
      }
      expect(pages[0]).toContain('申請の受け付けが混み合っています。');
      expect(new Set(pages).size).toBe(1);
      expect(prismaMock.gateAccessRequest.create).not.toHaveBeenCalled();
      expect(prismaMock.gateAccessRequest.updateMany).not.toHaveBeenCalled();
    });

    it('places a request even for an address that is already allowed (an approval then just removes it)', async () => {
      prismaMock.gateAllowedEmail.findUnique.mockResolvedValue({ id: 'allowed-1' });
      await probe('listed@gmail.com');
      expect(prismaMock.gateAccessRequest.create).toHaveBeenCalledWith({
        data: { email: 'listed@gmail.com', note: 'x' },
        select: { id: true },
      });
    });
  });

  it('limits requests for edited addresses to 3 per day per signed-in account, whatever the IP', async () => {
    const cookie = accountCookie('busy.person@gmail.com');
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 4; i++) {
      // post は呼ぶたびに別の IP を使う
      last = await post({ cookie, account: `target${i}@gmail.com`, note: 'x' });
      statuses.push(last.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(await last!.text()).toContain('送信の回数が多すぎます。');
    expect(prismaMock.gateAccessRequest.create).toHaveBeenCalledTimes(3);

    // 自分のアカウントの申請は数えない（上限に達していても送れる）
    const own = await post({ cookie, account: 'busy.person@gmail.com', note: 'x' });
    expect(own.status).toBe(200);
    // ほかのアカウントには影響しない
    const other = await post({
      cookie: accountCookie('quiet.person@gmail.com'),
      account: 'target9@gmail.com',
      note: 'x',
    });
    expect(other.status).toBe(200);
  });

  it('does not let another person change a request that is already there for the address', async () => {
    // 書き換えたアドレスは誰のものでも入れられる。先に届いている申請の備考を上書き・消去させない
    prismaMock.gateAccessRequest.findUnique.mockResolvedValue({ id: 'r-existing' });
    const response = await post({ account: 'victim@gmail.com', note: '上書きしたい備考' });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<h1>申請を送りました</h1>');
    expect(prismaMock.gateAccessRequest.findUnique).toHaveBeenCalledWith({
      where: { email: 'victim@gmail.com' },
      select: { id: true },
    });
    expect(prismaMock.gateAccessRequest.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.gateAccessRequest.create).not.toHaveBeenCalled();
  });

  it('shows the form again with the note when it is too long', async () => {
    const response = await post({ note: 'あ'.repeat(501) });
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('備考は 500 文字までにしてください。');
    expect(html).toContain('あ'.repeat(501));
    expect(html).toContain('action="/api/gate/request"');
    expect(prismaMock.gateAccessRequest.create).not.toHaveBeenCalled();
  });

  it('accepts exactly 500 characters, counting a line break as one', async () => {
    const note = `${'あ'.repeat(249)}\r\n${'い'.repeat(250)}`;
    const response = await post({ note });
    expect(response.status).toBe(200);
    expect(prismaMock.gateAccessRequest.create.mock.calls[0][0].data.note).toHaveLength(500);
  });

  it.each([
    ['JSON', 'application/json', '{"note":"x"}'],
    ['multipart', 'multipart/form-data; boundary=x', 'x'],
    ['no content type', null, 'note=x'],
  ])('refuses %s bodies', async (_label, contentType, body) => {
    const response = await post({ contentType, body });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('送信の内容を読み取れませんでした。');
    expect(prismaMock.gateAccessRequest.create).not.toHaveBeenCalled();
  });

  it('refuses a body over 16 KB', async () => {
    const response = await post({ body: `${ACCOUNT_FIELD}&note=${'a'.repeat(16 * 1024)}` });
    expect(response.status).toBe(400);
    expect(prismaMock.gateAccessRequest.create).not.toHaveBeenCalled();
  });

  it('refuses a new request when 100 are pending', async () => {
    prismaMock.gateAccessRequest.count.mockResolvedValue(100);
    const response = await post({ note: 'x' });
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('申請の受け付けが混み合っています。');
    expect(prismaMock.gateAccessRequest.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the allowlist check',
      () => prismaMock.gateAllowedEmail.findUnique.mockRejectedValue(new Error('db down at 10.0.0.1')),
    ],
    [
      'the save',
      () => prismaMock.gateAccessRequest.create.mockRejectedValue(new Error('db down at 10.0.0.1')),
    ],
  ])('answers 503 without leaking the error when %s fails', async (_label, arrange) => {
    arrange();
    const response = await post({ note: 'x' });
    expect(response.status).toBe(503);
    const html = await response.text();
    expect(html).toContain('<h1>いまは申請を送れません</h1>');
    expect(html).not.toContain('10.0.0.1');
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain('10.0.0.1');
  });

  it('is 404 when the gate is disabled', async () => {
    mockGetSiteGateConfig.mockReturnValue({ kind: 'disabled' });
    const response = await post({ note: 'x' });
    expect(response.status).toBe(404);
    expect(prismaMock.gateAccessRequest.create).not.toHaveBeenCalled();
  });

  it('limits requests to 10 per hour per IP and answers with a page', async () => {
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await post({ note: 'x', ip: '198.51.100.77' });
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(last!.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(last!.headers.get('retry-after')).toBeTruthy();
    expect(await last!.text()).toContain('送信の回数が多すぎます。');
    expect(prismaMock.gateAccessRequest.create).toHaveBeenCalledTimes(10);
  });
});
