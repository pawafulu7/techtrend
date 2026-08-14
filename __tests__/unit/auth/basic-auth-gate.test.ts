import { NextRequest } from 'next/server';
import {
  BASIC_AUTH_CHALLENGE,
  buildGateSetCookie,
  evaluateGate,
  gateCookieName,
} from '@/lib/auth/basic-auth-gate';

const SECRET = 'f'.repeat(64);
const USER = 'tester';
const PASS = 'correct-horse';

function basicHeader(user: string, pass: string, scheme = 'Basic'): string {
  return `${scheme} ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
}

function makeRequest(
  init: { url?: string; headers?: Record<string, string> } = {}
): NextRequest {
  return new NextRequest(new URL(init.url ?? 'http://localhost:3000/'), {
    headers: init.headers,
  });
}

/** buildGateSetCookie が返す Set-Cookie 文字列から Cookie の値だけを取り出す */
function issueCookieValue(request = makeRequest()): string {
  const setCookie = buildGateSetCookie(request);
  const nameValue = setCookie.split(';')[0];
  return nameValue.slice(nameValue.indexOf('=') + 1);
}

function requestWithCookie(value: string, authorization?: string): NextRequest {
  const headers: Record<string, string> = {
    cookie: `${gateCookieName()}=${value}`,
  };
  if (authorization) headers.authorization = authorization;
  return makeRequest({ headers });
}

describe('basic-auth-gate', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.BASIC_AUTH_ENABLED = 'true';
    process.env.BASIC_AUTH_USER = USER;
    process.env.BASIC_AUTH_PASS = PASS;
    process.env.BASIC_AUTH_GATE_SECRET = SECRET;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.BASIC_AUTH_ENABLED;
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASS;
    delete process.env.BASIC_PASSWORD;
    delete process.env.BASIC_AUTH_GATE_SECRET;
    delete process.env.CRON_TOKEN;
    delete process.env.CRON_SECRET;
  });

  describe('ゲート Cookie の署名と検証', () => {
    it('U1: 署名した Cookie は検証を通る', () => {
      const outcome = evaluateGate(requestWithCookie(issueCookieValue()));
      expect(outcome.kind).toBe('cookie');
    });

    it('U2: 署名を改ざんした Cookie は拒否される', () => {
      const value = issueCookieValue();
      const parts = value.split('.');
      parts[2] = `${parts[2].slice(0, -1)}${parts[2].endsWith('A') ? 'B' : 'A'}`;

      expect(evaluateGate(requestWithCookie(parts.join('.'))).kind).toBe('fail');
    });

    it('U3: 有効期限を過ぎた Cookie は拒否される', () => {
      const issuedAt = Date.UTC(2026, 0, 1);
      jest.spyOn(Date, 'now').mockReturnValue(issuedAt);
      const value = issueCookieValue();

      // 発行直後は通る
      expect(evaluateGate(requestWithCookie(value)).kind).toBe('cookie');

      // TTL は 7 日。8 日後には失効している
      jest.spyOn(Date, 'now').mockReturnValue(issuedAt + 8 * 24 * 60 * 60 * 1000);
      expect(evaluateGate(requestWithCookie(value)).kind).toBe('fail');
    });

    it('U4: フォーマットバージョンが異なる Cookie は拒否される', () => {
      const value = issueCookieValue();
      const parts = value.split('.');
      parts[0] = 'v0';

      expect(evaluateGate(requestWithCookie(parts.join('.'))).kind).toBe('fail');
    });

    it('U5: パスワード変更後は既存 Cookie が失効する', () => {
      const value = issueCookieValue();
      process.env.BASIC_AUTH_PASS = 'rotated-password';

      expect(evaluateGate(requestWithCookie(value)).kind).toBe('fail');
    });

    it('U6: ユーザー名変更後は既存 Cookie が失効する', () => {
      const value = issueCookieValue();
      process.env.BASIC_AUTH_USER = 'someone-else';

      expect(evaluateGate(requestWithCookie(value)).kind).toBe('fail');
    });

    it('U7: 署名鍵のローテーション後は既存 Cookie が失効する', () => {
      const value = issueCookieValue();
      process.env.BASIC_AUTH_GATE_SECRET = '0'.repeat(64);

      expect(evaluateGate(requestWithCookie(value)).kind).toBe('fail');
    });

    it('U8: 有効期限が壊れた Cookie は例外を投げずに拒否される', () => {
      const signature = issueCookieValue().split('.')[2];
      const malformed = [
        `v1..${signature}`,
        `v1.abc.${signature}`,
        `v1.-1.${signature}`,
        `v1.99999999999999999999.${signature}`,
        `v1.${Math.floor(Date.now() / 1000) + 100}.${signature}.extra`,
        'v1',
        '',
      ];

      for (const value of malformed) {
        expect(() => evaluateGate(requestWithCookie(value))).not.toThrow();
        expect(evaluateGate(requestWithCookie(value)).kind).toBe('fail');
      }
    });
  });

  describe('Basic ヘッダのパース', () => {
    it('U9: 非 ASCII のパスワードで認証できる', () => {
      process.env.BASIC_AUTH_PASS = 'パスワード🔐';
      const headers = { authorization: basicHeader(USER, 'パスワード🔐') };

      expect(evaluateGate(makeRequest({ headers })).kind).toBe('basic');
    });

    it('U10: コロンを含むパスワードで認証できる', () => {
      process.env.BASIC_AUTH_PASS = 'a:b:c';
      const headers = { authorization: basicHeader(USER, 'a:b:c') };

      expect(evaluateGate(makeRequest({ headers })).kind).toBe('basic');
    });

    it('U11: スキーム名は大文字小文字を区別しない', () => {
      for (const scheme of ['Basic', 'basic', 'BASIC', 'BaSiC']) {
        const headers = { authorization: basicHeader(USER, PASS, scheme) };
        expect(evaluateGate(makeRequest({ headers })).kind).toBe('basic');
      }
    });

    it('U12: 不正な Authorization ヘッダは拒否される', () => {
      const invalid = [
        'Basic',
        'Basic ',
        `Basic ${Buffer.from('no-colon-here', 'utf8').toString('base64')}`,
        `Basic ${Buffer.from(`${USER}:${PASS}`, 'utf8').toString('base64')} extra`,
        'Basic dXNlcjpwYX!!', // 長さは 4 の倍数だが Base64 の文字種ではない
        'Basic dXNlcjpwYXNz=', // padding 位置が不正（長さが 4 の倍数でない）
        'Bearer something',
      ];

      for (const authorization of invalid) {
        expect(evaluateGate(makeRequest({ headers: { authorization } })).kind).toBe(
          'fail'
        );
      }
    });

    it('U13: 不正な UTF-8 バイト列は拒否される', () => {
      const token = Buffer.from([0x75, 0x3a, 0xff, 0xfe]).toString('base64');

      expect(
        evaluateGate(makeRequest({ headers: { authorization: `Basic ${token}` } }))
          .kind
      ).toBe('fail');
    });

    it('U14: 制御文字を含む資格情報は拒否される', () => {
      const passWithControlChar = `pa${String.fromCharCode(0x01)}ss`;
      process.env.BASIC_AUTH_PASS = passWithControlChar;
      const headers = { authorization: basicHeader(USER, passWithControlChar) };

      expect(evaluateGate(makeRequest({ headers })).kind).toBe('fail');
    });

    it('パスワードが違えば拒否される', () => {
      const headers = { authorization: basicHeader(USER, 'wrong') };
      expect(evaluateGate(makeRequest({ headers })).kind).toBe('fail');
    });

    it('ユーザー名が違えば拒否される', () => {
      const headers = { authorization: basicHeader('wrong', PASS) };
      expect(evaluateGate(makeRequest({ headers })).kind).toBe('fail');
    });
  });

  describe('設定不備（fail-closed）', () => {
    it('U15: 有効化されているのにパスワードが未設定なら misconfigured', () => {
      delete process.env.BASIC_AUTH_PASS;

      expect(evaluateGate(makeRequest()).kind).toBe('misconfigured');
    });

    it('U16: 署名鍵が未設定または短すぎれば misconfigured', () => {
      delete process.env.BASIC_AUTH_GATE_SECRET;
      expect(evaluateGate(makeRequest()).kind).toBe('misconfigured');

      process.env.BASIC_AUTH_GATE_SECRET = 'a'.repeat(31);
      expect(evaluateGate(makeRequest()).kind).toBe('misconfigured');

      process.env.BASIC_AUTH_GATE_SECRET = 'a'.repeat(32);
      expect(evaluateGate(makeRequest()).kind).toBe('fail');
    });

    it('BASIC_AUTH_ENABLED が未設定ならゲートは無効', () => {
      delete process.env.BASIC_AUTH_ENABLED;

      expect(evaluateGate(makeRequest()).kind).toBe('disabled');
    });

    it('BASIC_PASSWORD（旧名）でも設定済みとみなす', () => {
      delete process.env.BASIC_AUTH_PASS;
      process.env.BASIC_PASSWORD = PASS;
      const headers = { authorization: basicHeader(USER, PASS) };

      expect(evaluateGate(makeRequest({ headers })).kind).toBe('basic');
    });
  });

  describe('Cookie 検証失敗は非終端', () => {
    it('U17: 改ざん Cookie でも正しい Basic があれば basic として通る', () => {
      const request = requestWithCookie(
        'v1.9999999999.tampered',
        basicHeader(USER, PASS)
      );

      expect(evaluateGate(request).kind).toBe('basic');
    });

    it('U18: 旧パスワード由来の Cookie でも新しい Basic があれば basic として通る', () => {
      const staleCookie = issueCookieValue();
      process.env.BASIC_AUTH_PASS = 'rotated-password';
      const request = requestWithCookie(
        staleCookie,
        basicHeader(USER, 'rotated-password')
      );

      expect(evaluateGate(request).kind).toBe('basic');
    });
  });

  describe('cron Bearer', () => {
    it('U19: 資格情報が欠落していても cron は通る', () => {
      delete process.env.BASIC_AUTH_PASS;
      delete process.env.BASIC_AUTH_GATE_SECRET;
      process.env.CRON_TOKEN = 'cron-token-value';
      const headers = { authorization: 'Bearer cron-token-value' };

      expect(evaluateGate(makeRequest({ headers })).kind).toBe('cron');
    });

    it('CRON_SECRET（旧名）でも通る', () => {
      process.env.CRON_SECRET = 'legacy-cron-secret';
      const headers = { authorization: 'bearer legacy-cron-secret' };

      expect(evaluateGate(makeRequest({ headers })).kind).toBe('cron');
    });

    it('トークンが違えば cron として扱わない', () => {
      process.env.CRON_TOKEN = 'cron-token-value';
      const headers = { authorization: 'Bearer wrong-token' };

      expect(evaluateGate(makeRequest({ headers })).kind).toBe('fail');
    });
  });

  describe('Cookie 属性', () => {
    it('development / HTTP では prefix なし・Secure なし', () => {
      const setCookie = buildGateSetCookie(makeRequest());

      expect(setCookie).toContain('tt_gate=');
      expect(setCookie).not.toContain('__Host-');
      expect(setCookie).not.toContain('Secure');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).toContain('Path=/');
      expect(setCookie).toContain('Max-Age=604800');
      expect(setCookie).not.toContain('Domain');
    });

    it('HTTPS なら Secure が付く', () => {
      const setCookie = buildGateSetCookie(
        makeRequest({ url: 'https://example.com/' })
      );

      expect(setCookie).toContain('Secure');
    });

    it('production では __Host- prefix が付く', () => {
      process.env.NODE_ENV = 'production';
      const setCookie = buildGateSetCookie(
        makeRequest({ url: 'https://example.com/' })
      );

      expect(gateCookieName()).toBe('__Host-tt_gate');
      expect(setCookie).toContain('__Host-tt_gate=');
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('Path=/');
      expect(setCookie).not.toContain('Domain');
    });
  });

  it('challenge は RFC 7617 の charset を通知する', () => {
    expect(BASIC_AUTH_CHALLENGE).toBe('Basic realm="Protected", charset="UTF-8"');
  });
});
