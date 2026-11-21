/**
 * lib/auth/authorization-header.ts の単体テスト。
 *
 * 純関数のみで構成されるモジュールのため NextRequest 等のモックは不要。
 * ゲート（basic-auth-gate）と CSRF の判定（csrf-protection）が同じ受理判定になることを
 * 保証するのがこのモジュールの目的なので、受理・拒否の境界を網羅する。
 */

import {
  CONTROL_CHAR_PATTERN,
  extractBasicToken,
  hasBearerScheme,
} from '@/lib/auth/authorization-header';

const CTL = '\u0001';
const DEL = '\u007F';

describe('authorization-header', () => {
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

    it('制御文字を含む token でも true を返す（token の妥当性は見ない）', () => {
      // hasBearerScheme は「スキームが Bearer か」だけを判定する述語であり、
      // token の妥当性は条件に含めない。この差異は意図的な設計。
      const header = `Bearer abc${CTL}`;
      expect(hasBearerScheme(header)).toBe(true);
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
