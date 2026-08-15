/**
 * lib/auth/authorization-header.ts の単体テスト。
 *
 * 純関数のみで構成されるモジュールのため NextRequest 等のモックは不要。
 * ゲート（basic-auth-gate）と cron 認証ラッパーが同じ受理判定になることを
 * 保証するのがこのモジュールの目的なので、受理・拒否の境界を網羅する。
 */

import {
  CONTROL_CHAR_PATTERN,
  extractBasicToken,
  extractBearerToken,
  hasBearerScheme,
} from '@/lib/auth/authorization-header';

const CTL = '\u0001';
const DEL = '\u007F';

describe('authorization-header', () => {
  describe('extractBearerToken', () => {
    it('通常形式の token を取り出す', () => {
      expect(extractBearerToken('Bearer abc')).toBe('abc');
    });

    it.each(['bearer abc', 'BEARER abc', 'BeArEr abc'])(
      'スキーム名は大文字小文字を区別しない: %s',
      (header) => {
        expect(extractBearerToken(header)).toBe('abc');
      }
    );

    it('タブ区切りを受理する', () => {
      expect(extractBearerToken('Bearer\tabc')).toBe('abc');
    });

    it('複数の空白区切りを受理する', () => {
      expect(extractBearerToken('Bearer   abc')).toBe('abc');
    });

    it('空白とタブが混在する区切りを受理する', () => {
      expect(extractBearerToken('Bearer \t abc')).toBe('abc');
    });

    it('末尾の空白・タブを無視する', () => {
      expect(extractBearerToken('Bearer abc  ')).toBe('abc');
      expect(extractBearerToken('Bearer abc\t')).toBe('abc');
    });

    it('token が複数語なら拒否する', () => {
      expect(extractBearerToken('Bearer abc def')).toBeNull();
    });

    it.each([
      ['制御文字(U+0001)', `Bearer abc${CTL}`],
      ['DEL(U+007F)', `Bearer abc${DEL}`],
    ])('token に %s を含む場合は拒否する', (_label, header) => {
      expect(extractBearerToken(header)).toBeNull();
    });

    it.each([
      ['token なし', 'Bearer'],
      ['区切りのみで token なし', 'Bearer '],
      ['空文字列', ''],
      ['スキーム不一致(Basic)', 'Basic abc'],
      ['前置文字あり', 'XBearer abc'],
    ])('%s は拒否する', (_label, header) => {
      expect(extractBearerToken(header)).toBeNull();
    });

    it('null を渡しても例外にならず null を返す', () => {
      expect(extractBearerToken(null)).toBeNull();
    });

    it('空白を含むシークレット相当の値は取り出せない（env 側で禁止している前提）', () => {
      // lib/config/env.ts の CRON_TOKEN / CRON_SECRET は空白を禁止しており、
      // このケースが本番で発生しないことを検証で担保している。
      expect(extractBearerToken('Bearer a b')).toBeNull();
    });
  });

  describe('extractBasicToken', () => {
    const token = 'dXNlcjpwYXNz'; // "user:pass"

    it('通常形式の token を取り出す', () => {
      expect(extractBasicToken(`Basic ${token}`)).toBe(token);
    });

    it.each(['basic', 'BASIC', 'BaSiC'])(
      'スキーム名は大文字小文字を区別しない: %s',
      (scheme) => {
        expect(extractBasicToken(`${scheme} ${token}`)).toBe(token);
      }
    );

    it('タブ区切りを受理する', () => {
      expect(extractBasicToken(`Basic\t${token}`)).toBe(token);
    });

    it('複数の空白区切りを受理する', () => {
      expect(extractBasicToken(`Basic   ${token}`)).toBe(token);
    });

    it('末尾の空白・タブを無視する', () => {
      expect(extractBasicToken(`Basic ${token}  `)).toBe(token);
    });

    it('token が複数語なら拒否する', () => {
      expect(extractBasicToken(`Basic ${token} extra`)).toBeNull();
    });

    it('token に制御文字を含む場合は拒否する', () => {
      expect(extractBasicToken(`Basic ${token}${CTL}`)).toBeNull();
    });

    it.each([
      ['token なし', 'Basic'],
      ['区切りのみで token なし', 'Basic '],
      ['空文字列', ''],
      ['スキーム不一致(Bearer)', 'Bearer abc'],
    ])('%s は拒否する', (_label, header) => {
      expect(extractBasicToken(header)).toBeNull();
    });

    it('null を渡しても例外にならず null を返す', () => {
      expect(extractBasicToken(null)).toBeNull();
    });

    it('base64 として不正な値でも抽出はする（デコードは呼び出し元の責務）', () => {
      // 責務境界の明示: base64 妥当性検証は basic-auth-gate.ts の
      // decodeBase64Strict が担当し、このモジュールはスキーム抽出のみを担う。
      expect(extractBasicToken('Basic !!!!')).toBe('!!!!');
    });
  });

  describe('hasBearerScheme', () => {
    it.each(['Bearer abc', 'bearer abc', 'BEARER abc', 'Bearer\tabc'])(
      'Bearer スキームなら true: %s',
      (header) => {
        expect(hasBearerScheme(header)).toBe(true);
      }
    );

    it.each([
      ['Basic', 'Basic abc'],
      ['token なし', 'Bearer'],
      ['区切りのみ', 'Bearer '],
      ['複数語', 'Bearer abc def'],
      ['空文字列', ''],
    ])('%s なら false', (_label, header) => {
      expect(hasBearerScheme(header)).toBe(false);
    });

    it('null なら false', () => {
      expect(hasBearerScheme(null)).toBe(false);
    });

    it('制御文字を含む token でも true を返す（extractBearerToken とは判定が異なる）', () => {
      // hasBearerScheme は「スキームが Bearer か」だけを判定する述語であり、
      // token の妥当性は条件に含めない。この差異は意図的な設計。
      const header = `Bearer abc${CTL}`;
      expect(hasBearerScheme(header)).toBe(true);
      expect(extractBearerToken(header)).toBeNull();
    });
  });

  describe('CONTROL_CHAR_PATTERN', () => {
    it.each([
      ['NUL', '\u0000'],
      ['SOH', '\u0001'],
      ['US', '\u001F'],
      ['DEL', '\u007F'],
    ])('%s にマッチする', (_label, char) => {
      expect(CONTROL_CHAR_PATTERN.test(char)).toBe(true);
    });

    it('タブ(U+0009)にもマッチする（\\u0000-\\u001F の範囲内のため）', () => {
      // extractAuthToken の token 部は [^ \t]+ でキャプチャされるため、
      // タブが token に混入することはなく、この重複は実害がない。
      expect(CONTROL_CHAR_PATTERN.test('\t')).toBe(true);
    });

    it.each([
      ['通常文字', 'abc'],
      ['空白', ' '],
      ['非 ASCII', 'あ'],
    ])('%s にはマッチしない', (_label, value) => {
      expect(CONTROL_CHAR_PATTERN.test(value)).toBe(false);
    });
  });
});
