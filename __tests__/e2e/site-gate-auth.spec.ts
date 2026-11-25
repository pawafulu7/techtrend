import { test, expect } from '@playwright/test';
import {
  createGateAuthOptions,
  createValidateGateUserInfo,
  toGateAuthLogger,
} from '../../lib/auth/site-gate/gate-auth-options';
import {
  GATE_DISABLED_PATHS,
  GATE_OPEN_LIBRARY_PATHS,
} from '../../lib/auth/site-gate/disabled-paths';
import {
  GATE_BASE_PATH,
  GATE_CALLBACK_MAX_LENGTH,
  GATE_CALLBACK_PATH,
  GATE_COOKIE_PREFIX,
} from '../../lib/auth/site-gate/constants';
import type { SiteGateSettings } from '../../lib/auth/site-gate/config';
import {
  captureRejectedGateAccount,
  noteRejectedGateAccount,
} from '../../lib/auth/site-gate/rejected-account-context';

/**
 * 入口用の Better Auth（DB なし）を、アプリと同じ設定（createGateAuthOptions）で実際に動かす結合テスト。
 *
 * better-auth は ESM だけで Jest では読み込めないので、Playwright の runner でブラウザを使わずに動かす
 * （前例: auth-disabled-paths.spec.ts）。Google のトークンの発行だけを fetch の差し替えで模擬し、
 * 開始 → Google からの戻り → ログイン状態の確認を通す。ライブラリを上げて前提が崩れたらここで落ちる。
 *
 * proxy・Route Handler の判定はそれぞれの単体テストで確かめる。本番（NODE_ENV=production）だけで変わる
 * /error の挙動は、設定が渡ることを gate-auth-options の単体テストで確かめる（isProduction は読み込み時に決まる）。
 */

const BASE = 'http://localhost:3000';
const DAY_MS = 24 * 60 * 60 * 1000;

// 同じプロセスの中で進められる時計
const RealDate = Date;
let offsetMs = 0;
class ShiftedDate extends RealDate {
  constructor(...args: ConstructorParameters<typeof Date> | []) {
    if (args.length === 0) super(RealDate.now() + offsetMs);
    else super(...(args as ConstructorParameters<typeof Date>));
  }
  static now() {
    return RealDate.now() + offsetMs;
  }
}

