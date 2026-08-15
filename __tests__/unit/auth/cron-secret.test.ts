/**
 * lib/auth/cron-secret.ts の単体テスト。
 *
 * 純関数のみで構成されるモジュールのため NextRequest 等のモックは不要。
 * CRON_TOKEN 優先・CRON_SECRET フォールバック・不正値の fail-closed
 * （undefined を返す。フォールバックしない）を固定する。
 */

import { resolveCronSecret } from '@/lib/auth/cron-secret';

// 制御文字はファイルにリテラルで書き込むとバイナリ扱いになるため \uXXXX で表記する
const CTL = '\u0001';

describe('resolveCronSecret', () => {
  it('両方有効な場合は CRON_TOKEN を優先する', () => {
    expect(resolveCronSecret('token-value', 'legacy-value')).toBe(
      'token-value'
    );
  });

  it('CRON_TOKEN のみ有効な場合はその値を返す', () => {
    expect(resolveCronSecret('token-value', undefined)).toBe('token-value');
  });

  it('CRON_TOKEN が空白のみの場合は CRON_SECRET へフォールバックする', () => {
    expect(resolveCronSecret('   ', 'legacy-value')).toBe('legacy-value');
  });

  it('CRON_TOKEN が空文字列の場合は CRON_SECRET へフォールバックする', () => {
    expect(resolveCronSecret('', 'legacy-value')).toBe('legacy-value');
  });

  it.each([
    ['空白を含む', 'a b'],
    ['改行を含む', 'abc\n'],
    ['非 ASCII を含む', 'トークン'],
    ['制御文字を含む', `abc${CTL}def`],
  ])(
    'CRON_TOKEN が不正な非空値（%s）の場合、CRON_SECRET が有効でも undefined を返す（フォールバックしない）',
    (_label, invalidToken) => {
      expect(resolveCronSecret(invalidToken, 'legacy-value')).toBeUndefined();
    }
  );

  it('CRON_TOKEN が未設定で CRON_SECRET が不正な場合は undefined を返す', () => {
    expect(resolveCronSecret(undefined, 'a b')).toBeUndefined();
  });

  it('両方未設定の場合は undefined を返す', () => {
    expect(resolveCronSecret(undefined, undefined)).toBeUndefined();
  });

  describe('受理される値の例', () => {
    it('16進64文字を受理する', () => {
      const hex64 = 'a'.repeat(64);
      expect(resolveCronSecret(hex64, undefined)).toBe(hex64);
    });

    it('base64url的な記号（- と _）を受理する', () => {
      const value = 'abc-DEF_123';
      expect(resolveCronSecret(value, undefined)).toBe(value);
    });

    it('可視 ASCII の両端（! と ~）を受理する', () => {
      expect(resolveCronSecret('!abc~', undefined)).toBe('!abc~');
    });
  });
});
