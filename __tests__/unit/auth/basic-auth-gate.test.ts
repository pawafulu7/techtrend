import { NextRequest } from 'next/server';
import {
  BASIC_AUTH_CHALLENGE,
  buildGateSetCookie,
  evaluateGate,
  gateCookieName,
  type GateEnv,
} from '@/lib/auth/basic-auth-gate';

const SECRET = 'f'.repeat(64);
const USER = 'tester';
const PASS = 'correct-horse';

function gateEnv(overrides: Partial<GateEnv> = {}): GateEnv {
  return {
    enabled: 'true',
    user: USER,
    pass: PASS,
    legacyPass: undefined,
    gateSecret: SECRET,
    cronSecret: undefined,
    ...overrides,
  };
}

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
function issueCookieValue(env: GateEnv = gateEnv()): string {
  const setCookie = buildGateSetCookie(makeRequest(), env);
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

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('ゲート Cookie の署名と検証', () => {
    it('U1: 署名した Cookie は検証を通る', () => {
      const outcome = evaluateGate(
        requestWithCookie(issueCookieValue()),
        gateEnv()
      );
      expect(outcome.kind).toBe('cookie');
    });

    it('U2: 署名を改ざんした Cookie は拒否される', () => {
      const parts = issueCookieValue().split('.');
      parts[2] = `${parts[2].slice(0, -1)}${parts[2].endsWith('A') ? 'B' : 'A'}`;

      expect(
        evaluateGate(requestWithCookie(parts.join('.')), gateEnv()).kind
      ).toBe('fail');
    });

    it('U3: 有効期限を過ぎた Cookie は拒否される', () => {
      const issuedAt = Date.UTC(2026, 0, 1);
      jest.spyOn(Date, 'now').mockReturnValue(issuedAt);
      const value = issueCookieValue();

      expect(evaluateGate(requestWithCookie(value), gateEnv()).kind).toBe(
        'cookie'
      );

      // TTL は 7 日。8 日後には失効している
      jest
        .spyOn(Date, 'now')
        .mockReturnValue(issuedAt + 8 * 24 * 60 * 60 * 1000);
      expect(evaluateGate(requestWithCookie(value), gateEnv()).kind).toBe(
        'fail'
      );
    });

    it('U4: フォーマットバージョンが異なる Cookie は拒否される', () => {
      const parts = issueCookieValue().split('.');
      parts[0] = 'v0';

      expect(
        evaluateGate(requestWithCookie(parts.join('.')), gateEnv()).kind
      ).toBe('fail');
    });

    it('U5: パスワード変更後は既存 Cookie が失効する', () => {
      const value = issueCookieValue();

      expect(
        evaluateGate(requestWithCookie(value), gateEnv({ pass: 'rotated' })).kind
      ).toBe('fail');
    });

    it('U6: ユーザー名変更後は既存 Cookie が失効する', () => {
      const value = issueCookieValue();

      expect(
        evaluateGate(requestWithCookie(value), gateEnv({ user: 'someone-else' }))
          .kind
      ).toBe('fail');
    });

    it('U7: 署名鍵のローテーション後は既存 Cookie が失効する', () => {
      const value = issueCookieValue();

      expect(
        evaluateGate(
          requestWithCookie(value),
          gateEnv({ gateSecret: '0'.repeat(64) })
        ).kind
      ).toBe('fail');
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
        expect(() =>
          evaluateGate(requestWithCookie(value), gateEnv())
        ).not.toThrow();
        expect(evaluateGate(requestWithCookie(value), gateEnv()).kind).toBe(
          'fail'
        );
      }
    });
  });

  describe('Basic ヘッダのパース', () => {
    it('U9: 非 ASCII のパスワードで認証できる', () => {
      const pass = 'パスワード🔐';
      const headers = { authorization: basicHeader(USER, pass) };

      expect(
        evaluateGate(makeRequest({ headers }), gateEnv({ pass })).kind
      ).toBe('basic');
    });

    it('U10: コロンを含むパスワードで認証できる', () => {
      const pass = 'a:b:c';
      const headers = { authorization: basicHeader(USER, pass) };

      expect(
        evaluateGate(makeRequest({ headers }), gateEnv({ pass })).kind
      ).toBe('basic');
    });

    it('U11: スキーム名は大文字小文字を区別しない', () => {
      for (const scheme of ['Basic', 'basic', 'BASIC', 'BaSiC']) {
        const headers = { authorization: basicHeader(USER, PASS, scheme) };
        expect(evaluateGate(makeRequest({ headers }), gateEnv()).kind).toBe(
          'basic'
        );
      }
    });

    it('U12: 不正な Authorization ヘッダは拒否される', () => {
      const invalid = [
        'Basic',
        'Basic ',
        `Basic ${Buffer.from('no-colon-here', 'utf8').toString('base64')}`,
        `Basic ${Buffer.from(`${USER}:${PASS}`, 'utf8').toString('base64')} extra`,
        'Basic dXNlcjpwYX!!', // 長さは 4 の倍数だが Base64 の文字種ではない
        'Basic dXNlcjpwYXNz=', // 長さが 4 の倍数でない
        'Bearer something',
      ];

      for (const authorization of invalid) {
        expect(
          evaluateGate(makeRequest({ headers: { authorization } }), gateEnv())
            .kind
        ).toBe('fail');
      }
    });

    it('U13: 不正な UTF-8 バイト列は拒否される', () => {
      const token = Buffer.from([0x75, 0x3a, 0xff, 0xfe]).toString('base64');
      const headers = { authorization: `Basic ${token}` };

      expect(evaluateGate(makeRequest({ headers }), gateEnv()).kind).toBe(
        'fail'
      );
    });

    it('U14: 制御文字を含む資格情報は拒否される', () => {
      // 設定値と入力値は一致しているが、制御文字を含むためパース段階で拒否される
      const pass = `pa${String.fromCharCode(0x01)}ss`;
      const headers = { authorization: basicHeader(USER, pass) };

      expect(
        evaluateGate(makeRequest({ headers }), gateEnv({ pass })).kind
      ).toBe('fail');
    });

    it('U20: 設定値が NFD でも NFC で送られた資格情報と一致する', () => {
      // NFD の「パ」（ハ + 半濁点）。RFC 7617 は charset="UTF-8" 時に NFC を期待する
      const nfdPass = String.fromCharCode(0x30cf, 0x309a);
      const nfcPass = nfdPass.normalize('NFC');
      expect(nfdPass).not.toBe(nfcPass);

      const headers = { authorization: basicHeader(USER, nfcPass) };

      expect(
        evaluateGate(makeRequest({ headers }), gateEnv({ pass: nfdPass })).kind
      ).toBe('basic');
    });

    it('パスワードが違えば拒否される', () => {
      const headers = { authorization: basicHeader(USER, 'wrong') };
      expect(evaluateGate(makeRequest({ headers }), gateEnv()).kind).toBe(
        'fail'
      );
    });

    it('ユーザー名が違えば拒否される', () => {
      const headers = { authorization: basicHeader('wrong', PASS) };
      expect(evaluateGate(makeRequest({ headers }), gateEnv()).kind).toBe(
        'fail'
      );
    });
  });

  describe('BASIC_AUTH_ENABLED の解釈', () => {
    it('U21: 表記揺れでも有効と判定する', () => {
      for (const enabled of ['true', 'TRUE', ' true ', 'True']) {
        expect(evaluateGate(makeRequest(), gateEnv({ enabled })).kind).toBe(
          'fail'
        );
      }
    });

    it('U22: 未設定・空文字・false は無効と判定する', () => {
      for (const enabled of [undefined, '', '  ', 'false', 'FALSE']) {
        expect(evaluateGate(makeRequest(), gateEnv({ enabled })).kind).toBe(
          'disabled'
        );
      }
    });

    it('U23: true/false 以外の値は設定ミスとして fail-closed にする', () => {
      for (const enabled of ['ture', '1', 'yes', 'on']) {
        expect(evaluateGate(makeRequest(), gateEnv({ enabled })).kind).toBe(
          'misconfigured'
        );
      }
    });
  });

  describe('設定不備（fail-closed）', () => {
    it('U15: 有効化されているのにパスワードが未設定なら misconfigured', () => {
      const outcome = evaluateGate(
        makeRequest(),
        gateEnv({ pass: undefined, legacyPass: undefined })
      );

      expect(outcome.kind).toBe('misconfigured');
      expect(outcome.kind === 'misconfigured' && outcome.reason).toContain(
        'BASIC_AUTH_PASS'
      );
    });

    it('U16: 署名鍵が未設定または短すぎれば misconfigured', () => {
      const missing = evaluateGate(
        makeRequest(),
        gateEnv({ gateSecret: undefined })
      );
      expect(missing.kind).toBe('misconfigured');
      expect(missing.kind === 'misconfigured' && missing.reason).toContain(
        'BASIC_AUTH_GATE_SECRET'
      );

      expect(
        evaluateGate(makeRequest(), gateEnv({ gateSecret: 'a'.repeat(31) })).kind
      ).toBe('misconfigured');

      expect(
        evaluateGate(makeRequest(), gateEnv({ gateSecret: 'a'.repeat(32) })).kind
      ).toBe('fail');
    });

    it('BASIC_PASSWORD（旧名）でも設定済みとみなす', () => {
      const headers = { authorization: basicHeader(USER, PASS) };

      expect(
        evaluateGate(
          makeRequest({ headers }),
          gateEnv({ pass: undefined, legacyPass: PASS })
        ).kind
      ).toBe('basic');
    });
  });

  describe('Cookie 検証失敗は非終端', () => {
    it('U17: 改ざん Cookie でも正しい Basic があれば basic として通る', () => {
      const request = requestWithCookie(
        'v1.9999999999.tampered',
        basicHeader(USER, PASS)
      );

      expect(evaluateGate(request, gateEnv()).kind).toBe('basic');
    });

    it('U18: 旧パスワード由来の Cookie でも新しい Basic があれば basic として通る', () => {
      const staleCookie = issueCookieValue();
      const rotated = gateEnv({ pass: 'rotated-password' });
      const request = requestWithCookie(
        staleCookie,
        basicHeader(USER, 'rotated-password')
      );

      expect(evaluateGate(request, rotated).kind).toBe('basic');
    });
  });

  describe('cron Bearer', () => {
    it('U19: 資格情報が欠落していても cron は通る', () => {
      const headers = { authorization: 'Bearer cron-token-value' };
      const env = gateEnv({
        pass: undefined,
        legacyPass: undefined,
        gateSecret: undefined,
        cronSecret: 'cron-token-value',
      });

      expect(evaluateGate(makeRequest({ headers }), env).kind).toBe('cron');
    });

    it('スキーム名は大文字小文字を区別しない', () => {
      const headers = { authorization: 'bearer legacy-cron-secret' };
      const env = gateEnv({ cronSecret: 'legacy-cron-secret' });

      expect(evaluateGate(makeRequest({ headers }), env).kind).toBe('cron');
    });

    it('トークンが違えば cron として扱わない', () => {
      const headers = { authorization: 'Bearer wrong-token' };
      const env = gateEnv({ cronSecret: 'cron-token-value' });

      expect(evaluateGate(makeRequest({ headers }), env).kind).toBe('fail');
    });
  });

  describe('Cookie 属性', () => {
    it('development / HTTP では prefix なし・Secure なし', () => {
      const setCookie = buildGateSetCookie(makeRequest(), gateEnv());

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
        makeRequest({ url: 'https://example.com/' }),
        gateEnv()
      );

      expect(setCookie).toContain('Secure');
    });

    it('production では __Host- prefix が付く', () => {
      process.env.NODE_ENV = 'production';
      const setCookie = buildGateSetCookie(
        makeRequest({ url: 'https://example.com/' }),
        gateEnv()
      );

      expect(gateCookieName()).toBe('__Host-tt_gate');
      expect(setCookie).toContain('__Host-tt_gate=');
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('Path=/');
      expect(setCookie).not.toContain('Domain');
    });
  });

  it('challenge は RFC 7617 の charset を通知する', () => {
    expect(BASIC_AUTH_CHALLENGE).toBe(
      'Basic realm="Protected", charset="UTF-8"'
    );
  });
});
