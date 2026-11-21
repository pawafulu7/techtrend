/**
 * lib/auth/authorization-header.ts の単体テスト。
 *
 * 純関数のみで構成されるモジュールのため NextRequest 等のモックは不要。
 * CSRF の判定（csrf-protection）が使う Bearer スキームの判定の、受理・拒否の境界を網羅する。
 */

import { hasBearerScheme } from '@/lib/auth/authorization-header';

const CTL = '\u0001';

describe('authorization-header', () => {
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
});
