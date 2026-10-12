import {
  isLikelyJapanese,
  isLikelyJapaneseBody,
  getJapaneseCharRatio,
} from '../language-detection';

describe('isLikelyJapanese', () => {
  describe('Basic functionality', () => {
    it('should return true for Japanese text', () => {
      expect(isLikelyJapanese('こんにちは世界')).toBe(true);
    });

    it('should return false for English text', () => {
      expect(isLikelyJapanese('Hello World')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isLikelyJapanese('')).toBe(false);
    });
  });

  describe('Edge cases - single Japanese character', () => {
    it('should return true for title with single particle (と)', () => {
      expect(isLikelyJapanese('Rancher と Terraform')).toBe(true);
    });

    it('should return true for title with single particle (で)', () => {
      expect(isLikelyJapanese('JavaScriptでABC417 (A-C)')).toBe(true);
    });

    it('should return true for title with single particle (の)', () => {
      expect(isLikelyJapanese('Green Tea Garbage Collector の今')).toBe(true);
    });

    it('should return true for title with 2 Japanese characters', () => {
      expect(isLikelyJapanese('実践 Dev Containers × Claude Code')).toBe(true);
    });
  });

  describe('Edge cases - mixed content', () => {
    it('should return true for mixed title with Japanese content', () => {
      expect(
        isLikelyJapanese(
          'builderscon 2025 開催中止のお知らせ - builderscon::blog'
        )
      ).toBe(true);
    });

    it('should return true for title with Japanese and English', () => {
      expect(
        isLikelyJapanese('Microsoft 365とCopilot Proを統合した最上位プラン')
      ).toBe(true);
    });

    it('should return false for pure English titles with spaces', () => {
      expect(isLikelyJapanese('The best worst hack that saved our bacon')).toBe(
        false
      );
    });

    it('should return false for English title with spaces', () => {
      expect(isLikelyJapanese('Leveling Up My Homelab')).toBe(false);
    });
  });

  describe('Custom threshold', () => {
    it('should respect custom threshold', () => {
      const text = 'JavaScriptで作るメモアプリ';
      expect(isLikelyJapanese(text, 0.1)).toBe(true);
      expect(isLikelyJapanese(text, 0.9)).toBe(true);
    });
  });
});

describe('getJapaneseCharRatio', () => {
  it('should return 1.0 for all Japanese text', () => {
    expect(getJapaneseCharRatio('こんにちは')).toBe(1.0);
  });

  it('should return 0.0 for all English text', () => {
    expect(getJapaneseCharRatio('JavaScript')).toBe(0.0);
  });

  it('should calculate ratio for mixed text', () => {
    const ratio = getJapaneseCharRatio('Hello世界');
    // 'Hello世界' = 7 characters, 2 Japanese characters (世界) = 2/7 ≈ 0.286
    expect(ratio).toBeCloseTo(0.286, 2);
  });

  it('should return 0.0 for empty string', () => {
    expect(getJapaneseCharRatio('')).toBe(0.0);
  });
});

// issue #725: 英語のタイトルを付けた日本語の記事を、英語の記事として翻訳しない
describe('isLikelyJapaneseBody', () => {
  it('英語やコードが多くても、日本語の文章なら true', () => {
    expect(
      isLikelyJapaneseBody(
        '配列の途中の要素にアクセスする命令 変化した結果の要素が1つであっても配列のまま // start = index const names = ["aaa", "bbb"];'
      )
    ).toBe(true);
  });

  it('日本語の UI（カタカナ・漢字）に囲まれた英語の記事は false', () => {
    expect(
      isLikelyJapaneseBody(
        'エクスプローラー About FAQ ヘルプ Donate 登録 サインイン NON-PROFIT Codeberg is maintained by the non-profit organization Codeberg e.V. and hosts over 300,000 projects.'
      )
    ).toBe(false);
  });

  it('英語だけ・中国語の本文は false', () => {
    expect(
      isLikelyJapaneseBody('Codeberg reaches 300k projects this week.')
    ).toBe(false);
    expect(
      isLikelyJapaneseBody('社区版 进行中 在 Warp 之上加入自带提供商能力')
    ).toBe(false);
  });

  it('本文が無い・文字が無いときは false（判定できないので翻訳の対象に残す）', () => {
    expect(isLikelyJapaneseBody(null)).toBe(false);
    expect(isLikelyJapaneseBody(undefined)).toBe(false);
    expect(isLikelyJapaneseBody('')).toBe(false);
    expect(isLikelyJapaneseBody('12345 !!! ---')).toBe(false);
  });

  it('先頭の 3000 字だけで判定する', () => {
    const english = 'English text without kana. '.repeat(120); // 3000 字を超える
    expect(
      isLikelyJapaneseBody(english + 'これは日本語の文章です。'.repeat(50))
    ).toBe(false);
  });
});
