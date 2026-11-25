import {
  GATE_REQUEST_ACCOUNT_COOKIE,
  GATE_REQUEST_ACCOUNT_TTL_SEC,
  buildGateRequestAccountClearCookie,
  buildGateRequestAccountCookie,
  readGateRequestAccount,
} from '@/lib/auth/site-gate/request-account-cookie';

const SECRET = 'g'.repeat(40);
const NOW = Date.parse('2026-11-25T00:00:00Z');

function build(email: string, options: { secret?: string; isProduction?: boolean } = {}) {
  return buildGateRequestAccountCookie({
    email,
    secret: options.secret ?? SECRET,
    isProduction: options.isProduction ?? false,
    now: NOW,
  });
}

function valueOf(setCookie: string | null): string {
  if (setCookie === null) throw new Error('expected a cookie');
  const pair = setCookie.split(';')[0];
  return pair.slice(pair.indexOf('=') + 1);
}

describe('buildGateRequestAccountCookie', () => {
  it('carries the address as Google returned it (lowercased, dots kept) and reads it back', () => {
    const setCookie = build(' Taro.Suzuki@Gmail.com ');
    expect(setCookie).toMatch(new RegExp(`^${GATE_REQUEST_ACCOUNT_COOKIE.replace('.', '\\.')}=`));
    expect(readGateRequestAccount(valueOf(setCookie), SECRET, NOW)).toBe(
      'taro.suzuki@gmail.com'
    );
  });

  it('is sent only to the gate paths, hidden from scripts, for 30 minutes', () => {
    const attributes = build('friend@gmail.com')!.split('; ').slice(1);
    expect(attributes).toEqual([
      'Path=/api/gate',
      `Max-Age=${GATE_REQUEST_ACCOUNT_TTL_SEC}`,
      'HttpOnly',
      'SameSite=Lax',
    ]);
    expect(GATE_REQUEST_ACCOUNT_TTL_SEC).toBe(1800);
    expect(build('friend@gmail.com', { isProduction: true })).toMatch(/; Secure$/);
  });

  it('does not put the address in the cookie as plain text next to the signature only', () => {
    // アドレスは base64url で入る（署名付き。暗号化はしない）
    const value = valueOf(build('friend@gmail.com'));
    expect(value.split('.')).toHaveLength(3);
    expect(value).not.toContain('@');
  });

  it.each(['friend@example.com', 'friend+x@gmail.com', '', 'friend@googlemail.com'])(
    'returns null for an address that cannot be allowed (%p)',
    (email) => {
      expect(build(email)).toBeNull();
    }
  );
});

describe('readGateRequestAccount', () => {
  const value = valueOf(build('friend@gmail.com'));

  it('rejects a missing or empty cookie', () => {
    expect(readGateRequestAccount(undefined, SECRET, NOW)).toBeNull();
    expect(readGateRequestAccount('', SECRET, NOW)).toBeNull();
  });

  it('rejects a cookie signed with another secret', () => {
    expect(readGateRequestAccount(value, 'x'.repeat(40), NOW)).toBeNull();
  });

  it('rejects a changed address, a changed expiry and a changed signature', () => {
    const [expiresAt, email, signature] = value.split('.');
    const other = Buffer.from('other@gmail.com', 'utf8').toString('base64url');
    expect(readGateRequestAccount(`${expiresAt}.${other}.${signature}`, SECRET, NOW)).toBeNull();
    expect(
      readGateRequestAccount(`${Number(expiresAt) + 1}.${email}.${signature}`, SECRET, NOW)
    ).toBeNull();
    const flipped = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
    expect(readGateRequestAccount(`${expiresAt}.${email}.${flipped}`, SECRET, NOW)).toBeNull();
    // 元の値は読める（上の 3 つが、値を変えたから読めないことの裏付け）
    expect(readGateRequestAccount(value, SECRET, NOW)).toBe('friend@gmail.com');
  });

  it('accepts only one spelling of the same signature and address', () => {
    // Buffer.from(…, 'base64url') は、余分な文字・パディング・別の表記を同じバイト列として読む
    const [expiresAt, email, signature] = value.split('.');
    for (const variant of [
      `${signature}=`,
      `${signature}!`,
      signature.replace(/-/g, '+').replace(/_/g, '/') + '=',
      `${signature.slice(0, 20)}!${signature.slice(20)}`,
    ]) {
      if (variant === signature) continue;
      expect(readGateRequestAccount(`${expiresAt}.${email}.${variant}`, SECRET, NOW)).toBeNull();
    }
    expect(readGateRequestAccount(`${expiresAt}.${email}=.${signature}`, SECRET, NOW)).toBeNull();

    // 43 文字目は下位 2 ビットが捨てられるので、同じ 32 バイトに読める文字が 4 通りある。元の 1 通りだけを通す
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const bytes = Buffer.from(signature, 'base64url');
    const sameBytes = [...alphabet].filter((last) =>
      Buffer.from(`${signature.slice(0, -1)}${last}`, 'base64url').equals(bytes)
    );
    expect(sameBytes).toHaveLength(4);
    const accepted = sameBytes.filter(
      (last) =>
        readGateRequestAccount(`${expiresAt}.${email}.${signature.slice(0, -1)}${last}`, SECRET, NOW) !==
        null
    );
    expect(accepted).toEqual([signature.slice(-1)]);
  });

  it('expires after 30 minutes', () => {
    const justBefore = NOW + GATE_REQUEST_ACCOUNT_TTL_SEC * 1000 - 1;
    expect(readGateRequestAccount(value, SECRET, justBefore)).toBe('friend@gmail.com');
    expect(
      readGateRequestAccount(value, SECRET, NOW + GATE_REQUEST_ACCOUNT_TTL_SEC * 1000)
    ).toBeNull();
  });

  it.each([
    'abc',
    'a.b',
    'a.b.c.d',
    'notanumber.ZnJpZW5kQGdtYWlsLmNvbQ.sig',
    `${'9'.repeat(13)}.ZnJpZW5kQGdtYWlsLmNvbQ.sig`,
    'x'.repeat(600),
  ])('rejects a malformed value (%p)', (malformed) => {
    expect(readGateRequestAccount(malformed, SECRET, NOW)).toBeNull();
  });
});

describe('buildGateRequestAccountClearCookie', () => {
  it('deletes the cookie on the same path', () => {
    expect(buildGateRequestAccountClearCookie(false)).toBe(
      `${GATE_REQUEST_ACCOUNT_COOKIE}=; Path=/api/gate; Max-Age=0; HttpOnly; SameSite=Lax`
    );
    expect(buildGateRequestAccountClearCookie(true)).toMatch(/; Secure$/);
  });
});