interface IdTokenClaims {
  email: string;
  email_verified: boolean;
}
let currentClaims: IdTokenClaims = { email: 'allowed@gmail.com', email_verified: true };
const tokenRequests: URLSearchParams[] = [];

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
function fakeIdToken(claims: IdTokenClaims): string {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'RS256', kid: 'k' })}.${b64({
    iss: 'https://accounts.google.com',
    aud: 'test-client',
    sub: `sub-${claims.email}`,
    name: 'Test',
    iat: now,
    exp: now + 3600,
    ...claims,
  })}.sig`;
}

const realFetch = globalThis.fetch;
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('https://oauth2.googleapis.com/token')) {
    tokenRequests.push(new URLSearchParams(String(init?.body ?? '')));
    return new Response(
      JSON.stringify({
        access_token: 'at',
        id_token: fakeIdToken(currentClaims),
        expires_in: 3599,
        token_type: 'Bearer',
        scope: 'openid email profile',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }
  throw new Error(`unexpected fetch in the gate spec: ${url}`);
}

type Jar = Record<string, string>;
function merge(jar: Jar, setCookies: string[]): Jar {
  const out = { ...jar };
  for (const setCookie of setCookies) {
    const [pair, ...attributes] = setCookie.split(';');
    const index = pair.indexOf('=');
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    const expired = attributes.some((a) => /^\s*max-age=0\s*$/i.test(a));
    if (value === '' || expired) delete out[name];
    else out[name] = value;
  }
  return out;
}
const cookieHeader = (jar: Jar) =>
  Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

async function createGate(
  options: {
    allow?: string[];
    isProduction?: boolean;
    checked?: string[];
    onNotListed?: (email: string) => void;
  } = {}
) {
  const { betterAuth } = await import('better-auth');
  const settings: SiteGateSettings = {
    clientId: 'test-client',
    clientSecret: 'test-secret',
    secret: 'gate-secret-for-the-spec-0123456789abcdefghijklmnop',
    fixedEmails: [],
    baseOrigin: BASE,
    isProduction: options.isProduction ?? false,
  };
  const allow = options.allow ?? ['allowed@gmail.com'];
  return betterAuth(
    createGateAuthOptions(settings, {
      validateUserInfo: createValidateGateUserInfo({
        checkAccess: async (email) => {
          options.checked?.push(email);
          return allow.includes(email) ? 'allowed' : 'not_allowed';
        },
        onRejected: () => {},
        onUnavailable: () => {},
        onNotListed: options.onNotListed ?? (() => {}),
      }),
      logger: toGateAuthLogger(() => {}),
    })
  );
}
type Gate = Awaited<ReturnType<typeof createGate>>;

async function start(gate: Gate, callbackURL = '/digest?x=1') {
  const { headers, response } = await gate.api.signInSocial({
    body: { provider: 'google', callbackURL },
    headers: new Headers(),
    returnHeaders: true,
  });
  const authorizeUrl = new URL(response.url!);
  return {
    authorizeUrl,
    setCookies: headers.getSetCookie(),
    jar: merge({}, headers.getSetCookie()),
  };
}

async function signIn(gate: Gate, claims: IdTokenClaims, callbackURL?: string) {
  currentClaims = claims;
  const started = await start(gate, callbackURL);
  const state = started.authorizeUrl.searchParams.get('state')!;
  const response = await gate.handler(
    new Request(`${BASE}${GATE_CALLBACK_PATH}?code=fake-code&state=${encodeURIComponent(state)}`, {
      headers: { cookie: cookieHeader(started.jar) },
    })
  );
  const setCookies = response.headers.getSetCookie();
  return {
    started,
    status: response.status,
    location: response.headers.get('location'),
    setCookies,
    jar: merge(started.jar, setCookies),
  };
}

async function sessionOf(gate: Gate, jar: Jar) {
  const { response } = await gate.api.getSession({
    headers: new Headers({ cookie: cookieHeader(jar) }),
    returnHeaders: true,
  });
  return response;
}

test.describe('入口用の Better Auth（DB なし）', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    globalThis.Date = ShiftedDate as DateConstructor;
    globalThis.fetch = fakeFetch as typeof fetch;
  });
  test.afterAll(() => {
    globalThis.Date = RealDate;
    globalThis.fetch = realFetch;
  });
  test.beforeEach(() => {
    offsetMs = 0;
    tokenRequests.length = 0;
  });

  test('許可した Gmail で入り、元のパスへ戻る。アプリ内のログイン状態は作らない', async () => {
    const gate = await createGate();
    const result = await signIn(gate, { email: 'allowed@gmail.com', email_verified: true });

    expect(result.status).toBe(302);
    expect(result.location).toBe('/digest?x=1');
    expect(Object.keys(result.jar).sort()).toEqual([
      `${GATE_COOKIE_PREFIX}.session_data`,
      `${GATE_COOKIE_PREFIX}.session_token`,
    ]);
    expect(result.setCookies.some((c) => c.startsWith('better-auth.'))).toBe(false);
    expect(result.setCookies.some((c) => c.includes('account_data'))).toBe(false);

    const session = await sessionOf(gate, result.jar);
    expect(session?.user.email).toBe('allowed@gmail.com');
    expect(session?.user.emailVerified).toBe(true);

    // Google へ送る中身: 入口の戻り先・アカウントの選び直し・PKCE（S256）
    const authorize = result.started.authorizeUrl;
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${BASE}${GATE_CALLBACK_PATH}`);
    expect(authorize.searchParams.get('prompt')).toBe('select_account');
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(tokenRequests[0].get('redirect_uri')).toBe(`${BASE}${GATE_CALLBACK_PATH}`);
    expect(tokenRequests[0].get('code_verifier')).toBeTruthy();
  });

  test('ドットの違うアドレスは同じアカウントとして照合する', async () => {
    const checked: string[] = [];
    const gate = await createGate({ checked });
    const result = await signIn(gate, { email: 'Al.Lowed@gmail.com', email_verified: true });
    expect(result.location).toBe('/digest?x=1');
    expect(checked).toEqual(['allowed@gmail.com']);
  });

  for (const [label, claims, code] of [
    ['許可リストに無い Gmail', { email: 'stranger@gmail.com', email_verified: true }, 'not_allowed'],
    ['Gmail 以外', { email: 'allowed@example.com', email_verified: true }, 'not_allowed'],
    ['メールが未確認', { email: 'allowed@gmail.com', email_verified: false }, 'email_not_verified'],
  ] as const) {
    test(`${label}はエラーページへ移り、ログイン状態を作らない`, async () => {
      const gate = await createGate();
      const result = await signIn(gate, claims);
      expect(result.status).toBe(302);
      const location = new URL(result.location!, BASE);
      expect(location.pathname).toBe(`${GATE_BASE_PATH}/error`);
      expect(location.searchParams.get('error')).toBe(code);
      expect(result.setCookies.some((c) => c.includes('session_token=') && !/max-age=0/i.test(c))).toBe(false);
    });
  }

  test('未登録で拒否したアカウントは、戻りの処理を包んだ呼び出し元にだけ届く（利用の申請に使う）', async () => {
    // アプリと同じつなぎ方（gate-auth.ts の onNotListed → rejected-account-context）。Better Auth の
    // 戻りの処理のなかの非同期処理をまたいで、要求ごとの入れ物に届くことを本物で確かめる
    const gate = await createGate({ onNotListed: noteRejectedGateAccount });
    const callback = async (claims: IdTokenClaims) => {
      currentClaims = claims;
      const started = await start(gate);
      const state = started.authorizeUrl.searchParams.get('state')!;
      return captureRejectedGateAccount(() =>
        gate.handler(
          new Request(
            `${BASE}${GATE_CALLBACK_PATH}?code=fake-code&state=${encodeURIComponent(state)}`,
            { headers: { cookie: cookieHeader(started.jar) } }
          )
        )
      );
    };

    const rejected = await callback({ email: 'new.person@gmail.com', email_verified: true });
    expect(new URL(rejected.result.headers.get('location')!, BASE).searchParams.get('error')).toBe(
      'not_allowed'
    );
    // Google が返した形（ドット付き）のまま届く。保存するときに正規化する
    expect(rejected.email).toBe('new.person@gmail.com');

    // 同時に進む別の戻りとは混ざらない
    const [first, second] = await Promise.all([
      callback({ email: 'first.one@gmail.com', email_verified: true }),
      captureRejectedGateAccount(async () => 'no callback here'),
    ]);
    expect(first.email).toBe('first.one@gmail.com');
    expect(second.email).toBeNull();

    // 許可されたアカウント・申請できないアカウント（未確認・Gmail 以外）では届かない
    for (const claims of [
      { email: 'allowed@gmail.com', email_verified: true },
      { email: 'new.person@gmail.com', email_verified: false },
      { email: 'someone@example.com', email_verified: true },
    ]) {
      expect((await callback(claims)).email).toBeNull();
    }
  });

  test('state の Cookie が無い戻りはエラーページへ移る', async () => {
    const gate = await createGate();
    currentClaims = { email: 'allowed@gmail.com', email_verified: true };
    const { authorizeUrl } = await start(gate);
    const response = await gate.handler(
      new Request(
        `${BASE}${GATE_CALLBACK_PATH}?code=fake-code&state=${authorizeUrl.searchParams.get('state')}`
      )
    );
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('location')!, BASE).pathname).toBe(`${GATE_BASE_PATH}/error`);
    expect(tokenRequests).toHaveLength(0);
  });

  test('ログインは最初から 7 日で切れ、アクセスしても延びない', async () => {
    const gate = await createGate();
    const result = await signIn(gate, { email: 'allowed@gmail.com', email_verified: true });
    const first = await sessionOf(gate, result.jar);
    const expiresAt = new Date(first!.session.expiresAt).getTime();
    expect(expiresAt - Date.now()).toBeGreaterThan(7 * DAY_MS - 60_000);

    // 同じプロセス（メモリが残る）と、別のプロセス（新しいインスタンス）の両方で確かめる
    const otherProcess = await createGate();
    offsetMs = 6 * DAY_MS;
    for (const instance of [gate, otherProcess]) {
      const { headers, response } = await instance.api.getSession({
        headers: new Headers({ cookie: cookieHeader(result.jar) }),
        returnHeaders: true,
      });
      expect(response).not.toBeNull();
      expect(new Date(response!.session.expiresAt).getTime()).toBe(expiresAt);
      // Set-Cookie が出ても、中の期限は延びない
      const refreshed = merge(result.jar, headers.getSetCookie());
      offsetMs = 7 * DAY_MS + 60_000;
      expect(await sessionOf(instance, refreshed)).toBeNull();
      offsetMs = 6 * DAY_MS;
    }
    offsetMs = 7 * DAY_MS + 60_000;
    expect(await sessionOf(gate, result.jar)).toBeNull();
    expect(await sessionOf(otherProcess, result.jar)).toBeNull();
  });

  test('同じプロセスに残ったセッションを session_token だけで引いても、期限は延びない', async () => {
    // DB なしでもセッションはインスタンスのメモリに残り、session_data が無いとそこから引く。
    // disableSessionRefresh が無いと、この経路で期限が延びる（調査で確認）
    const gate = await createGate();
    const result = await signIn(gate, { email: 'allowed@gmail.com', email_verified: true });
    const tokenOnly = Object.fromEntries(
      Object.entries(result.jar).filter(([name]) => name.endsWith('.session_token'))
    );
    const first = await sessionOf(gate, tokenOnly);
    expect(first).not.toBeNull();
    const expiresAt = new Date(first!.session.expiresAt).getTime();

    offsetMs = 2 * DAY_MS;
    const later = await sessionOf(gate, tokenOnly);
    expect(later).not.toBeNull();
    expect(new Date(later!.session.expiresAt).getTime()).toBe(expiresAt);

    offsetMs = 7 * DAY_MS + 60_000;
    expect(await sessionOf(gate, tokenOnly)).toBeNull();
  });

  test('本番の Cookie の名前は __Secure- 付き（proxy の Cookie の有無の判定と同じ名前）', async () => {
    const gate = await createGate({ isProduction: true });
    const result = await signIn(gate, { email: 'allowed@gmail.com', email_verified: true });
    expect(Object.keys(result.jar).sort()).toEqual([
      `__Secure-${GATE_COOKIE_PREFIX}.session_data`,
      `__Secure-${GATE_COOKIE_PREFIX}.session_token`,
    ]);
    expect(result.setCookies.every((c) => /;\s*Secure/i.test(c))).toBe(true);
  });

  test('上限の長さの戻り先でも state の Cookie は 4KB に収まる', async () => {
    const gate = await createGate({ isProduction: true });
    const callbackURL = `/${'a'.repeat(GATE_CALLBACK_MAX_LENGTH - 1)}`;
    const { setCookies } = await start(gate, callbackURL);
    const state = setCookies.find((c) => c.includes('oauth_state='));
    expect(state).toBeDefined();
    const nameValue = state!.split(';')[0];
    expect(Buffer.byteLength(nameValue, 'utf8')).toBeLessThanOrEqual(4096);
  });

  test('ID トークンを直接送るログインは閉じている', async () => {
    const gate = await createGate();
    await expect(
      gate.api.signInSocial({
        body: { provider: 'google', idToken: { token: fakeIdToken(currentClaims) } },
        headers: new Headers(),
      })
    ).rejects.toThrow();
  });

  test('組み込みのエラーページは HTTP で閉じている（拒否のページは自前で返す）', async () => {
    const gate = await createGate();
    const response = await gate.handler(new Request(`${BASE}${GATE_BASE_PATH}/error?error=not_allowed`));
    expect(response.status).toBe(404);
  });

  test('ライブラリの経路は、閉じる一覧と開けておく一覧のどちらかに入っている', async () => {
    const gate = await createGate();
    const paths = Object.values(gate.api)
      .map((endpoint) => (endpoint as { path?: string }).path)
      .filter((path): path is string => typeof path === 'string');
    const open = new Set<string>(GATE_OPEN_LIBRARY_PATHS);
    expect(paths.filter((p) => !open.has(p)).sort()).toEqual([...GATE_DISABLED_PATHS].sort());
    expect(paths.filter((p) => open.has(p)).sort()).toEqual([...GATE_OPEN_LIBRARY_PATHS].sort());
    // 引数付きの経路は disabledPaths で閉じられないので、開けておく一覧（Route Handler が 404 にする）にだけある
    expect(paths.filter((p) => p.includes(':')).every((p) => open.has(p))).toBe(true);
  });

  test('閉じた経路は HTTP で 404 になる', async () => {
    const gate = await createGate();
    for (const path of ['/sign-in/social', '/update-user', '/get-session']) {
      const response = await gate.handler(
        new Request(`${BASE}${GATE_BASE_PATH}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: BASE },
          body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
        })
      );
      expect(response.status).toBe(404);
    }
  });
});
