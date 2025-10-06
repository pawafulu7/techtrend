import { isLikelyJapanese, getJapaneseCharRatio } from '../language-detection';

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
      expect(isLikelyJapanese('builderscon 2025 開催中止のお知らせ - builderscon::blog')).toBe(true);
    });

    it('should return true for title with Japanese and English', () => {
      expect(isLikelyJapanese('Microsoft 365とCopilot Proを統合した最上位プラン')).toBe(true);
    });

    it('should return false for pure English titles with spaces', () => {
      expect(isLikelyJapanese('The best worst hack that saved our bacon')).toBe(false);
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
